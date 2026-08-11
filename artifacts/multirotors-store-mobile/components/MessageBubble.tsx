import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import { useColors } from '@/hooks/useColors';
import type { ChatMessage } from '@/types/chat';
import { InvoiceCard } from './InvoiceCard';
import type { Invoice } from '@/types/chat';

interface Props {
  message: ChatMessage;
  onAcceptInvoice?: (invoice: Invoice) => void;
  isAccepting?: boolean;
  onShareInvoice?: (invoice: Invoice) => void;
  isSharing?: boolean;
}

export function MessageBubble({ message, onAcceptInvoice, isAccepting, onShareInvoice, isSharing }: Props) {
  const colors = useColors();
  const isUser = message.role === 'user';

  return (
    <View style={[styles.row, isUser ? styles.rowUser : styles.rowAssistant]}>
      <View style={styles.column}>
        <View
          style={[
            styles.bubble,
            isUser
              ? [styles.bubbleUser, { backgroundColor: colors.primary }]
              : [styles.bubbleAssistant, { backgroundColor: colors.card, borderColor: colors.border }],
          ]}
        >
          <Text
            style={[
              styles.text,
              {
                color: isUser ? colors.primaryForeground : colors.foreground,
                fontFamily: 'Inter_400Regular',
              },
            ]}
          >
            {message.content}
          </Text>
        </View>

        {message.invoice && !isUser && (
          <InvoiceCard
            invoice={message.invoice}
            onAccept={onAcceptInvoice ? () => onAcceptInvoice(message.invoice!) : undefined}
            isAccepting={isAccepting}
            onShare={onShareInvoice ? () => onShareInvoice(message.invoice!) : undefined}
            isSharing={isSharing}
          />
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  rowUser: {
    alignItems: 'flex-end',
  },
  rowAssistant: {
    alignItems: 'flex-start',
  },
  column: {
    maxWidth: '88%',
    gap: 8,
  },
  bubble: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  bubbleUser: {
    borderBottomRightRadius: 4,
  },
  bubbleAssistant: {
    borderBottomLeftRadius: 4,
  },
  text: {
    fontSize: 15,
    lineHeight: 22,
  },
});
