import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/hooks/use-theme';
import {
  type CatalogProductDetail,
  type DemoCatalogProduct,
  getCatalogService,
} from '@/services/catalog.service';
import { ApiError } from '@/services/http/errors';

const demoMode = __DEV__ && process.env.EXPO_PUBLIC_CATALOG_MODE === 'demo';

type VisibleProduct = CatalogProductDetail | DemoCatalogProduct;
type DetailState =
  | { status: 'loading' }
  | { status: 'loaded'; product: VisibleProduct }
  | { status: 'not-found' }
  | { status: 'error' };

const categoryIllustrations: Record<string, string> = {
  Cuadernos: '📓',
  Arte: '🎨',
  Oficina: '✏️',
};

function goBack() {
  if (router.canGoBack()) router.back();
  else router.replace('/explore');
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const [state, setState] = useState<DetailState>({ status: 'loading' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });

    async function load() {
      try {
        const service = getCatalogService();
        const product = demoMode
          ? await service.demoProduct(id, { signal: controller.signal })
          : await service.product(id, { signal: controller.signal });
        if (!controller.signal.aborted) setState({ status: 'loaded', product });
      } catch (error) {
        if (controller.signal.aborted) return;
        const notFound = error instanceof ApiError &&
          (error.status === 404 || error.kind === 'configuration');
        setState({ status: notFound ? 'not-found' : 'error' });
      }
    }
    void load();
    return () => controller.abort();
  }, [id, reload]);

  const product = state.status === 'loaded' ? state.product : null;
  const description = product && 'description' in product
    ? product.description
    : 'La descripción de este producto está pendiente de revisión para la demostración.';

  return (
    <ScrollView
      style={[styles.screen, { backgroundColor: theme.background }]}
      contentContainerStyle={[
        styles.content,
        { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 40 },
      ]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Volver al catálogo"
        onPress={goBack}
        style={[styles.backButton, { backgroundColor: theme.backgroundElement }]}>
        <Text style={[styles.backText, { color: theme.text }]}>←  Volver al catálogo</Text>
      </Pressable>

      {state.status === 'loading' ? (
        <View style={styles.status}>
          <ActivityIndicator size="large" color="#1F5489" />
          <Text style={[styles.message, { color: theme.textSecondary }]}>Consultando producto…</Text>
        </View>
      ) : state.status === 'not-found' ? (
        <View style={styles.status}>
          <Text style={[styles.statusTitle, { color: theme.text }]}>Producto no encontrado</Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>
            Este artículo ya no está disponible para consultarse.
          </Text>
        </View>
      ) : state.status === 'error' ? (
        <View style={styles.status}>
          <Text style={[styles.statusTitle, { color: theme.text }]}>No se pudo cargar el producto</Text>
          <Text style={[styles.message, { color: theme.textSecondary }]}>
            Comprueba la conexión con Express y vuelve a intentarlo.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setReload((value) => value + 1)}
            style={styles.retryButton}>
            <Text style={styles.retryText}>Volver a intentar</Text>
          </Pressable>
        </View>
      ) : product ? (
        <>
          <Text style={styles.brand}>LA PAPE</Text>
          <Text style={[styles.heading, { color: theme.text }]}>Detalle del producto</Text>

          <View style={[styles.photo, { backgroundColor: theme.backgroundElement }]}>
            {product.image_url ? (
              <Image
                source={{ uri: product.image_url }}
                style={styles.productImage}
                contentFit="contain"
                accessibilityLabel={'Imagen de ' + product.name}
              />
            ) : (
              <>
                <Text style={styles.illustration}>{categoryIllustrations[product.category_name] ?? '📦'}</Text>
                <Text style={[styles.photoText, { color: theme.textSecondary }]}>Fotografía pendiente</Text>
              </>
            )}
          </View>

          <Text style={[styles.category, { color: theme.textSecondary }]}>{product.category_name}</Text>
          <Text style={[styles.productName, { color: theme.text }]}>{product.name}</Text>
          <Text style={[styles.sku, { color: theme.textSecondary }]}>Código: {product.sku}</Text>
          <Text style={[styles.price, { color: theme.text }]}>${product.price} MXN</Text>
          {demoMode && <Text style={styles.priceDisclaimer}>PRECIO DE DEMOSTRACIÓN</Text>}

          <View style={[styles.separator, { backgroundColor: theme.backgroundSelected }]} />
          <Text style={[styles.descriptionHeading, { color: theme.text }]}>Descripción</Text>
          <Text style={[styles.description, { color: theme.textSecondary }]}>{description}</Text>

          <View style={styles.notice}>
            <Text style={styles.noticeTitle}>
              {demoMode ? 'ARTÍCULO DE DEMOSTRACIÓN' : 'CATÁLOGO EN DESARROLLO'}
            </Text>
            <Text style={styles.noticeText}>
              {demoMode
                ? 'Información tomada del respaldo original y consultada desde Neon. La marca, la fotografía y el inventario aún no están verificados.'
                : 'Consulta informativa. Aún no hay funciones de compra disponibles.'}
            </Text>
            <Text style={styles.noSales}>Compras no disponibles.</Text>
          </View>
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { width: '100%', maxWidth: 780, alignSelf: 'center', paddingHorizontal: 20 },
  backButton: {
    alignSelf: 'flex-start', borderRadius: 12, paddingHorizontal: 15,
    paddingVertical: 11, marginBottom: 24, minHeight: 44, justifyContent: 'center',
  },
  backText: { fontSize: 14, fontWeight: '700' },
  brand: { fontSize: 12, fontWeight: '900', letterSpacing: 2.4, color: '#C66728', marginBottom: 7 },
  heading: { fontSize: 28, fontWeight: '800', marginBottom: 24 },
  photo: {
    minHeight: 250, borderRadius: 18, alignItems: 'center', justifyContent: 'center',
    marginBottom: 24, overflow: 'hidden',
  },
  productImage: { width: '100%', height: 250 },
  illustration: { fontSize: 80, marginBottom: 9 },
  photoText: { fontSize: 13, fontWeight: '600' },
  category: { fontSize: 14, fontWeight: '700', marginBottom: 8 },
  productName: { fontSize: 25, fontWeight: '800', lineHeight: 33, marginBottom: 6 },
  sku: { fontSize: 13, marginBottom: 19 },
  price: { fontSize: 32, fontWeight: '900' },
  priceDisclaimer: { fontSize: 11, fontWeight: '800', letterSpacing: 0.6, color: '#AD642A', marginTop: 4 },
  separator: { height: 1, marginVertical: 27 },
  descriptionHeading: { fontSize: 19, fontWeight: '800', marginBottom: 10 },
  description: { fontSize: 15, lineHeight: 24 },
  notice: {
    backgroundColor: '#FFF4E5', borderWidth: 1, borderColor: '#F1CE9B',
    borderRadius: 15, padding: 17, marginTop: 26, gap: 8,
  },
  noticeTitle: { fontSize: 12, fontWeight: '800', color: '#78400D' },
  noticeText: { fontSize: 13, lineHeight: 21, color: '#75481D' },
  noSales: { fontSize: 13, fontWeight: '800', color: '#78400D' },
  status: { paddingVertical: 70, alignItems: 'center', gap: 16 },
  statusTitle: { fontSize: 19, fontWeight: '800', textAlign: 'center' },
  message: { fontSize: 14, lineHeight: 22, textAlign: 'center' },
  retryButton: { backgroundColor: '#1F5489', borderRadius: 12, paddingHorizontal: 18, paddingVertical: 12 },
  retryText: { color: '#FFFFFF', fontWeight: '700', fontSize: 14 },
});
