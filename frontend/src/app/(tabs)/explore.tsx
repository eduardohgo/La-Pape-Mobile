import { router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { HomeIcon } from '@/components/home/home-icon';
import { CatalogTabBar, PendingFeatureModal, ProductVisual, ShopHeader, ShopModal, ShopStatus, palette } from '@/components/shop/shop-ui';
import { type CatalogCategory, type CatalogProduct, type DemoCatalogProduct, getCatalogService } from '@/services/catalog.service';
import { filterCatalogProducts } from '@/utils/catalog-search';

// Keep the same explicit development-only demo gate as the existing catalog.
const demoMode = __DEV__ && process.env.EXPO_PUBLIC_CATALOG_MODE === 'demo';
type VisibleProduct = CatalogProduct | DemoCatalogProduct;
type CatalogState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'loaded'; products: VisibleProduct[]; categories: CatalogCategory[] };

function categoryColor(name: string) {
  return name === 'Arte' ? '#FDEBF2' : name === 'Cuadernos' ? '#F0EBFC' : name === 'Oficina' ? '#E3F5FC' : '#FFF7D9';
}

function CategoryChip({ category, selected, onPress, modal = false }: {
  category: { id: string; name: string }; selected: boolean; onPress: () => void; modal?: boolean;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={(modal ? 'Filtrar por ' : 'Categoría ') + category.name}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.chip, { backgroundColor: selected ? '#BC2862' : categoryColor(category.name) }, pressed && styles.pressed]}>
      <Text style={[styles.chipLabel, { color: selected ? '#FFFFFF' : palette.ink }]}>{category.name}</Text>
    </Pressable>
  );
}

function ProductCard({ product, onFavorite }: { product: VisibleProduct; onFavorite: () => void }) {
  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => router.push({ pathname: '/products/[id]', params: { id: product.id } })}
        style={({ pressed }) => [styles.cardLink, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={product.name + '. ' + product.price + ' pesos mexicanos.' + (demoMode ? ' Precio de demostración.' : '')}
        accessibilityHint="Abrir detalle del producto por su identificador. Compras no disponibles.">
        <ProductVisual product={product} />
        <View style={styles.cardInfo}>
          <Text style={styles.cardCategory}>{product.category_name}</Text>
          <Text style={styles.productName} numberOfLines={3}>{product.name}</Text>
          <Text style={styles.price}>{'$'}{product.price} <Text style={styles.currency}>{product.currency}</Text></Text>
          {demoMode && <Text style={styles.priceDemo}>PRECIO DEMO</Text>}
        </View>
      </Pressable>
      <Pressable style={styles.favorite} accessibilityRole="button" accessibilityLabel={'Favoritos de ' + product.name + ': próximamente'} onPress={onFavorite}>
        <HomeIcon name="heart" size={20} color={palette.muted} />
      </Pressable>
      <Pressable disabled accessibilityRole="button" accessibilityState={{ disabled: true }} accessibilityLabel={'Agregar ' + product.name + ' al carrito: próximamente'} style={styles.addButton}>
        <HomeIcon name="cart" color="#A5466D" size={17} />
        <Text style={styles.addLabel}>Agregar · próximamente</Text>
      </Pressable>
    </View>
  );
}

