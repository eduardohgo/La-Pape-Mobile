import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { BottomTabInset } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { type CatalogCategory, type CatalogProduct, type DemoCatalogProduct, getCatalogService } from '@/services/catalog.service';

// Public variables only. Never include Neon credentials in Expo.
// Preview can run ONLY in Metro/dev builds and must be explicitly enabled.
const demoMode = __DEV__ && process.env.EXPO_PUBLIC_CATALOG_MODE === 'demo';
type VisibleProduct = CatalogProduct | DemoCatalogProduct;

const categoryIllustrations: Record<string, string> = {
  Cuadernos: '📓',
  Arte: '🎨',
  Oficina: '✏️',
};

function ProductCard({ product }: { product: VisibleProduct }) {
  const theme = useTheme();
  const icon = categoryIllustrations[product.category_name] ?? '📦';
  return (
    <Pressable
      style={[styles.card, { backgroundColor: theme.background, borderColor: theme.backgroundSelected }]}
      accessibilityRole="button"
      accessibilityHint="Abrir detalle del producto"
      onPress={() => router.push({ pathname: '/products/[id]', params: { id: product.id } })}
      accessibilityLabel={`${product.name}. ${product.category_name}. ${product.price} pesos mexicanos. ${demoMode ? 'Precio de demostración. ' : ''}Compras no disponibles.`}>
      <View style={[styles.photo, { backgroundColor: theme.backgroundElement }]}>
        {product.image_url ? (
          <Image source={{ uri: product.image_url }} style={styles.productImage} contentFit="contain" />
        ) : (
          <>
            <Text style={styles.photoIcon} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              {icon}
            </Text>
            <Text style={[styles.missingPhoto, { color: theme.textSecondary }]}>Sin fotografía</Text>
          </>
        )}
      </View>
      <View style={styles.cardContent}>
        <Text style={[styles.categoryText, { color: theme.textSecondary }]}>{product.category_name}</Text>
        <Text style={[styles.productName, { color: theme.text }]} numberOfLines={3}>
          {product.name}
        </Text>
        <Text style={[styles.price, { color: theme.text }]}>${product.price}</Text>
        <Text style={styles.demoPriceLabel}>{demoMode ? 'PRECIO DE DEMOSTRACIÓN' : 'MXN'}</Text>
      </View>
    </Pressable>
  );
}

