import React, { useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  RefreshControl,
  AppState,
  type AppStateStatus,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import {
  useListOpenaiConversations,
  useCreateOpenaiConversation,
  useDeleteOpenaiConversation,
  getListOpenaiConversationsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import type { OpenaiConversation } from '@workspace/api-client-react';
import * as Haptics from 'expo-haptics';

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } else if (diffDays === 1) {
    return 'Yesterday';
  } else if (diffDays < 7) {
    return d.toLocaleDateString([], { weekday: 'short' });
  } else {
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
  }
}

function ConversationItem({
  item,
  onDelete,
}: {
  item: OpenaiConversation;
  onDelete: (id: number) => void;
}) {
  const colors = useColors();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.item,
        {
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.75 : 1,
        },
      ]}
      onPress={() => {
        Haptics.selectionAsync();
        router.push(`/chat/${item.id}`);
      }}
    >
      <View style={styles.itemLeft}>
        <View style={[styles.iconBg, { backgroundColor: colors.secondary }]}>
          <Feather name="message-circle" size={18} color={colors.primary} />
        </View>
        <View style={styles.itemText}>
          <Text
            style={[styles.itemTitle, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}
            numberOfLines={1}
          >
            {item.title}
          </Text>
          <Text style={[styles.itemDate, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            {formatDate(item.createdAt)}
          </Text>
        </View>
      </View>
      <Pressable
        style={styles.deleteBtn}
        onPress={(e) => {
          e.stopPropagation();
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          onDelete(item.id);
        }}
        hitSlop={12}
      >
        <Feather name="trash-2" size={16} color={colors.mutedForeground} />
      </Pressable>
    </Pressable>
  );
}

export default function ConversationsScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const { data: conversations = [], isLoading, refetch, isRefetching } =
    useListOpenaiConversations();

  // Refetch when the app returns from background
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  // Debounce so notification and AppState listeners don't both fire within the
  // same background→active transition (e.g. when the user taps a notification).
  const lastRefetchRef = useRef<number>(0);
  const refetchOnce = useCallback(() => {
    const now = Date.now();
    if (now - lastRefetchRef.current > 500) {
      lastRefetchRef.current = now;
      refetch();
    }
  }, [refetch]);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState: AppStateStatus) => {
      if (appStateRef.current.match(/inactive|background/) && nextState === 'active') {
        refetchOnce();
      }
      appStateRef.current = nextState;
    });
    return () => subscription.remove();
  }, [refetchOnce]);

  // Refetch the conversations list whenever a push notification arrives (in
  // foreground) or the user taps one to open the app.
  useEffect(() => {
    const foregroundSub = Notifications.addNotificationReceivedListener(() => {
      refetchOnce();
    });

    const responseSub = Notifications.addNotificationResponseReceivedListener(() => {
      refetchOnce();
    });

    return () => {
      foregroundSub.remove();
      responseSub.remove();
    };
  }, [refetchOnce]);

  const createConversation = useCreateOpenaiConversation({
    mutation: {
      onSuccess: (conv) => {
        queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
        router.push(`/chat/${conv.id}`);
      },
    },
  });

  const deleteConversation = useDeleteOpenaiConversation({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
      },
    },
  });

  const handleNew = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    createConversation.mutate({ data: { title: 'New consultation' } });
  }, [createConversation]);

  const handleDelete = useCallback(
    (id: number) => {
      deleteConversation.mutate({ id });
    },
    [deleteConversation],
  );

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border }]}>
        <View style={styles.headerWordmark}>
          <Text style={[styles.wordmarkMain, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
            MULTI
          </Text>
          <Text style={[styles.wordmarkAccent, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
            ROTORS
          </Text>
        </View>
        <Pressable
          style={({ pressed }) => [
            styles.newBtn,
            { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
          ]}
          onPress={handleNew}
          disabled={createConversation.isPending}
        >
          {createConversation.isPending ? (
            <ActivityIndicator size="small" color={colors.primaryForeground} />
          ) : (
            <Feather name="plus" size={20} color={colors.primaryForeground} />
          )}
        </Pressable>
      </View>

      {/* List */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ConversationItem item={item} onDelete={handleDelete} />
          )}
          contentContainerStyle={[
            styles.list,
            { paddingBottom: bottomPad + 20 },
            conversations.length === 0 && styles.listEmpty,
          ]}
          scrollEnabled={!!conversations.length}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={colors.primary}
            />
          }
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={[styles.emptyIcon, { backgroundColor: colors.secondary }]}>
                <Feather name="message-circle" size={32} color={colors.mutedForeground} />
              </View>
              <Text style={[styles.emptyTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                No consultations yet
              </Text>
              <Text style={[styles.emptySubtitle, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                Tap + to ask the AI drone expert anything
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 16,
    borderBottomWidth: 1,
  },
  headerWordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  wordmarkMain: {
    fontSize: 22,
    letterSpacing: 2,
  },
  wordmarkAccent: {
    fontSize: 22,
    letterSpacing: 2,
  },
  newBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  list: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  listEmpty: {
    flex: 1,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  iconBg: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemText: {
    flex: 1,
    gap: 3,
  },
  itemTitle: {
    fontSize: 15,
  },
  itemDate: {
    fontSize: 12,
  },
  deleteBtn: {
    padding: 4,
    marginLeft: 8,
  },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyTitle: {
    fontSize: 18,
    textAlign: 'center',
  },
  emptySubtitle: {
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});
