import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { DEMO_PRODUCTS, type DemoCategory, type DemoProduct } from '@/features/catalog/demo-products';

type Filter = 'Todos' | DemoCategory;

const filters: readonly Filter[] = ['Todos', 'Cuadernos', 'Arte', 'Oficina'];

const categoryStyle: Record<DemoCategory, { background: string; icon: string; foreground: string }> = {
  Cuadernos: { background: '#E6EEFF', icon: '📓', foreground: '#244A93' },
  Arte: { background: '#FFF0E3', icon: '🎨', foreground: '#94501C' },
  Oficina: { background: '#E9F5EE', icon: '✏️', foreground: '#1A694D' },
};

function PreviewProductCard({ product }: { product: DemoProduct }) {
  const theme = useTheme();
  const color = categoryStyle[product.category];

  return (
    <View
      style={[styles.card, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
      accessible
      accessibilityLabel={`${product.name}. ${product.category}. ${product.price} pesos, precio de demostración. Fotografía pendiente. No disponible para compra.`}>
      <View style={[styles.photo, { backgroundColor: color.background }]}>
        <Text style={styles.photoIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          {color.icon}
        </Text>
        <Text style={[styles.missingPhoto, { color: color.foreground }]}>Sin fotografía</Text>
      </View>
      <View style={styles.cardContent}>
        <Text style={[styles.categoryText, { color: theme.textSecondary }]}>{product.category}</Text>
        <Text style={[styles.productName, { color: theme.text }]} numberOfLines={3}>
          {product.name}
        </Text>
        <Text style={[styles.price, { color: theme.text }]}>${product.price}</Text>
        <Text style={styles.demoPriceLabel}>PRECIO DE DEMOSTRACIÓN</Text>
      </View>
    </View>
  );
}

export default function CatalogScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [filter, setFilter] = useState<Filter>('Todos');
  const products = useMemo(
    () => (filter === 'Todos' ? DEMO_PRODUCTS : DEMO_PRODUCTS.filter((product) => product.category === filter)),
    [filter],
  );
  const productRows = Array.from({ length: Math.ceil(products.length / 2) }, (_, i) => products.slice(i * 2, i * 2 + 2));

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + BottomTabInset + 32 },
      ]}>
      <View style={styles.header}>
        <Text style={styles.brand}>LA PAPE</Text>
        <Text style={[styles.heading, { color: theme.text }]}>Catálogo</Text>
        <Text style={[styles.subtitle, { color: theme.textSecondary }]}>
          Todo para tus ideas, tus clases y tu oficina.
        </Text>
      </View>

      {__DEV__ ? (
        <>
          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>VISTA PREVIA · SOLO DESARROLLO</Text>
            <Text style={styles.noticeText}>
              Estos 10 artículos y sus precios son datos locales de demostración. No están cargados en Neon y las compras están deshabilitadas.
            </Text>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
            accessibilityLabel="Filtrar productos por categoría">
            {filters.map((item) => {
              const selected = item === filter;
              return (
                <Pressable
                  key={item}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setFilter(item)}
                  style={[
                    styles.filterChip,
                    { backgroundColor: selected ? '#1F5489' : theme.backgroundElement },
                  ]}>
                  <Text style={[styles.filterLabel, { color: selected ? '#FFFFFF' : theme.text }]}>
                    {item}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.sectionTitle}>
            <Text style={[styles.sectionHeading, { color: theme.text }]}>Productos de ejemplo</Text>
            <Text style={[styles.counter, { color: theme.textSecondary }]}>{products.length} artículos</Text>
          </View>

          <View style={styles.grid}>
            {productRows.map((pair) => (
              <View key={pair[0].sku} style={styles.row}>
                <PreviewProductCard product={pair[0]} />
                {pair[1] ? <PreviewProductCard product={pair[1]} /> : <View style={styles.emptyCell} />}
              </View>
            ))}
          </View>

          <Text style={[styles.footer, { color: theme.textSecondary }]}>
            Fotografías y marcas pendientes de verificar. No se muestran existencias ni opciones de compra.
          </Text>
        </>
      ) : (
        <View style={[styles.productionEmpty, { backgroundColor: theme.backgroundElement }]}>
          <Text style={[styles.productionTitle, { color: theme.text }]}>Catálogo en preparación</Text>
          <Text style={[styles.productionText, { color: theme.textSecondary }]}>
            Los productos se mostrarán cuando sus datos estén verificados y publicados en la API.
          </Text>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 780, alignSelf: 'center', paddingHorizontal: 18 },
  header: { gap: 5, marginBottom: 22 },
  brand: { fontSize: 12, fontWeight: '900', letterSpacing: 2.4, color: '#C66728' },
  heading: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  subtitle: { fontSize: 14, lineHeight: 21 },
  notice: { backgroundColor: '#FFF4E5', borderColor: '#F1CE9B', borderWidth: 1, padding: 14, borderRadius: 14, marginBottom: 20, gap: 6 },
  noticeTitle: { fontSize: 11, fontWeight: '800', color: '#78400D', letterSpacing: 0.5 },
  noticeText: { fontSize: 12, lineHeight: 19, color: '#75481D' },
  filters: { gap: 8, paddingBottom: 18 },
  filterChip: { minHeight: 40, justifyContent: 'center', borderRadius: 22, paddingHorizontal: 15 },
  filterLabel: { fontSize: 13, fontWeight: '700' },
  sectionTitle: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12, gap: 8 },
  sectionHeading: { fontSize: 18, fontWeight: '800' },
  counter: { fontSize: 12, fontWeight: '600' },
  grid: { gap: 12 },
  row: { flexDirection: 'row', alignItems: 'stretch', gap: 12 },
  card: { flex: 1, minWidth: 0, borderRadius: 17, borderWidth: 1, padding: 9, overflow: 'hidden' },
  photo: { height: 110, borderRadius: 12, alignItems: 'center', justifyContent: 'center', gap: 4 },
  photoIcon: { fontSize: 36 },
  missingPhoto: { fontSize: 10, fontWeight: '700' },
  cardContent: { flexGrow: 1, paddingHorizontal: 3, paddingTop: 11, paddingBottom: 7 },
  categoryText: { fontSize: 11, fontWeight: '600', marginBottom: 6 },
  productName: { fontSize: 13, lineHeight: 18, fontWeight: '700', minHeight: 54 },
  price: { marginTop: 8, fontSize: 21, fontWeight: '900' },
  demoPriceLabel: { marginTop: 4, fontSize: 9, color: '#AD642A', fontWeight: '800', letterSpacing: 0.2 },
  emptyCell: { flex: 1 },
  footer: { fontSize: 12, lineHeight: 19, marginTop: 22, textAlign: 'center' },
  productionEmpty: { marginTop: 16, padding: 24, gap: 12, borderRadius: 16 },
  productionTitle: { fontSize: 18, fontWeight: '700' },
  productionText: { fontSize: 14, lineHeight: 21 },
});
