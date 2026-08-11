import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  Text,
  FlatList,
  Image,
  StyleSheet,
  Pressable,
  Platform,
  TextInput,
  ActivityIndicator,
  Linking,
  Alert,
  useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { router } from 'expo-router';
import { Feather } from '@expo/vector-icons';
import { useColors } from '@/hooks/useColors';
import {
  FEATURED_CATEGORIES,
  type FeaturedCategory,
  type SearchSuggestion,
  useProductSearch,
} from '@/lib/shopify';
import {
  useCreateOpenaiConversation,
  getListOpenaiConversationsQueryKey,
} from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';

const SHOPIFY_BASE = 'https://multirotors.store';

// ─── Category tile ────────────────────────────────────────────────────────────

function CategoryTile({ item, tileWidth }: { item: FeaturedCategory; tileWidth: number }) {
  const colors = useColors();

  return (
    <Pressable
      style={({ pressed }) => [
        styles.tile,
        {
          width: tileWidth,
          backgroundColor: colors.card,
          borderColor: colors.border,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
      onPress={() => {
        Haptics.selectionAsync();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        router.push({ pathname: '/shop/[handle]' as any, params: { handle: item.handle } });
      }}
    >
      <Image
        source={{ uri: item.img }}
        style={styles.tileImage}
        resizeMode="cover"
      />
      <View style={[styles.tileOverlay, { backgroundColor: colors.card }]}>
        <Text
          style={[styles.tileTitle, { color: colors.foreground, fontFamily: 'Inter_600SemiBold' }]}
          numberOfLines={1}
        >
          {item.title}
        </Text>
        <Text
          style={[styles.tileSub, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}
          numberOfLines={1}
        >
          {item.sub}
        </Text>
      </View>
    </Pressable>
  );
}

// ─── Search result card ───────────────────────────────────────────────────────

function SearchResultCard({
  item,
  onAskAI,
  askingHandle,
}: {
  item: SearchSuggestion;
  onAskAI: (item: SearchSuggestion) => void;
  askingHandle: string | null;
}) {
  const colors = useColors();
  const isAsking = askingHandle === item.handle;

  const handleBuy = useCallback(() => {
    Linking.openURL(`${SHOPIFY_BASE}/products/${item.handle}`).catch(() => {
      Alert.alert('Error', 'Could not open product page.');
    });
  }, [item.handle]);

  return (
    <View style={[styles.resultCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      {item.imageUrl ? (
        <Image source={{ uri: item.imageUrl }} style={styles.resultImage} resizeMode="cover" />
      ) : (
        <View style={[styles.resultImagePlaceholder, { backgroundColor: colors.muted }]}>
          <Feather name="image" size={24} color={colors.mutedForeground} />
        </View>
      )}

      <View style={styles.resultBody}>
        <Text
          style={[styles.resultTitle, { color: colors.foreground, fontFamily: 'Inter_500Medium' }]}
          numberOfLines={2}
        >
          {item.title}
        </Text>

        {item.price && (
          <Text style={[styles.resultPrice, { color: colors.primary, fontFamily: 'Inter_600SemiBold' }]}>
            {item.price}
          </Text>
        )}

        <View style={styles.resultActions}>
          <Pressable
            style={({ pressed }) => [
              styles.actionBtn,
              { backgroundColor: colors.primary, opacity: pressed ? 0.8 : 1 },
            ]}
            onPress={handleBuy}
          >
            <Feather name="external-link" size={13} color={colors.primaryForeground} />
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
            onPress={() => onAskAI(item)}
            disabled={isAsking}
          >
            {isAsking ? (
              <ActivityIndicator size="small" color={colors.primary} />
            ) : (
              <>
                <Feather name="message-circle" size={13} color={colors.primary} />
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

// ─── Main screen ──────────────────────────────────────────────────────────────

export default function ShopScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const [query, setQuery] = useState('');
  const [askingHandle, setAskingHandle] = useState<string | null>(null);
  const pendingQuestionRef = useRef<string>('');

  const topPad = Platform.OS === 'web' ? 67 : insets.top;
  const bottomPad = Platform.OS === 'web' ? 34 : insets.bottom;

  // Tile width for 2-column grid: 2 columns, 12px gap, 16px side padding
  const { width } = useWindowDimensions();
  const tileWidth = Math.floor((width - 16 * 2 - 12) / 2);

  // Search
  const isSearching = query.trim().length > 0;
  const { data: searchResults, isFetching: searchLoading, isError: searchError } = useProductSearch(query);

  // Ask AI
  const createConversation = useCreateOpenaiConversation({
    mutation: {
      onSuccess: (conv) => {
        queryClient.invalidateQueries({ queryKey: getListOpenaiConversationsQueryKey() });
        const q = pendingQuestionRef.current;
        pendingQuestionRef.current = '';
        router.push(`/chat/${conv.id}?q=${encodeURIComponent(q)}`);
      },
      onError: () => {
        pendingQuestionRef.current = '';
        Alert.alert('Error', 'Could not open chat. Please try again.');
      },
    },
  });

  const handleAskAI = useCallback(
    (item: SearchSuggestion) => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setAskingHandle(item.handle);
      pendingQuestionRef.current = `Tell me about the ${item.title}. What are its specs, use cases, and is it a good fit for my needs?`;
      createConversation.mutate(
        { data: { title: `${item.title} inquiry` } },
        { onSettled: () => setAskingHandle(null) },
      );
    },
    [createConversation],
  );

  const handleClearSearch = useCallback(() => {
    setQuery('');
  }, []);

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

        {/* Search bar */}
        <View style={[styles.searchBar, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Feather name="search" size={16} color={colors.mutedForeground} />
          <TextInput
            style={[styles.searchInput, { color: colors.foreground, fontFamily: 'Inter_400Regular' }]}
            placeholder="Search products…"
            placeholderTextColor={colors.mutedForeground}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="never"
          />
          {isSearching && (
            <Pressable onPress={handleClearSearch} hitSlop={8}>
              <Feather name="x" size={16} color={colors.mutedForeground} />
            </Pressable>
          )}
        </View>
      </View>

      {/* Content: search results or category grid */}
      {isSearching ? (
        searchLoading ? (
          <View style={styles.center}>
            <ActivityIndicator color={colors.primary} size="large" />
          </View>
        ) : searchError ? (
          <View style={styles.center}>
            <Feather name="alert-circle" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              Search failed. Check your connection.
            </Text>
          </View>
        ) : searchResults && searchResults.length === 0 ? (
          <View style={styles.center}>
            <Feather name="search" size={28} color={colors.mutedForeground} />
            <Text style={[styles.emptyText, { color: colors.mutedForeground, fontFamily: 'Inter_400Regular' }]}>
              No products found for "{query}"
            </Text>
          </View>
        ) : (
          <FlatList
            data={searchResults ?? []}
            keyExtractor={(item) => item.handle}
            renderItem={({ item }) => (
              <SearchResultCard
                item={item}
                onAskAI={handleAskAI}
                askingHandle={askingHandle}
              />
            )}
            contentContainerStyle={[styles.resultList, { paddingBottom: bottomPad + 20 }]}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        )
      ) : (
        <FlatList
          data={FEATURED_CATEGORIES}
          keyExtractor={(item) => item.handle}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={[styles.list, { paddingBottom: bottomPad + 20 }]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <CategoryTile item={item} tileWidth={tileWidth} />
          )}
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
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    gap: 10,
  },
  headerWordmark: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    paddingHorizontal: 4,
  },
  wordmarkMain: {
    fontSize: 22,
    letterSpacing: 2,
  },
  wordmarkAccent: {
    fontSize: 22,
    letterSpacing: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 9 : 6,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    padding: 0,
  },
  // Categories grid
  list: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  row: {
    gap: 12,
  },
  tile: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  tileImage: {
    width: '100%',
    aspectRatio: 1,
  },
  tileOverlay: {
    paddingHorizontal: 10,
    paddingVertical: 10,
    gap: 2,
  },
  tileTitle: {
    fontSize: 13,
  },
  tileSub: {
    fontSize: 11,
  },
  // Search results
  resultList: {
    padding: 16,
    gap: 12,
  },
  resultCard: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'row',
    marginBottom: 12,
  },
  resultImage: {
    width: 100,
    alignSelf: 'stretch',
  },
  resultImagePlaceholder: {
    width: 100,
    alignSelf: 'stretch',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultBody: {
    flex: 1,
    padding: 12,
    gap: 5,
  },
  resultTitle: {
    fontSize: 13,
    lineHeight: 18,
  },
  resultPrice: {
    fontSize: 14,
  },
  resultActions: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
    minWidth: 68,
    justifyContent: 'center',
  },
  aiBtn: {
    borderWidth: 1,
  },
  actionBtnText: {
    fontSize: 12,
  },
  // Empty / error states
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 40,
  },
  emptyText: {
    fontSize: 14,
    textAlign: 'center',
  },
});
