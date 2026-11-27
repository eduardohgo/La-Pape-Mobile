import { router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { type ComponentRef, useMemo, useRef, useState } from 'react';
import { Keyboard, Pressable, ScrollView, StyleSheet, Text, TextInput, View, useWindowDimensions } from 'react-native';

import { HomeIcon } from '@/components/compartidos/iconos-papeleria';
import { CatalogTabBar, ProductVisual, ShopHeader, ShopModal, ShopStatus, palette } from '@/components/catalogo/componentes-catalogo';
import { FavoriteButton } from '@/components/compra/boton-favorito';
import { AddToCartButton, CartShortcut } from '@/components/compra/carrito-animado';
import { CartFlightScope, useCartFlight } from '@/components/compra/vuelo-carrito';
import type { VisibleProduct } from '@/features/catalogo/dominio/modelos';
import { useCatalogViewModel } from '@/features/catalogo/presentacion/hooks';
import { paginateCatalogProducts } from '@/features/catalogo/presentacion/paginacion';
import { filterCatalogProducts } from '@/utils/busqueda-catalogo';

function categoryColor(name: string) {
  return name === 'Arte' ? '#FDEBF2' : name === 'Cuadernos' ? '#F0EBFC' : name === 'Oficina' ? '#E3F5FC' : '#FFF7D9';
}

function CategoryChip({ category, selected, onPress }: {
  category: { id: string; name: string }; selected: boolean; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={'Filtrar por ' + category.name}
      accessibilityState={{ selected }}
      style={({ pressed }) => [styles.chip, { backgroundColor: selected ? '#BC2862' : categoryColor(category.name) }, pressed && styles.pressed]}>
      <Text style={[styles.chipLabel, { color: selected ? '#FFFFFF' : palette.ink }]}>{category.name}</Text>
    </Pressable>
  );
}

function ProductCard({ product }: { product: VisibleProduct }) {
  const photo = useRef<ComponentRef<typeof View>>(null);
  return (
    <View style={styles.card}>
      <Pressable
        onPress={() => router.push({ pathname: '/products/[id]', params: { id: product.id } })}
        style={({ pressed }) => [styles.cardLink, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={product.name + '. ' + product.price + ' pesos mexicanos.'}
        accessibilityHint="Abrir el detalle de este artículo.">
        <View ref={photo} collapsable={false}><ProductVisual product={product} /></View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardCategory}>{product.category_name}</Text>
          <Text style={styles.productName} numberOfLines={3}>{product.name}</Text>
          <Text style={styles.price}>{'$'}{product.price} <Text style={styles.currency}>{product.currency}</Text></Text>
        </View>
      </Pressable>
      {'brand_id' in product && <FavoriteButton id={product.id} name={product.name} style={styles.favorite} />}
      <View style={styles.actions}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={'Ver detalles de ' + product.name}
        onPress={() => router.push({ pathname: '/products/[id]', params: { id: product.id } })}
        style={({ pressed }) => [styles.detailButton, pressed && styles.pressed]}>
        <HomeIcon name="eye" color="#A51D53" size={20} />
        <Text style={styles.detailLabel}>Ver detalle</Text>
      </Pressable>
      {'brand_id' in product && <AddToCartButton product={product} source={photo} appearance="split" />}
      </View>
    </View>
  );
}

function CatalogContent() {
  const flight = useCartFlight();
  const pathname = usePathname();
  const { width, fontScale } = useWindowDimensions();
  const columns = fontScale > 1.35 || width < 360 ? 1 : width >= 600 ? 3 : 2;
  const scroll = useRef<ComponentRef<typeof ScrollView>>(null);
  const searchInput = useRef<ComponentRef<typeof TextInput>>(null);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  const { state, retry } = useCatalogViewModel();

  const filtered = useMemo(() => state.status === 'loaded'
    ? filterCatalogProducts(state.products, query, selectedCategory) : [], [state, query, selectedCategory]);
  const pagination = useMemo(() => paginateCatalogProducts(filtered, page), [filtered, page]);
  const rows = Array.from({ length: Math.ceil(pagination.items.length / columns) }, (_, index) => pagination.items.slice(index * columns, (index + 1) * columns));
  const categories = [{ id: 'all', name: 'Todos' }, ...(state.status === 'loaded' ? state.categories : [])];
  function updateQuery(value: string) { setQuery(value); setPage(1); }
  function selectCategory(id: string) { setSelectedCategory(id); setPage(1); }
  function resetFilters() { updateQuery(''); selectCategory('all'); }
  function reloadCatalog() { setPage(1); void retry(); }
  function changePage(nextPage: number) {
    setPage(nextPage);
    Keyboard.dismiss();
    scroll.current?.scrollTo({ y: 0, animated: true });
  }
  function openFilters() { Keyboard.dismiss(); setShowFilters(true); }

  return (
    <View style={styles.screen}>
      {pathname === '/explore' && <StatusBar style="dark" />}
      <ScrollView ref={scroll} scrollEnabled={!flight?.busy} style={styles.scroll} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={styles.scrollContent}>
        <ShopHeader right={
          <CartShortcut />
        }>
          <View style={styles.searchRow}>
            <View style={styles.searchBox}>
              <HomeIcon name="search" size={22} color={palette.muted} />
              <TextInput
                ref={searchInput}
                value={query}
                onChangeText={updateQuery}
                style={styles.searchInput}
                placeholder="Nombre, categoría o SKU"
                placeholderTextColor="#78727F"
                accessibilityLabel="Buscar productos por nombre, categoría o SKU"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                maxLength={120}
              />
              {query.length > 0 && <Pressable accessibilityRole="button" accessibilityLabel="Limpiar búsqueda" onPress={() => { updateQuery(''); searchInput.current?.focus(); }} style={styles.clearButton}><HomeIcon name="close" size={17} color={palette.muted} /></Pressable>}
            </View>
            <Pressable onPress={openFilters} accessibilityRole="button" accessibilityLabel="Abrir filtros de categoría" style={styles.filterButton}>
              <HomeIcon name="filter" size={22} /><Text style={styles.filterButtonLabel}>Filtros</Text>
            </Pressable>
          </View>
        </ShopHeader>

        <View style={styles.body}>
          <View style={styles.titleRow}><Text accessibilityRole="header" style={styles.heading}>Catálogo<Text style={styles.headingSpark}> ✦</Text></Text><View style={styles.titleShape} /></View>
          {state.status === 'loading' ? <ShopStatus title="Consultando catálogo…" loading /> :
            state.status === 'error' ? <ShopStatus title="No pudimos cargar el catálogo" message="Revisa tu conexión e inténtalo de nuevo." onRetry={reloadCatalog} /> :
              state.products.length === 0 ? <ShopStatus title="Por ahora no hay artículos disponibles" message="Vuelve a visitarnos para conocer más de nuestra selección." onRetry={reloadCatalog} retryLabel="Actualizar catálogo" /> :
                <>
                  <View style={styles.resultsHeader}>
                    <Text style={styles.resultsCount} accessibilityLiveRegion="polite">{filtered.length > 0 ? `${pagination.firstItem}–${pagination.lastItem} de ` : ''}{filtered.length} {filtered.length === 1 ? 'artículo' : 'artículos'}</Text>
                    {(query.trim() !== '' || selectedCategory !== 'all') && <Pressable accessibilityRole="button" onPress={resetFilters} style={styles.resetButton}><Text style={styles.resetLabel}>Limpiar filtros</Text></Pressable>}
                  </View>
                  {filtered.length === 0 ? <ShopStatus title="No encontramos coincidencias" message="Prueba otro nombre, categoría o SKU, o limpia los filtros." onRetry={resetFilters} retryLabel="Mostrar todos" /> :
                    <>
                      <View style={styles.grid}>{rows.map(row => <View key={row[0].id} style={styles.productRow}>
                        {row.map(product => <View key={product.id} style={styles.cell}><ProductCard product={product} /></View>)}
                        {Array.from({ length: columns - row.length }, (_, index) => <View key={'empty-' + index} style={styles.cell} />)}
                      </View>)}</View>
                      <View style={styles.pagination}>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Página anterior del catálogo"
                          accessibilityState={{ disabled: !pagination.hasPrevious }}
                          disabled={!pagination.hasPrevious}
                          onPress={() => changePage(pagination.page - 1)}
                          style={({ pressed }) => [styles.pageButton, !pagination.hasPrevious && styles.pageButtonDisabled, pressed && styles.pressed]}>
                          <View style={styles.previousArrow}><HomeIcon name="arrow" color={pagination.hasPrevious ? '#FFFFFF' : palette.muted} /></View>
                        </Pressable>
                        <Text style={styles.pageLabel} accessibilityLiveRegion="polite">Página {pagination.page} de {pagination.totalPages}</Text>
                        <Pressable
                          accessibilityRole="button"
                          accessibilityLabel="Página siguiente del catálogo"
                          accessibilityState={{ disabled: !pagination.hasNext }}
                          disabled={!pagination.hasNext}
                          onPress={() => changePage(pagination.page + 1)}
                          style={({ pressed }) => [styles.pageButton, !pagination.hasNext && styles.pageButtonDisabled, pressed && styles.pressed]}>
                          <HomeIcon name="arrow" color={pagination.hasNext ? '#FFFFFF' : palette.muted} />
                        </Pressable>
                      </View>
                    </>}
                </>
          }
          <Text style={styles.footer}>Ideas para aprender, crear y descubrir.</Text>
        </View>
      </ScrollView>
      <CatalogTabBar onCatalog={() => { Keyboard.dismiss(); scroll.current?.scrollTo({ y: 0, animated: true }); }} />
      <ShopModal visible={showFilters} onClose={() => setShowFilters(false)}>
        <Text accessibilityRole="header" style={styles.modalTitle}>Filtrar por categoría</Text>
        <Text style={styles.modalText}>Las categorías se combinan con tu búsqueda.</Text>
        <View style={styles.modalChips}>{categories.map(category => <CategoryChip key={category.id} category={category} selected={category.id === selectedCategory} onPress={() => { selectCategory(category.id); setShowFilters(false); }} />)}</View>
        <Pressable onPress={() => { resetFilters(); setShowFilters(false); }} accessibilityRole="button" style={styles.resetButton}><Text style={styles.resetLabel}>Limpiar búsqueda y categoría</Text></Pressable>
      </ShopModal>
    </View>
  );
}

export default function CatalogScreen() {
  return <CartFlightScope><CatalogContent /></CartFlightScope>;
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
  chip: { minHeight: 42, paddingHorizontal: 15, paddingVertical: 11, justifyContent: 'center', borderRadius: 23 },
  chipLabel: { fontSize: 12, fontWeight: '700' },
  resultsHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 12 },
  resultsCount: { color: palette.muted, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  resetButton: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  resetLabel: { color: palette.blue, fontSize: 12, fontWeight: '700' },
  pagination: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 20 },
  pageButton: { width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: '#BC2862' },
  pageButtonDisabled: { backgroundColor: '#F0EDF2' },
  previousArrow: { transform: [{ rotate: '180deg' }] },
  pageLabel: { flex: 1, color: palette.ink, fontSize: 13, lineHeight: 20, fontWeight: '700', textAlign: 'center' },
  grid: { gap: 12 }, productRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 }, cell: { flex: 1, minWidth: 0 },
  card: { flex: 1, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#F0EDF2', borderRadius: 19, padding: 8, boxShadow: '0 3px 9px rgba(45,33,57,0.035)' },
  cardLink: { flex: 1 }, cardInfo: { paddingHorizontal: 3, paddingTop: 11, paddingBottom: 9 },
  cardCategory: { fontSize: 9, fontWeight: '600', color: palette.muted, marginBottom: 5 },
  productName: { fontSize: 13, fontWeight: '700', color: palette.ink, lineHeight: 18, minHeight: 54 },
  price: { color: palette.ink, fontSize: 21, fontWeight: '900', marginTop: 8 }, currency: { fontSize: 10, fontWeight: '700' },
  favorite: { position: 'absolute', top: 3, right: 3, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  actions: { flexDirection: 'row', alignItems: 'stretch', borderWidth: 1, borderColor: '#F0C5D7', borderRadius: 17, overflow: 'hidden', backgroundColor: '#FFF6FA', marginTop: 4 },
  detailButton: { flex: 1, minWidth: 0, minHeight: 76, paddingHorizontal: 5, paddingVertical: 10, alignItems: 'center', justifyContent: 'center', gap: 5, borderRightWidth: 1, borderRightColor: '#F0C5D7' },
  detailLabel: { color: '#A51D53', fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center' },
  footer: { color: palette.muted, fontSize: 11, lineHeight: 18, textAlign: 'center', marginTop: 24 },
  modalTitle: { color: palette.ink, fontSize: 23, fontWeight: '900', textAlign: 'center' },
  modalText: { color: palette.muted, fontSize: 13, lineHeight: 20, marginTop: 10, textAlign: 'center' },
  modalChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginTop: 20 },
  pressed: { opacity: 0.78 },
});
