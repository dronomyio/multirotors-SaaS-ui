import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import type { Invoice } from '@/types/chat';
import * as Haptics from 'expo-haptics';

interface Props {
  invoice: Invoice;
  onAccept?: () => void;
  isAccepting?: boolean;
  onShare?: () => void;
  isSharing?: boolean;
}

export function InvoiceCard({ invoice, onAccept, isAccepting, onShare, isSharing }: Props) {
  const colors = useColors();
  const [expanded, setExpanded] = useState(true);

  const fmt = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: invoice.currency || 'USD',
    }).format(n);

  const handleAccept = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    onAccept?.();
  };

  const handleShare = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onShare?.();
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.primary }]}>
      {/* Header */}
      <Pressable
        style={styles.header}
        onPress={() => setExpanded((v) => !v)}
      >
        <View style={styles.headerLeft}>
          <View style={[styles.badge, { backgroundColor: colors.primary }]}>
            <Text style={[styles.badgeText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
              INVOICE
            </Text>
          </View>
          <Text style={[styles.total, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
            {fmt(invoice.total)}
          </Text>
        </View>
        <Feather
          name={expanded ? 'chevron-up' : 'chevron-down'}
          size={18}
          color={colors.mutedForeground}
        />
      </Pressable>

      {expanded && (
        <>
          {/* Delivery estimate */}
          <Text style={[styles.delivery, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Est. delivery: {invoice.estimatedDeliveryDays} days
          </Text>

          {/* Line items */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          {invoice.items.map((item, i) => (
            <View key={i} style={styles.lineItem}>
              <View style={styles.lineItemLeft}>
                <Text
                  style={[styles.itemTitle, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
                <View style={styles.itemMeta}>
                  <View
                    style={[
                      styles.sourceBadge,
                      {
                        backgroundColor:
                          item.source === 'store'
                            ? colors.secondary
                            : colors.muted,
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.sourceBadgeText,
                        { color: item.source === 'store' ? colors.primary : colors.mutedForeground, fontFamily: 'Inter_600SemiBold' },
                      ]}
                    >
                      {item.source === 'store' ? 'IN STOCK' : 'EXTERNAL'}
                    </Text>
                  </View>
                  <Text style={[styles.qty, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                    ×{item.quantity}
                  </Text>
                </View>
              </View>
              <Text style={[styles.lineTotal, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}>
                {fmt(item.price * item.quantity)}
              </Text>
            </View>
          ))}

          {/* Totals */}
          <View style={[styles.divider, { backgroundColor: colors.border }]} />
          <View style={styles.totalsBlock}>
            <TotalRow label="Subtotal" value={fmt(invoice.subtotal)} colors={colors} />
            <TotalRow label="Tax" value={fmt(invoice.tax)} colors={colors} />
            <TotalRow label="Shipping" value={fmt(invoice.shipping)} colors={colors} />
            <View style={[styles.totalFinalRow]}>
              <Text style={[styles.totalFinalLabel, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}>
                TOTAL
              </Text>
              <Text style={[styles.totalFinalValue, { color: colors.primary, fontFamily: 'Inter_700Bold' }]}>
                {fmt(invoice.total)}
              </Text>
            </View>
          </View>

          {/* CTA row */}
          {(onAccept || onShare) && (
            <View style={styles.ctaRow}>
              {onShare && (
                <Pressable
                  style={({ pressed }) => [
                    styles.shareBtn,
                    {
                      backgroundColor: colors.secondary,
                      borderColor: colors.border,
                      opacity: pressed || isSharing || isAccepting ? 0.7 : 1,
                    },
                  ]}
                  onPress={handleShare}
                  disabled={isSharing || isAccepting}
                >
                  {isSharing ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      <Feather name="share-2" size={15} color={colors.primary} />
                      <Text style={[styles.shareBtnText, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
                        SHARE
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
              {onAccept && (
                <Pressable
                  style={({ pressed }) => [
                    styles.cta,
                    onShare ? styles.ctaFlex : null,
                    { backgroundColor: colors.primary, opacity: pressed || isAccepting || isSharing ? 0.8 : 1 },
                  ]}
                  onPress={handleAccept}
                  disabled={isAccepting || isSharing}
                >
                  {isAccepting ? (
                    <ActivityIndicator size="small" color={colors.primaryForeground} />
                  ) : (
                    <>
                      <Feather name="shopping-cart" size={16} color={colors.primaryForeground} />
                      <Text style={[styles.ctaText, { color: colors.primaryForeground, fontFamily: 'Inter_700Bold' }]}>
                        ACCEPT & CHECKOUT
                      </Text>
                    </>
                  )}
                </Pressable>
              )}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function TotalRow({
  label,
  value,
  colors,
}: {
  label: string;
  value: string;
  colors: ReturnType<typeof useColors>;
}) {
  return (
    <View style={styles.totalRow}>
      <Text style={[styles.totalLabel, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
        {label}
      </Text>
      <Text style={[styles.totalValue, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1.5,
    overflow: 'hidden',
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 14,
    gap: 0,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
  badgeText: {
    fontSize: 10,
    letterSpacing: 1,
  },
  total: {
    fontSize: 20,
  },
  delivery: {
    fontSize: 12,
    marginBottom: 10,
  },
  divider: {
    height: 1,
    marginVertical: 10,
  },
  lineItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 8,
  },
  lineItemLeft: {
    flex: 1,
    gap: 4,
  },
  itemTitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  itemMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  sourceBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 3,
  },
  sourceBadgeText: {
    fontSize: 9,
    letterSpacing: 0.5,
  },
  qty: {
    fontSize: 12,
  },
  lineTotal: {
    fontSize: 13,
  },
  totalsBlock: {
    gap: 6,
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  totalLabel: {
    fontSize: 13,
  },
  totalValue: {
    fontSize: 13,
  },
  totalFinalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  totalFinalLabel: {
    fontSize: 14,
    letterSpacing: 1,
  },
  totalFinalValue: {
    fontSize: 18,
  },
  ctaRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  shareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    borderWidth: 1,
  },
  shareBtnText: {
    fontSize: 13,
    letterSpacing: 1,
  },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 14,
    borderRadius: 8,
  },
  ctaFlex: {
    flex: 1,
  },
  ctaText: {
    fontSize: 13,
    letterSpacing: 1,
  },
});
