import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  Pressable,
  Platform,
  ActivityIndicator,
  Linking,
  Alert,
  Modal,
  StatusBar,
  Dimensions,
  PanResponder,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router, useLocalSearchParams } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import {
  useCollectionProducts,
  FEATURED_CATEGORIES,
  type ShopifyProduct,
} from '@/lib/shopify';
import {
  useCreateOpenaiConversation,
  getListOpenaiConversationsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

const SHOPIFY_BASE = 'https://multirotors.store';
const LIMIT = 12;
const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');

function formatPrice(price: string) {
  const n = parseFloat(price);
  if (isNaN(n)) return price;
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

// ─── Full-screen image viewer modal ─────────────────────────────────────────

interface ImageViewerProps {
  images: Array<{ src: string }>;
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}

function ImageViewer({ images, initialIndex, visible, onClose }: ImageViewerProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const listRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();

  // Reset to correct page when modal opens
  React.useEffect(() => {
    if (visible) {
      setCurrentIndex(initialIndex);
      // Scroll to the correct item after the list mounts
      setTimeout(() => {
        listRef.current?.scrollToIndex({ index: initialIndex, animated: false });
      }, 50);
    }
  }, [visible, initialIndex]);

  // Swipe-down-to-dismiss pan responder
  const translateY = useRef(0);
  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, gestureState) =>
        Math.abs(gestureState.dy) > 10 && Math.abs(gestureState.dy) > Math.abs(gestureState.dx),
      onPanResponderMove: (_, gestureState) => {
        translateY.current = gestureState.dy;
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > 80) {
          onClose();
        }
        translateY.current = 0;
      },
    }),
  ).current;

  const onViewableItemsChanged = useRef(({ viewableItems }: any) => {
    if (viewableItems.length > 0) {
      setCurrentIndex(viewableItems[0].index ?? 0);
    }
  }).current;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <StatusBar hidden />
      <View style={viewer.backdrop} {...panResponder.panHandlers}>
        {/* Close button */}
        <Pressable
          style={({ pressed }) => [viewer.closeBtn, { top: insets.top + 8, opacity: pressed ? 0.7 : 1 }]}
          onPress={onClose}
          hitSlop={16}
        >
          <Feather name="x" size={26} color="#fff" />
        </Pressable>

        {/* Image pager */}
        <FlatList
          ref={listRef}
          data={images}
          keyExtractor={(_, i) => String(i)}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({
            length: SCREEN_W,
            offset: SCREEN_W * index,
            index,
          })}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          renderItem={({ item }) => (
            <Pressable style={viewer.imagePage} onPress={onClose}>
              <Image
                source={{ uri: item.src }}
                style={viewer.fullImage}
                resizeMode="contain"
              />
            </Pressable>
          )}
        />

        {/* Dot indicators — only when multiple images */}
        {images.length > 1 && (
          <View style={[viewer.dots, { bottom: insets.bottom + 20 }]}>
            {images.map((_, i) => (
              <View
                key={i}
                style={[
                  viewer.dot,
                  i === currentIndex ? viewer.dotActive : viewer.dotInactive,
                ]}
              />
            ))}
          </View>
        )}
      </View>
    </Modal>
  );
}

const viewer = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.95)',
    justifyContent: 'center',
  },
  closeBtn: {
    position: 'absolute',
    right: 20,
    zIndex: 10,
    padding: 6,
    backgroundColor: 'rgba(0,0,0,0.45)',
    borderRadius: 20,
  },
  imagePage: {
    width: SCREEN_W,
    height: SCREEN_H,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fullImage: {
    width: SCREEN_W,
    height: SCREEN_H * 0.8,
  },
  dots: {
    position: 'absolute',
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
  },
  dotActive: {
    backgroundColor: '#fff',
  },
  dotInactive: {
    backgroundColor: 'rgba(255,255,255,0.35)',
  },
});

// ─── Product card ────────────────────────────────────────────────────────────

