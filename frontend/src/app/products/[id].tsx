import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeIcon } from '@/components/home/home-icon';
import {
  palette,
  PendingFeatureModal,
  ProductVisual,
  ShopHeader,
  ShopStatus,
} from '@/components/shop/shop-ui';
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

function returnToCatalog() {
  // Also reaches the catalog when this detail was opened from Home or a direct link.
  router.dismissTo('/explore');
}

export default function ProductDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.25;
  const [resolved, setResolved] = useState<{ key: string; result: DetailState } | null>(null);
  const [reload, setReload] = useState(0);
  const [pendingFeature, setPendingFeature] = useState<string | null>(null);
  const requestKey = `${id}:${reload}`;
  // Each UUID or retry remains loading until its own validated request completes.
  const state: DetailState = resolved?.key === requestKey ? resolved.result : { status: 'loading' };

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      try {
        const service = getCatalogService();
        const product = demoMode
          ? await service.demoProduct(id, { signal: controller.signal })
          : await service.product(id, { signal: controller.signal });
        if (!controller.signal.aborted) setResolved({ key: requestKey, result: { status: 'loaded', product } });
      } catch (error) {
        if (controller.signal.aborted) return;
        const invalidId = !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id ?? '');
        const notFound = error instanceof ApiError &&
          (error.status === 404 || (error.kind === 'configuration' && invalidId));
        setResolved({ key: requestKey, result: { status: notFound ? 'not-found' : 'error' } });
      }
    }
    void load();
    return () => controller.abort();
  }, [id, requestKey]);

  const product = state.status === 'loaded' ? state.product : null;
  const isDemo = product !== null && 'is_demo' in product && product.is_demo;
  const description = product && 'description' in product && product.description.trim()
    ? product.description
    : 'La descripción comercial de este producto está pendiente de revisión. Por ahora mostramos únicamente los datos disponibles en el catálogo.';
  const retry = () => setReload((value) => value + 1);

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}>
        <ShopHeader
          left={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Volver al catálogo"
              onPress={returnToCatalog}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <HomeIcon name="back" size={24} color={palette.ink} />
            </Pressable>
          }
          right={
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Favoritos: próximamente"
              onPress={() => setPendingFeature('Favoritos')}
              style={({ pressed }) => [styles.headerButton, pressed && styles.pressed]}>
              <HomeIcon name="heart" size={23} color={palette.pink} />
            </Pressable>
          }
        />

        <View style={styles.body}>
          {state.status === 'loading' ? (
            <ShopStatus title="Consultando producto…" message="Buscando una nueva idea para ti." loading />
          ) : state.status === 'not-found' ? (
            <ShopStatus
              title="Producto no encontrado"
              message="Este artículo ya no está disponible para consultarse. Puedes volver al catálogo o intentarlo nuevamente."
              onRetry={retry}
            />
          ) : state.status === 'error' ? (
            <ShopStatus
              title="No se pudo cargar el producto"
              message="Comprueba la conexión con Express y vuelve a intentarlo."
              onRetry={retry}
            />
          ) : product ? (
            <>
              <View style={styles.hero}>
                <ProductVisual product={product} large />
              </View>
              <View style={styles.photoCaption}>
                <View style={styles.captionDash} />
                <Text style={styles.captionText}>Un espacio para imaginar y crear</Text>
                <View style={styles.captionDash} />
              </View>

              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{product.category_name}</Text>
              </View>
              <Text accessibilityRole="header" style={[styles.productName, compact && styles.productNameCompact]}>{product.name}</Text>
              <Text style={styles.sku}>SKU · {product.sku}</Text>
              <Text style={styles.price}>${product.price} <Text style={styles.currency}>{product.currency}</Text></Text>

              {isDemo ? (
                <View style={styles.demoBadge}>
                  <Text style={styles.demoBadgeText}>ARTÍCULO DE DEMOSTRACIÓN</Text>
                  <Text style={styles.demoPriceText}>Precio provisional · no disponible para venta</Text>
                </View>
              ) : (
                <Text style={styles.noSalesText}>Consulta informativa · compras no disponibles</Text>
              )}

              <View style={styles.descriptionBlock}>
                <Text accessibilityRole="header" style={styles.sectionTitle}>Descripción</Text>
                <Text style={styles.description}>{description}</Text>
              </View>

              <View style={styles.futureVariants}>
                <View style={styles.futureLabelRow}>
                  <Text style={styles.sectionTitle}>Variantes</Text>
                  <Text style={styles.futureTag}>A FUTURO</Text>
                </View>
                <Text style={styles.futureText}>Aún no hay variantes verificadas para seleccionar.</Text>
              </View>

              <View style={[styles.quantityRow, compact && styles.quantityRowCompact]}>
                <View style={styles.quantityCopy}>
                  <Text style={styles.sectionTitle}>Cantidad</Text>
                  <Text style={styles.quantityHint}>Selección no disponible</Text>
                </View>
                <View style={styles.quantityControl}>
                  <Pressable disabled accessibilityRole="button" accessibilityLabel="Disminuir cantidad: no disponible" accessibilityState={{ disabled: true }} style={styles.quantityButton}>
                    <Text style={styles.quantitySymbol}>−</Text>
                  </Pressable>
                  <Text style={styles.quantityValue}>—</Text>
                  <Pressable disabled accessibilityRole="button" accessibilityLabel="Aumentar cantidad: no disponible" accessibilityState={{ disabled: true }} style={styles.quantityButton}>
                    <Text style={styles.quantitySymbol}>+</Text>
                  </Pressable>
                </View>
              </View>

              <View style={styles.infoGrid}>
                <View style={[styles.infoCard, styles.infoCategory]}>
                  <Text style={styles.infoLabel}>CATEGORÍA</Text>
                  <Text style={styles.infoValue}>{product.category_name}</Text>
                </View>
                <View style={[styles.infoCard, styles.infoSku]}>
                  <Text style={styles.infoLabel}>SKU</Text>
                  <Text style={styles.infoValue}>{product.sku}</Text>
                </View>
                <View style={[styles.infoCard, styles.infoCurrency]}>
                  <Text style={styles.infoLabel}>MONEDA</Text>
                  <Text style={styles.infoValue}>{product.currency}</Text>
                </View>
              </View>

              <View style={styles.purchaseNotice}>
                <Text style={styles.purchaseNoticeTitle}>Las compras llegarán más adelante</Text>
                <Text style={styles.purchaseNoticeText}>Por ahora puedes conocer el catálogo. No se reservan productos ni se generan pedidos.</Text>
              </View>
              <View style={[styles.purchaseButtons, compact && styles.purchaseButtonsCompact]}>
                <Pressable
                  disabled
                  accessibilityRole="button"
                  accessibilityLabel="Agregar al carrito: próximamente"
                  accessibilityState={{ disabled: true }}
                  style={[styles.purchaseButton, styles.cartButton]}>
                  <HomeIcon name="cart" color="#934968" size={20} />
                  <View style={styles.purchaseButtonCopy}>
                    <Text style={styles.cartLabel}>Agregar al carrito</Text>
                    <Text style={styles.cartPending}>Próximamente</Text>
                  </View>
                </Pressable>
                <Pressable
                  disabled
                  accessibilityRole="button"
                  accessibilityLabel="Comprar ahora: próximamente"
                  accessibilityState={{ disabled: true }}
                  style={[styles.purchaseButton, styles.buyButton]}>
                  <View style={styles.purchaseButtonCopy}>
                    <Text style={styles.buyLabel}>Comprar ahora</Text>
                    <Text style={styles.buyPending}>Próximamente</Text>
                  </View>
                  <HomeIcon name="arrow" color="#FFFFFF" size={18} />
                </Pressable>
              </View>
            </>
          ) : null}

          <Pressable
            accessibilityRole="button"
            onPress={returnToCatalog}
            style={({ pressed }) => [styles.catalogLink, pressed && styles.pressed]}>
            <HomeIcon name="back" size={17} color={palette.blue} />
            <Text style={styles.catalogLinkText}>Volver al catálogo</Text>
          </Pressable>
        </View>
      </ScrollView>
      <PendingFeatureModal feature={pendingFeature} onClose={() => setPendingFeature(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flex: 1 },
  body: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 16 },
  headerButton: { width: 46, height: 46, backgroundColor: '#FFFFFF', borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.75 },
  hero: { backgroundColor: '#FFF2AE', borderRadius: 26, borderWidth: 5, borderColor: '#FFFFFF', overflow: 'hidden', boxShadow: '0 3px 16px rgba(77, 62, 25, 0.07)' },
  photoCaption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 10, marginBottom: 18 },
  captionDash: { width: 13, height: 3, borderRadius: 2, backgroundColor: '#F49CBE' },
  captionText: { color: palette.muted, fontSize: 10, textAlign: 'center', flexShrink: 1 },
  categoryBadge: { alignSelf: 'flex-start', backgroundColor: '#EAF6FC', borderRadius: 13, paddingHorizontal: 12, paddingVertical: 6, marginBottom: 9 },
  categoryText: { fontSize: 12, color: '#296484', fontWeight: '700' },
  productName: { color: palette.ink, fontSize: 28, lineHeight: 35, fontWeight: '900', letterSpacing: -0.6 },
  productNameCompact: { fontSize: 25, lineHeight: 32 },
  sku: { color: palette.muted, fontSize: 12, lineHeight: 19, marginTop: 6 },
  price: { color: palette.ink, fontSize: 32, lineHeight: 43, fontWeight: '900', marginTop: 9 },
  currency: { fontSize: 18, fontWeight: '800' },
  demoBadge: { alignSelf: 'flex-start', borderRadius: 12, backgroundColor: '#FFF5D8', paddingHorizontal: 12, paddingVertical: 9, marginTop: 7, gap: 4 },
  demoBadgeText: { color: '#785519', fontSize: 10, fontWeight: '900', letterSpacing: 0.6 },
  demoPriceText: { color: '#785519', fontSize: 11, lineHeight: 17 },
  noSalesText: { color: palette.muted, fontSize: 12, lineHeight: 19, marginTop: 6 },
  descriptionBlock: { marginTop: 24, gap: 9 },
  sectionTitle: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  description: { color: '#665E72', fontSize: 14, lineHeight: 23 },
  futureVariants: { borderRadius: 16, borderWidth: 1, borderColor: '#F0EAF4', backgroundColor: '#FCFAFD', padding: 14, marginTop: 20, gap: 8 },
  futureLabelRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 12, justifyContent: 'space-between' },
  futureTag: { fontSize: 9, fontWeight: '800', letterSpacing: 0.8, color: '#866C94' },
  futureText: { fontSize: 12, lineHeight: 19, color: palette.muted },
  quantityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginTop: 20 },
  quantityRowCompact: { flexWrap: 'wrap' },
  quantityCopy: { flexShrink: 1, gap: 5 },
  quantityHint: { color: palette.muted, fontSize: 11, lineHeight: 17 },
  quantityControl: { flexDirection: 'row', alignItems: 'center', borderRadius: 23, borderWidth: 1, borderColor: '#ECE7EF', backgroundColor: '#FAF8FC' },
  quantityButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  quantitySymbol: { color: '#9B94A3', fontSize: 23, fontWeight: '600' },
  quantityValue: { color: '#8D8597', fontSize: 16, width: 28, textAlign: 'center' },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22 },
  infoCard: { flexGrow: 1, flexBasis: '29%', minWidth: 85, borderRadius: 14, padding: 11, gap: 7 },
  infoCategory: { backgroundColor: '#FFF5D9' },
  infoSku: { backgroundColor: '#FDEAF2' },
  infoCurrency: { backgroundColor: '#E8F5FC' },
  infoLabel: { color: '#6F647B', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  infoValue: { color: palette.ink, fontSize: 11, lineHeight: 16, fontWeight: '700', flexShrink: 1 },
  purchaseNotice: { marginTop: 23, gap: 5 },
  purchaseNoticeTitle: { color: palette.ink, fontSize: 12, fontWeight: '800' },
  purchaseNoticeText: { color: palette.muted, fontSize: 11, lineHeight: 18 },
  purchaseButtons: { flexDirection: 'row', alignItems: 'stretch', gap: 8, marginTop: 14 },
  purchaseButtonsCompact: { flexDirection: 'column' },
  purchaseButton: { flex: 1, borderRadius: 16, minHeight: 62, paddingHorizontal: 11, paddingVertical: 11, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 7 },
  purchaseButtonCopy: { alignItems: 'center', gap: 4, flexShrink: 1 },
  cartButton: { backgroundColor: '#FFF0F6', borderWidth: 1, borderColor: '#E1A2BF' },
  cartLabel: { color: '#934968', fontSize: 11, fontWeight: '800', textAlign: 'center' },
  cartPending: { color: '#934968', fontSize: 9, textAlign: 'center' },
  buyButton: { backgroundColor: '#AA5C7C' },
  buyLabel: { color: '#FFFFFF', fontSize: 11, fontWeight: '800', textAlign: 'center' },
  buyPending: { color: '#FFFFFF', fontSize: 9, textAlign: 'center' },
  catalogLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 20 },
  catalogLinkText: { color: palette.blue, fontSize: 12, fontWeight: '700' },
});