export default function CatalogScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [categories, setCategories] = useState<CatalogCategory[]>([]);
  const [products, setProducts] = useState<VisibleProduct[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoading(true);
      setError(false);
      try {
        const service = getCatalogService();
        if (demoMode) {
          const previews: DemoCatalogProduct[] = await service.demoProducts({ signal: controller.signal });
          if (controller.signal.aborted) return;
          const uniqueCategories: CatalogCategory[] = [];
          const seenCategories = new Set<string>();
          for (const product of previews) {
            if (!seenCategories.has(product.category_id)) {
              seenCategories.add(product.category_id);
              uniqueCategories.push({
                id: product.category_id,
                name: product.category_name,
                description: null,
              });
            }
          }
          setCategories(uniqueCategories);
          setProducts(previews);
        } else {
          const [loadedCategories, loadedProducts] = await Promise.all([
            service.categories({ signal: controller.signal }),
            service.products({ signal: controller.signal }),
          ]);
          if (controller.signal.aborted) return;
          setCategories(loadedCategories);
          setProducts(loadedProducts);
        }
      } catch {
        if (!controller.signal.aborted) setError(true);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [reload]);

  const filtered = useMemo(
    () => selectedCategory === 'all'
      ? products
      : products.filter((product) => product.category_id === selectedCategory),
    [products, selectedCategory],
  );
  const rows = Array.from({ length: Math.ceil(filtered.length / 2) }, (_, index) =>
    filtered.slice(index * 2, index * 2 + 2));

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
          {demoMode ? 'Artículos del respaldo original, mostrados solo para pruebas.' : 'Productos consultados desde nuestra API de La Pape.'}
        </Text>
      </View>

      {__DEV__ && (
        <View style={styles.notice}>
          <Text style={styles.noticeTitle}>{demoMode ? 'DEMOSTRACIÓN · SIN VENTAS' : 'DESARROLLO · SIN COMPRAS'}</Text>
          <Text style={styles.noticeText}>
            {demoMode
              ? 'Los artículos proceden del ZIP anterior y se consultan desde Neon. Precios provisionales, fotografías genéricas, marcas ocultas y compras deshabilitadas.'
              : 'El catálogo se consulta desde Express y Neon. No hay funciones de compra habilitadas.'}
          </Text>
        </View>
      )}

      {loading ? (
        <View style={styles.status}>
          <ActivityIndicator size="large" color="#1F5489" />
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>Consultando catálogo…</Text>
        </View>
      ) : error ? (
        <View style={[styles.status, { backgroundColor: theme.backgroundElement, borderRadius: 16 }]}>
          <Text style={[styles.statusTitle, { color: theme.text }]}>No se pudo consultar el catálogo</Text>
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            Comprueba que Express esté encendido y que la URL de la API sea accesible desde este teléfono.
          </Text>
          <Pressable accessibilityRole="button" style={styles.retry} onPress={() => setReload((value) => value + 1)}>
            <Text style={styles.retryText}>Volver a intentar</Text>
          </Pressable>
        </View>
      ) : products.length === 0 ? (
        <View style={[styles.status, { backgroundColor: theme.backgroundElement, borderRadius: 16 }]}>
          <Text style={styles.emptyIcon}>📦</Text>
          <Text style={[styles.statusTitle, { color: theme.text }]}>{demoMode ? 'Aún no hay artículos de demostración' : 'Todavía no hay productos publicados'}</Text>
          <Text style={[styles.statusText, { color: theme.textSecondary }]}>
            {demoMode
              ? 'Todavía no se ha cargado el conjunto de prueba del ZIP en Neon.'
              : 'La conexión funciona, pero Neon aún no tiene artículos aprobados para mostrar.'}
          </Text>
          {!demoMode && __DEV__ && (
            <Text style={[styles.statusText, { color: theme.textSecondary }]}>
              Los diez productos de demostración están separados del catálogo comercial.
            </Text>
          )}
          <Pressable accessibilityRole="button" style={styles.retry} onPress={() => setReload((value) => value + 1)}>
            <Text style={styles.retryText}>Actualizar catálogo</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filters}
            accessibilityLabel="Filtrar productos por categoría">
            {[{ id: 'all', name: 'Todos' }, ...categories].map((item) => {
              const selected = item.id === selectedCategory;
              return (
                <Pressable
                  key={item.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => setSelectedCategory(item.id)}
                  style={[styles.filterChip, { backgroundColor: selected ? '#1F5489' : theme.backgroundElement }]}>
                  <Text style={[styles.filterLabel, { color: selected ? '#FFFFFF' : theme.text }]}>{item.name}</Text>
                </Pressable>
              );
            })}
          </ScrollView>

          <View style={styles.sectionTitle}>
            <Text style={[styles.sectionHeading, { color: theme.text }]}>{demoMode ? 'Productos de demostración' : 'Productos'}</Text>
            <Text style={[styles.counter, { color: theme.textSecondary }]}>{filtered.length} artículos</Text>
          </View>
          {filtered.length === 0 ? (
            <Text style={[styles.statusText, { color: theme.textSecondary }]}>No hay productos en esta categoría.</Text>
          ) : (
            <View style={styles.grid}>
              {rows.map((pair) => (
                <View key={pair[0].id} style={styles.row}>
                  <ProductCard product={pair[0]} />
                  {pair[1] ? <ProductCard product={pair[1]} /> : <View style={styles.emptyCell} />}
                </View>
              ))}
            </View>
          )}
          <Text style={[styles.footer, { color: theme.textSecondary }]}>
            Marcas no verificadas ocultas. No se muestran existencias ni opciones de compra.
          </Text>
        </>
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
  photo: { height: 110, borderRadius: 12, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  productImage: { width: '100%', height: '100%' },
  photoIcon: { fontSize: 36 },
  missingPhoto: { fontSize: 10, fontWeight: '700' },
  cardContent: { flexGrow: 1, paddingHorizontal: 3, paddingTop: 11, paddingBottom: 7 },
  categoryText: { fontSize: 11, fontWeight: '600', marginBottom: 6 },
  productName: { fontSize: 13, lineHeight: 18, fontWeight: '700', minHeight: 54 },
  price: { marginTop: 8, fontSize: 21, fontWeight: '900' },
  demoPriceLabel: { marginTop: 4, fontSize: 9, color: '#AD642A', fontWeight: '800', letterSpacing: 0.2 },
  emptyCell: { flex: 1 },
  footer: { fontSize: 12, lineHeight: 19, marginTop: 22, textAlign: 'center' },
  status: { marginTop: 24, alignItems: 'center', padding: 26, gap: 14 },
  statusTitle: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  statusText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
  emptyIcon: { fontSize: 40 },
  retry: { backgroundColor: '#1F5489', paddingHorizontal: 21, paddingVertical: 12, borderRadius: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
