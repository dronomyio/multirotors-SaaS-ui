import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  TextInput,
  Pressable,
  Platform,
  ActivityIndicator,
  Linking,
  Alert,
  Share,
  AppState,
  type AppStateStatus,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { KeyboardAvoidingView } from 'react-native-keyboard-controller';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { fetch } from 'expo/fetch';
import { useColors } from '@/hooks/useColors';
import {
  useGetOpenaiConversation,
  useCreateDraftOrder,
  getListOpenaiConversationsQueryKey,
  getGetOpenaiConversationQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { MessageBubble } from '@/components/MessageBubble';
import { TypingIndicator } from '@/components/TypingIndicator';
import type { ChatMessage, Invoice, SseEvent } from '@/types/chat';
import * as Haptics from 'expo-haptics';

let _msgCounter = 0;
function uid(): string {
  _msgCounter++;
  return `msg-${Date.now()}-${_msgCounter}-${Math.random().toString(36).substr(2, 6)}`;
}

/** Stable hash of an invoice's line items so we can detect when the quote changed. */
function invoiceHash(invoice: Invoice): string {
  const key = invoice.items
    .map((i) => `${i.title}|${i.quantity}|${i.price}|${i.source}|${i.variantId ?? ''}`)
    .join('::');
  return key;
}

function StatusBubble({ text }: { text: string }) {
  const colors = useColors();
  return (
    <View style={styles.statusRow}>
      <Text style={[styles.statusText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
        {text}
      </Text>
    </View>
  );
}

export default function ChatScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { id, q, from } = useLocalSearchParams<{ id: string; q?: string; from?: string }>();
  const conversationId = parseInt(id, 10);

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputText, setInputText] = useState(typeof q === 'string' ? decodeURIComponent(q) : '');
  const [isStreaming, setIsStreaming] = useState(false);
  const [showTyping, setShowTyping] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [acceptingInvoiceId, setAcceptingInvoiceId] = useState<string | null>(null);
  const [sharingInvoiceId, setSharingInvoiceId] = useState<string | null>(null);
  const initializedRef = useRef(false);
  const inputRef = useRef<TextInput>(null);

  /**
   * Cache draft order results per invoice message.
   * Key: message ID. Value: { checkoutUrl, invoiceHash }.
   * The invoiceHash lets us detect when the invoice content has changed so we
   * can bust the cached URL and create a fresh draft order.
   */
  const draftOrderCache = useRef<Map<string, { checkoutUrl: string; invoiceHash: string }>>(new Map());

  const { data: conversation, isLoading, refetch: refetchConversation } = useGetOpenaiConversation(conversationId, {
    query: {
      enabled: !isNaN(conversationId),
      queryKey: getGetOpenaiConversationQueryKey(conversationId),
    },
  });

  // Refetch conversation when the app returns from background so invoices from
  // previous sessions are always visible without a manual pull-to-refresh.
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // Track when we last refetched so notification and AppState listeners don't
  // both fire within the same transition (e.g. tapping a notification).
  const lastRefetchRef = useRef<number>(0);
  const refetchOnce = useCallback(() => {
    const now = Date.now();
    if (now - lastRefetchRef.current > 500) {
      lastRefetchRef.current = now;
      refetchConversation();
    }
  }, [refetchConversation]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        refetchOnce();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [refetchOnce]);

  // Refetch when a push notification arrives while the screen is in the
  // foreground, or when the user opens the app by tapping a notification.
  // Filters to notifications that carry a matching conversationId in their data.
  useEffect(() => {
    const isForThisConversation = (data: Record<string, unknown> | undefined) => {
      if (!data) return true; // no data — refetch to be safe
      if ('conversationId' in data) {
        return Number(data.conversationId) === conversationId;
      }
      return true; // unknown payload — refetch to be safe
    };

    // Foreground notification received
    const foregroundSub = Notifications.addNotificationReceivedListener((notification) => {
      if (isForThisConversation(notification.request.content.data as Record<string, unknown>)) {
        refetchOnce();
      }
    });

    // User tapped a notification to open / resume the app
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      if (isForThisConversation(response.notification.request.content.data as Record<string, unknown>)) {
        refetchOnce();
      }
    });

    return () => {
      foregroundSub.remove();
      responseSub.remove();
    };
  }, [conversationId, refetchOnce]);

  // Load existing messages once
  useEffect(() => {
    if (conversation?.messages && !initializedRef.current) {
      const mapped: ChatMessage[] = conversation.messages.map((m) => ({
        id: String(m.id),
        role: m.role as 'user' | 'assistant',
        content: m.content,
        invoice: m.metadata ? (m.metadata as unknown as Invoice) : undefined,
      }));
      setMessages(mapped);
      initializedRef.current = true;
    }
  }, [conversation?.messages]);

  const createDraftOrder = useCreateDraftOrder();

  const doCheckout = useCallback(
    async (msgId: string, allItems: Invoice['items']) => {
      // Prevent concurrent draft-order mutations for any invoice
      if (acceptingInvoiceId !== null || sharingInvoiceId !== null) return;
      setAcceptingInvoiceId(msgId);
      try {
        const lineItems = allItems.map((item) => ({
          type: item.source === 'store' ? ('shopify' as const) : ('external' as const),
          variantId: item.variantId ?? undefined,
          title: item.title,
          price: item.price,
          quantity: item.quantity,
          imageUrl: item.imageUrl ?? undefined,
        }));

        const result = await createDraftOrder.mutateAsync({
          id: conversationId,
          data: { items: lineItems },
        });

        await Linking.openURL(result.checkoutUrl);
      } catch (err) {
        console.error('Draft order failed:', err);
        Alert.alert('Checkout Error', 'Could not create checkout. Please try again.');
      } finally {
        setAcceptingInvoiceId(null);
      }
    },
    [conversationId, createDraftOrder, acceptingInvoiceId, sharingInvoiceId],
  );

  const handleAcceptInvoice = useCallback(
    (msgId: string, invoice: Invoice) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

      const storeItems = invoice.items.filter(
        (i) => i.source === 'store' && i.variantId,
      );
      const externalItems = invoice.items.filter((i) => i.source === 'external');

      // External-only invoice — cannot proceed to Shopify checkout at all
      if (storeItems.length === 0) {
        Alert.alert(
          'External Items Only',
          'This quote contains items that must be sourced from third-party suppliers — they cannot be added to the Shopify checkout. Contact us directly to purchase these items.',
          [{ text: 'Got it' }],
        );
        return;
      }

      // Mixed invoice — warn that external items will be omitted from the cart
      if (externalItems.length > 0) {
        const ext = externalItems.length;
        const str = storeItems.length;
        Alert.alert(
          'Mixed Order',
          `${str} store item${str !== 1 ? 's' : ''} will be added to your Shopify cart.\n\n${ext} external item${ext !== 1 ? 's' : ''} (marked EXTERNAL) must be sourced separately and will not appear in this checkout.`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: `Checkout ${str} Store Item${str !== 1 ? 's' : ''}`,
              onPress: () => doCheckout(msgId, invoice.items),
            },
          ],
        );
        return;
      }

      // All store items — proceed immediately
      doCheckout(msgId, invoice.items);
    },
    [doCheckout],
  );

  const handleShareInvoice = useCallback(
    async (msgId: string, invoice: Invoice) => {
      // Prevent concurrent draft-order mutations for any invoice
      if (acceptingInvoiceId !== null || sharingInvoiceId !== null) return;
      setSharingInvoiceId(msgId);
      try {
        // Build formatted text for the share payload
        const fmt = (n: number) =>
          new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: invoice.currency || 'USD',
          }).format(n);

        const lineItemLines = invoice.items
          .map(
            (item) =>
              `• ${item.title} ×${item.quantity}  ${fmt(item.price * item.quantity)}${item.source === 'external' ? ' (external)' : ''}`,
          )
          .join('\n');

        const totalsLines = [
          `Subtotal: ${fmt(invoice.subtotal)}`,
          `Tax: ${fmt(invoice.tax)}`,
          `Shipping: ${fmt(invoice.shipping)}`,
          `TOTAL: ${fmt(invoice.total)}`,
        ].join('\n');

        // Obtain a checkout URL — reuse a cached draft order when the invoice
        // hasn't changed, otherwise create a fresh one and cache the result.
        let checkoutLine = '';
        try {
          const hash = invoiceHash(invoice);
          const cached = draftOrderCache.current.get(msgId);
          let checkoutUrl: string;

          if (cached && cached.invoiceHash === hash) {
            // Same invoice content — reuse the existing draft order URL
            checkoutUrl = cached.checkoutUrl;
          } else {
            // Invoice is new or has changed — create a fresh draft order
            const lineItems = invoice.items.map((item) => ({
              type: item.source === 'store' ? ('shopify' as const) : ('external' as const),
              variantId: item.variantId ?? undefined,
              title: item.title,
              price: item.price,
              quantity: item.quantity,
              imageUrl: item.imageUrl ?? undefined,
            }));
            const result = await createDraftOrder.mutateAsync({
              id: conversationId,
              data: { items: lineItems },
            });
            checkoutUrl = result.checkoutUrl;
            // Cache so subsequent shares of the same invoice skip the API call
            draftOrderCache.current.set(msgId, { checkoutUrl, invoiceHash: hash });
          }

          checkoutLine = `\nCheckout link: ${checkoutUrl}`;
        } catch {
          // checkout URL is best-effort; share quote text even if it fails
        }

        const message = `Quote from Multirotors.store\n\n${lineItemLines}\n\n${totalsLines}\nEst. delivery: ${invoice.estimatedDeliveryDays} days${checkoutLine}`;

        if (Platform.OS === 'web') {
          // Use Web Share API when available, fall back to clipboard
          if (typeof navigator !== 'undefined' && navigator.share) {
            await navigator.share({ title: 'Drone Quote', text: message });
          } else if (typeof navigator !== 'undefined' && navigator.clipboard) {
            await navigator.clipboard.writeText(message);
            Alert.alert('Copied', 'Quote copied to clipboard.');
          }
        } else {
          await Share.share({ message });
        }
      } catch (err: unknown) {
        // User cancelled the share sheet — not an error worth alerting
        if (err instanceof Error && err.message !== 'User canceled share') {
          console.error('Share failed:', err);
        }
      } finally {
        setSharingInvoiceId(null);
      }
    },
    [conversationId, createDraftOrder, acceptingInvoiceId, sharingInvoiceId],
  );

  const handleSend = useCallback(async () => {
    const text = inputText.trim();
    if (!text || isStreaming || isNaN(conversationId)) return;

    setInputText('');
    setIsStreaming(true);
    setShowTyping(true);
    setStatusText('');

    const userMsg: ChatMessage = { id: uid(), role: 'user', content: text };
    setMessages((prev) => [...prev, userMsg]);

    const baseUrl = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

    let fullText = '';
    let assistantMsgId: string | null = null;
    let capturedInvoice: Invoice | undefined;

    try {
      const response = await fetch(
        `${baseUrl}/api/openai/conversations/${conversationId}/messages`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
          },
          body: JSON.stringify({ content: text }),
        },
      );

      if (!response.ok) throw new Error('Request failed');

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No stream body');

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (!raw) continue;

          let evt: SseEvent;
          try {
            evt = JSON.parse(raw) as SseEvent;
          } catch {
            continue;
          }

          if (evt.type === 'status') {
            setStatusText(evt.message);
          } else if (evt.type === 'text') {
            setShowTyping(false);
            setStatusText('');
            fullText += evt.content;

            if (!assistantMsgId) {
              assistantMsgId = uid();
              const newMsg: ChatMessage = {
                id: assistantMsgId,
                role: 'assistant',
                content: fullText,
              };
              setMessages((prev) => [...prev, newMsg]);
            } else {
              const finalId = assistantMsgId;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === finalId ? { ...m, content: fullText } : m,
                ),
              );
            }
          } else if (evt.type === 'composition') {
            capturedInvoice = evt.data;
            if (assistantMsgId) {
              const finalId = assistantMsgId;
              setMessages((prev) =>
                prev.map((m) =>
                  m.id === finalId ? { ...m, invoice: capturedInvoice } : m,
                ),
              );
            }
          } else if (evt.type === 'done') {
            // stream complete
          }
        }
      }
    } catch (err) {
      setShowTyping(false);
      setStatusText('');
      const errMsg: ChatMessage = {
        id: uid(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      setIsStreaming(false);
      setShowTyping(false);
      setStatusText('');
      queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
    }
  }, [inputText, isStreaming, conversationId, queryClient]);

  const reversedMessages = [...messages].reverse();
  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Custom header */}
      <View
        style={[
          styles.header,
          { paddingTop: topPad + 10, borderBottomColor: colors.border, backgroundColor: colors.background },
        ]}
      >
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => {
            if (from) {
              router.push(`/shop/${decodeURIComponent(from)}`);
            } else {
              router.back();
            }
          }}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}
          numberOfLines={1}
        >
          {conversation?.title ?? 'Consultation'}
        </Text>
        <View style={styles.headerRight} />
      </View>

      {/* Chat area */}
      <KeyboardAvoidingView
        style={styles.flex}
        behavior="padding"
        keyboardVerticalOffset={0}
      >
        {isLoading && !initializedRef.current ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : (
          <FlatList
            data={reversedMessages}
            keyExtractor={(item) => item.id}
            inverted={messages.length > 0}
            renderItem={({ item }) => (
              <MessageBubble
                message={item}
                onAcceptInvoice={
                  item.role === 'assistant' && item.invoice
                    ? (invoice) => handleAcceptInvoice(item.id, invoice)
                    : undefined
                }
                isAccepting={acceptingInvoiceId === item.id}
                onShareInvoice={
                  item.role === 'assistant' && item.invoice
                    ? (invoice) => handleShareInvoice(item.id, invoice)
                    : undefined
                }
                isSharing={sharingInvoiceId === item.id}
              />
            )}
            contentContainerStyle={styles.messageList}
            keyboardDismissMode="interactive"
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
            ListHeaderComponent={
              showTyping ? (
                <View>
                  {statusText ? <StatusBubble text={statusText} /> : null}
                  <TypingIndicator />
                </View>
              ) : null
            }
            ListFooterComponent={
              messages.length === 0 ? (
                <View style={styles.emptyChat}>
                  <View style={[styles.emptyIconBg, { backgroundColor: colors.secondary }]}>
                    <Feather name="zap" size={28} color={colors.primary} />
                  </View>
                  <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                    Drone Expert AI
                  </Text>
                  <Text style={[styles.emptySub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    Ask about quads, parts, builds, or get an instant quote
                  </Text>
                </View>
              ) : null
            }
          />
        )}

        {/* Input bar */}
        <View
          style={[
            styles.inputBar,
            {
              paddingBottom: bottomPad + 10,
              backgroundColor: colors.background,
              borderTopColor: colors.border,
            },
          ]}
        >
          <View style={[styles.inputWrapper, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <TextInput
              ref={inputRef}
              style={[
                styles.input,
                { color: colors.foreground, fontFamily: 'Inter_400Regular' },
              ]}
              placeholder="Ask about drones, builds, parts..."
              placeholderTextColor={colors.mutedForeground}
              value={inputText}
              onChangeText={setInputText}
              multiline
              maxLength={1000}
              blurOnSubmit={false}
              onSubmitEditing={handleSend}
            />
            <Pressable
              style={({ pressed }) => [
                styles.sendBtn,
                {
                  backgroundColor:
                    inputText.trim() && !isStreaming ? colors.primary : colors.muted,
                  opacity: pressed ? 0.8 : 1,
                },
              ]}
              onPress={() => {
                handleSend();
                inputRef.current?.focus();
              }}
              disabled={!inputText.trim() || isStreaming}
            >
              {isStreaming ? (
                <ActivityIndicator size="small" color={colors.mutedForeground} />
              ) : (
                <Feather
                  name="send"
                  size={16}
                  color={inputText.trim() ? colors.primaryForeground : colors.mutedForeground}
                />
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  flex: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    flex: 1,
    fontSize: 16,
    textAlign: 'center',
  },
  headerRight: {
    width: 36,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  messageList: {
    paddingVertical: 16,
    gap: 0,
  },
  statusRow: {
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  statusText: {
    fontSize: 12,
    fontStyle: 'italic',
  },
  emptyChat: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
    gap: 14,
  },
  emptyIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 20,
    textAlign: 'center',
  },
  emptySub: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  inputBar: {
    paddingHorizontal: 12,
    paddingTop: 10,
    borderTopWidth: 1,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    borderRadius: 24,
    borderWidth: 1,
    paddingLeft: 16,
    paddingRight: 6,
    paddingVertical: 6,
    gap: 8,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 22,
    maxHeight: 120,
    paddingTop: 4,
    paddingBottom: 4,
  },
  sendBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