function ProductCard({
  product,
  onAskAI,
  askingProductId,
  onImagePress,
}: {
  product: ShopifyProduct;
  onAskAI: (product: ShopifyProduct) => void;
  askingProductId: number | null;
  onImagePress: (product: ShopifyProduct) => void;
}) {
  const colors = useColors();
  const imgSrc = product.images[0]?.src;
  const variant = product.variants[0];
  const price = variant ? formatPrice(variant.price) : null;
  const available = variant?.available ?? false;
  const isAsking = askingProductId === product.id;

  const handleBuy = useCallback(() => {
    Linking.openURL(`${SHOPIFY_BASE}/products/${product.handle}`).catch(() => {
      Alert.alert('Error', 'Could not open product page.');
    });
  }, [product.handle]);

  return (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <Pressable
        onPress={() => onImagePress(product)}
        style={({ pressed }) => [{ opacity: pressed ? 0.85 : 1 }]}
        accessibilityLabel={`View images for ${product.title}`}
        accessibilityRole="button"
      >
        {imgSrc ? (
          <Image
            source={{ uri: imgSrc }}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.cardImagePlaceholder, { backgroundColor: colors.muted }]}>
            <Feather name="image" size={28} color={colors.mutedForeground} />
          </View>
        )}
      </Pressable>

      <View style={styles.cardBody}>
        <Text
          style={[styles.cardTitle, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}
          numberOfLines={2}
        >
          {product.title}
        </Text>

        <View style={styles.cardMeta}>
          {price && (
            <Text style={[styles.cardPrice, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
              {price}
            </Text>
          )}
          {!available && (
            <Text style={[styles.cardOos, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Out of stock
            </Text>
          )}
        </View>

        <View style={styles.cardActions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.buyBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={handleBuy}
          >
            <Feather name="external-link" size={14} color={colors.primaryForeground} />
            <Text style={[styles.actionBtnText, { color: colors.primaryForeground, fontFamily: 'Inter_600SemiBold' }]}>
              Buy
            </Text>
          </Pressable>

          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              styles.aiBtn,
              { borderColor: colors.border, backgroundColor: colors.secondary, opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={() => onAskAI(product)}
            disabled={isAsking}
          >
            {isAsking ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Feather name="message-circle" size={14} color={colors.primary} />
                <Text style={[styles.actionBtnText, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
                  Ask AI
                </Text>
              </>
            )}
          </Pressable>
        </View>
      </View>
    </View>
  );
}

// ─── Collection screen ───────────────────────────────────────────────────────

export default function CollectionScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { handle } = useLocalSearchParams<{ handle: string }>();
  const [page, setPage] = useState(1);
  const [allProducts, setAllProducts] = useState<ShopifyProduct[]>([]);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [askingProductId, setAskingProductId] = useState<number | null>(null);

  // Image viewer state
  const [viewerProduct, setViewerProduct] = useState<ShopifyProduct | null>(null);
  const [viewerIndex, setViewerIndex] = useState(0);
  const viewerVisible = viewerProduct !== null;

  const handleImagePress = useCallback((product: ShopifyProduct) => {
    if (product.images.length === 0) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setViewerIndex(0);
    setViewerProduct(product);
  }, []);

  const handleViewerClose = useCallback(() => {
    setViewerProduct(null);
  }, []);

  // Holds the pre-fill question for the next conversation created
  const pendingQuestionRef = useRef<string>('');

  const category = FEATURED_CATEGORIES.find((c) => c.handle === handle);
  const title = category?.title ?? handle;

  const { data: initialProducts, isLoading, isError } = useCollectionProducts(handle, 1, LIMIT);

  // Merge first page into allProducts once loaded
  React.useEffect(() => {
    if (initialProducts) {
      setAllProducts(initialProducts);
      setHasMore(initialProducts.length === LIMIT);
    }
  }, [initialProducts]);

  const createConversation = useCreateOpenaiConversation({
    mutation: {
      onSuccess: (conv) => {
        queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
        const q = pendingQuestionRef.current;
        pendingQuestionRef.current = '';
        router.push(`/chat/${conv.id}?q=${encodeURIComponent(q)}&from=${encodeURIComponent(handle)}`);
      },
      onError: () => {
        pendingQuestionRef.current = '';
        Alert.alert('Error', 'Could not open chat. Please try again.');
      },
    },
  });

  const handleAskAI = useCallback(
    (product: ShopifyProduct) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setAskingProductId(product.id);
      pendingQuestionRef.current = `Tell me about the ${product.title}. What are its specs, use cases, and is it a good fit for my needs?`;
      createConversation.mutate(
        { data: { title: `${product.title} inquiry` } },
        { onSettled: () => setAskingProductId(null) },
      );
    },
    [createConversation],
  );

  const handleLoadMore = useCallback(async () => {
    if (!hasMore || loadingMore || isLoading) return;
    setLoadingMore(true);
    const nextPage = page + 1;
    try {
      const res = await fetch(
        `https://multirotors.store/collections/${handle}/products.json?limit=${LIMIT}&page=${nextPage}`,
      );
      const data = (await res.json()) as { products: ShopifyProduct[] };
      const newProducts = data.products;
      setAllProducts((prev) => [...prev, ...newProducts]);
      setHasMore(newProducts.length === LIMIT);
      setPage(nextPage);
    } catch {
      // silently ignore pagination errors
    } finally {
      setLoadingMore(false);
    }
  }, [hasMore, loadingMore, isLoading, page, handle]);

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 8, borderBottomColor: colors.border }]}>
        <Pressable
          style={({ pressed }) => [styles.backBtn, { opacity: pressed ? 0.6 : 1 }]}
          onPress={() => router.back()}
          hitSlop={12}
        >
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <Text
          style={[styles.headerTitle, { color: colors.foreground, fontFamily: 'Inter_700Bold' }]}
          numberOfLines={1}
        >
          {title}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {/* Content */}
      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.primary} size="large" />
        </View>
      ) : isError ? (
        <View style={styles.center}>
          <Feather name="alert-circle" size={32} color={colors.mutedForeground} />
          <Text style={[styles.errorText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
            Failed to load products
          </Text>
        </View>
      ) : (
        <FlatList
          data={allProducts}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <ProductCard
              product={item}
              onAskAI={handleAskAI}
              askingProductId={askingProductId}
              onImagePress={handleImagePress}
            />
          )}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad + 20 }]}
          showsVerticalScrollIndicator={false}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.3}
          ListFooterComponent={
            loadingMore ? (
              <View style={styles.footerLoader}>
                <ActivityIndicator color={colors.primary} />
              </View>
            ) : !hasMore && allProducts.length > 0 ? (
              <Text style={[styles.endText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                All products loaded
              </Text>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Feather name="package" size={32} color={colors.mutedForeground} />
              <Text style={[styles.errorText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
                No products found
              </Text>
            </View>
          }
        />
      )}

      {/* Full-screen image viewer */}
      {viewerProduct && (
        <ImageViewer
          images={viewerProduct.images}
          initialIndex={viewerIndex}
          visible={viewerVisible}
          onClose={handleViewerClose}
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
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    gap: 12,
  },
  backBtn: {
    padding: 2,
  },
  headerTitle: {
    fontSize: 18,
    flex: 1,
  },
  headerSpacer: {
    width: 26,
  },
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  errorText: {
    fontSize: 14,
    textAlign: 'center',
  },
  list: {
    padding: 16,
    gap: 12,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  cardImage: {
    width: 110,
    alignSelf: 'stretch',
  },
  cardImagePlaceholder: {
    width: 110,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardBody: {
    flex: 1,
    padding: 12,
    gap: 6,
  },
  cardTitle: {
    fontSize: 14,
    lineHeight: 19,
  },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardPrice: {
    fontSize: 15,
  },
  cardOos: {
    fontSize: 12,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    gap: 5,
    minWidth: 72,
    justifyContent: 'center',
  },
  buyBtn: {},
  aiBtn: {
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 13,
  },
  footerLoader: {
    paddingVertical: 20,
    alignItems: 'center',
  },
  endText: {
    textAlign: 'center',
    fontSize: 13,
    paddingVertical: 16,
  },
});