export default function CatalogScreen() {
  const pathname = usePathname();
  const { width, fontScale } = useWindowDimensions();
  const columns = fontScale > 1.35 ? 1 : width >= 600 ? 3 : 2;
  const scroll = useRef<ScrollView>(null);
  const searchInput = useRef<TextInput>(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [reload, setReload] = useState(0);
  const [resolved, setResolved] = useState<{ key: number; result: CatalogState } | null>(null);
  const [feature, setFeature] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const state = useMemo<CatalogState>(() => resolved?.key === reload
    ? resolved.result : { status: 'loading' }, [resolved, reload]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      try {
        const service = getCatalogService();
        let products: VisibleProduct[];
        let categories: CatalogCategory[];
        if (demoMode) {
          products = await service.demoProducts({ signal: controller.signal });
          const unique = new Map<string, CatalogCategory>();
          for (const product of products) unique.set(product.category_id, {
            id: product.category_id, name: product.category_name, description: null,
          });
          categories = [...unique.values()];
        } else {
          [categories, products] = await Promise.all([
            service.categories({ signal: controller.signal }),
            service.products({ signal: controller.signal }),
          ]);
        }
        if (!controller.signal.aborted) setResolved({
          key: reload,
          result: { status: 'loaded', products, categories: categories.slice().sort((a, b) => a.name.localeCompare(b.name, 'es')) },
        });
      } catch {
        if (!controller.signal.aborted) setResolved({ key: reload, result: { status: 'error' } });
      }
    }
    void load();
    return () => controller.abort();
  }, [reload]);

  const filtered = useMemo(() => state.status === 'loaded'
    ? filterCatalogProducts(state.products, query, selectedCategory) : [], [state, query, selectedCategory]);
  const rows = Array.from({ length: Math.ceil(filtered.length / columns) }, (_, index) => filtered.slice(index * columns, (index + 1) * columns));
  const categories = [{ id: 'all', name: 'Todos' }, ...(state.status === 'loaded' ? state.categories : [])];
  function resetFilters() { setQuery(''); setSelectedCategory('all'); }
  function openFilters() { Keyboard.dismiss(); setShowFilters(true); }

  return (
    <View style={styles.screen}>
      {pathname === '/explore' && <StatusBar style="dark" />}
      <ScrollView ref={scroll} style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
        <ShopHeader right={
          <Pressable style={styles.roundButton} onPress={() => setFeature('Carrito')} accessibilityRole="button" accessibilityLabel="Carrito: próximamente"><HomeIcon name="cart" /></Pressable>
        }>
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <HomeIcon name="search" size={22} color={palette.muted} />
              <TextInput
                ref={searchInput}
                value={query}
                onChangeText={setQuery}
                style={styles.searchInput}
                placeholder="Nombre, categoría o SKU"
                placeholderTextColor="#78727F"
                accessibilityLabel="Buscar productos por nombre, categoría o SKU"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                maxLength={120}
              />
              {query.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Limpiar búsqueda" onPress={() => { setQuery(''); searchInput.current?.focus(); }} style={styles.clearButton}><HomeIcon name="close" size={17} color={palette.muted} /></Pressable>}
            </View>
            <Pressable onPress={openFilters} accessibilityRole="button" accessibilityLabel="Abrir filtros de categoría" style={styles.filterButton}>
              <HomeIcon name="filter" size={22} /><Text style={styles.filterButtonLabel}>Filtros</Text>
            </Pressable>
          </View>
        </ShopHeader>

        <View style={styles.body}>
          <View style={styles.titleRow}><Text accessibilityRole="header" style={styles.heading}>Catálogo<Text style={styles.headingSpark}> ✦</Text></Text><View style={styles.titleShape} /></View>
          <View style={styles.chips} accessibilityLabel="Categorías del catálogo">
            {categories.map(category => <CategoryChip key={category.id} category={category} selected={category.id === selectedCategory} onPress={() => setSelectedCategory(category.id)} />)}
          </View>
          <View style={styles.notice}>
            <Text style={styles.noticeLabel}>{demoMode ? 'DEMO · SIN VENTAS' : 'CONSULTA · SIN COMPRAS'}</Text>
            <Text style={styles.noticeText}>{demoMode ? 'Precios provisionales. Fotografías, marcas e inventario pendientes de verificación.' : 'Información del catálogo. Compras aún no disponibles.'}</Text>
          </View>

          {state.status === 'loading' ? <ShopStatus title="Consultando catálogo…" loading /> :
            state.status === 'error' ? <ShopStatus title="No pudimos cargar el catálogo" message="Comprueba la conexión con Express y vuelve a intentarlo." onRetry={() => setReload(value => value + 1)} /> :
              state.products.length === 0 ? <ShopStatus title={demoMode ? 'Aún no hay artículos de demostración' : 'Todavía no hay productos publicados'} message="La API no devolvió artículos para mostrar. Puedes actualizar el catálogo." onRetry={() => setReload(value => value + 1)} retryLabel="Actualizar catálogo" /> :
                <>
                  <View style={styles.resultsHeader}>
                    <Text style={styles.resultsCount} accessibilityLiveRegion="polite">{filtered.length} {filtered.length === 1 ? 'artículo' : 'artículos'}</Text>
                    {(query.trim() !== '' || selectedCategory !== 'all') && <Pressable accessibilityRole="button" onPress={resetFilters} style={styles.resetButton}><Text style={styles.resetLabel}>Limpiar filtros</Text></Pressable>}
                  </View>
                  {filtered.length === 0 ? <ShopStatus title="No encontramos coincidencias" message="Prueba otro nombre, categoría o SKU, o limpia los filtros." onRetry={resetFilters} retryLabel="Mostrar todos" /> :
                    <View style={styles.grid}>{rows.map(row => <View key={row[0].id} style={styles.productRow}>
                      {row.map(product => <View key={product.id} style={styles.cell}><ProductCard product={product} onFavorite={() => setFeature('Favoritos')} /></View>)}
                      {Array.from({ length: columns - row.length }, (_, index) => <View key={'empty-' + index} style={styles.cell} />)}
                    </View>)}</View>}
                </>
          }
          <Text style={styles.footer}>Ideas para aprender y crear. Compras no disponibles.</Text>
        </View>
      </ScrollView>
      <CatalogTabBar onPending={setFeature} onCatalog={() => { Keyboard.dismiss(); scroll.current?.scrollTo({ y: 0, animated: true }); }} />
      <PendingFeatureModal feature={feature} onClose={() => setFeature(null)} />
      <ShopModal visible={showFilters} onClose={() => setShowFilters(false)}>
        <Text accessibilityRole="header" style={styles.modalTitle}>Filtrar por categoría</Text>
        <Text style={styles.modalText}>Las categorías se combinan con tu búsqueda.</Text>
        <View style={styles.modalChips}>{categories.map(category => <CategoryChip key={category.id} category={category} selected={category.id === selectedCategory} modal onPress={() => { setSelectedCategory(category.id); setShowFilters(false); }} />)}</View>
        <Pressable onPress={() => { resetFilters(); setShowFilters(false); }} accessibilityRole="button" style={styles.resetButton}><Text style={styles.resetLabel}>Limpiar búsqueda y categoría</Text></Pressable>
      </ShopModal>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, scroll: { flex: 1 }, scrollContent: { paddingBottom: 20 },
  roundButton: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  searchRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  searchBox: { flex: 1, minHeight: 50, flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 26, paddingLeft: 14, paddingRight: 5, gap: 8 },
  searchInput: { flex: 1, minWidth: 0, minHeight: 50, fontSize: 12, color: palette.ink, paddingVertical: 10 },
  clearButton: { width: 40, height: 44, justifyContent: 'center', alignItems: 'center' },
  filterButton: { minWidth: 48, minHeight: 52, borderRadius: 18, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', gap: 3 },
  filterButtonLabel: { fontSize: 9, color: palette.ink, fontWeight: '600' },
  body: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 22 },
  titleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  heading: { fontSize: 31, fontWeight: '900', color: palette.ink, letterSpacing: -0.9 },
  headingSpark: { color: palette.pink, fontSize: 23 },
  titleShape: { width: 35, height: 23, backgroundColor: '#DAF4FC', borderRadius: 11, transform: [{ rotate: '-18deg' }] },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7, marginBottom: 13 },
  chip: { minHeight: 42, paddingHorizontal: 15, paddingVertical: 11, justifyContent: 'center', borderRadius: 23 },
  chipLabel: { fontSize: 12, fontWeight: '700' },
  notice: { backgroundColor: '#FFF8E9', borderRadius: 14, padding: 12, gap: 4, marginBottom: 12 },
  noticeLabel: { color: '#85520C', fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  noticeText: { color: '#796846', fontSize: 10, lineHeight: 16 },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  resultsCount: { color: palette.muted, fontSize: 12, fontWeight: '600' },
  resetButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  resetLabel: { color: palette.blue, fontSize: 12, fontWeight: '700' },
  grid: { gap: 12 }, productRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 }, cell: { flex: 1, minWidth: 0 },
  card: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0EDF2', borderRadius: 19, padding: 8, boxShadow: '0 3px 9px rgba(45,33,57,0.035)' },
  cardLink: { flex: 1 }, cardInfo: { paddingHorizontal: 3, paddingTop: 11, paddingBottom: 9 },
  cardCategory: { fontSize: 9, fontWeight: '600', color: palette.muted, marginBottom: 5 },
  productName: { fontSize: 13, fontWeight: '700', color: palette.ink, lineHeight: 18, minHeight: 54 },
  price: { color: palette.ink, fontSize: 21, fontWeight: '900', marginTop: 8 }, currency: { fontSize: 10, fontWeight: '700' },
  priceDemo: { fontSize: 8, color: '#8C4F18', fontWeight: '800', marginTop: 4, letterSpacing: 0.4 },
  favorite: { position: 'absolute', top: 3, right: 3, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  addButton: { backgroundColor: '#FBE3ED', borderRadius: 22, minHeight: 44, paddingHorizontal: 7, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 },
  addLabel: { color: '#94405F', fontSize: 9, lineHeight: 13, fontWeight: '700', flexShrink: 1, textAlign: 'center' },
  footer: { color: palette.muted, fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: 24 },
  modalTitle: { color: palette.ink, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  modalText: { color: palette.muted, fontSize: 13, lineHeight: 20, marginTop: 10, textAlign: 'center' },
  modalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 20 },
  pressed: { opacity: 0.78 },
});
