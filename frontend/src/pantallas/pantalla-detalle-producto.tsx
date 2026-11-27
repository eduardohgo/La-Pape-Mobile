import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState, type ComponentRef } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeIcon } from '@/components/compartidos/iconos-papeleria';
import {
  palette,
  ProductVisual,
  ShopHeader,
  ShopStatus,
} from '@/components/catalogo/componentes-catalogo';
import { useProductDetailViewModel } from '@/features/catalogo/presentacion/hooks';
import { useCart } from '@/features/compra-local/proveedor-carrito';
import { FavoriteButton } from '@/components/compra/boton-favorito';
import { AddToCartButton, CartShortcut } from '@/components/compra/carrito-animado';
import { CartFlightScope, useCartFlight } from '@/components/compra/vuelo-carrito';

function returnToCatalog() {
  // Also reaches the catalog when this detail was opened from Home or a direct link.
  router.dismissTo('/explore');
}

function ProductDetailContent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.25;
  const { state, retry } = useProductDetailViewModel(id);
  const cart = useCart();
  const flight = useCartFlight();
  const photo = useRef<ComponentRef<typeof View>>(null);
  const [selection, setSelection] = useState({ id, quantity: 1 });
  const quantity = selection.id === id ? selection.quantity : 1;
  function changeQuantity(delta: number) {
    // Technical limit per tap/operation, never a statement of physical availability.
    setSelection(previous => ({ id, quantity: Math.max(1, Math.min(99, (previous.id === id ? previous.quantity : 1) + delta)) }));
  }
  const unitsInCart = cart.value.find(entry => entry.id === id)?.quantity ?? 0;

  const product = state.status === 'loaded' ? state.product : null;
  // An unverified demo description is never manufactured or exposed.
  const description = product && 'description' in product && product.description.trim()
    ? product.description
    : null;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
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
          right={<CartShortcut />}
        />
      <ScrollView
        style={styles.scroll}
        scrollEnabled={!flight?.busy}
        contentContainerStyle={{ paddingBottom: insets.bottom + 28 }}
        showsVerticalScrollIndicator={false}>
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
              message="Revisa tu conexión e inténtalo nuevamente."
              onRetry={retry}
            />
          ) : product ? (
            <>
              <View ref={photo} collapsable={false} style={styles.hero}>
                <ProductVisual product={product} large />
              </View>
              <View style={styles.photoCaption}>
                <View style={styles.captionDash} />
                <Text style={styles.captionText}>Un espacio para imaginar y crear</Text>
                <View style={styles.captionDash} />
              </View>

              <View style={styles.categoryRow}>
              <View style={styles.categoryBadge}>
                <Text style={styles.categoryText}>{product.category_name}</Text>
              </View>
              {'brand_id' in product && <FavoriteButton id={product.id} name={product.name} />}
              </View>
              <Text accessibilityRole="header" style={[styles.productName, compact && styles.productNameCompact]}>{product.name}</Text>
              <Text style={styles.sku}>SKU · {product.sku}</Text>
              <Text style={styles.price}>${product.price} <Text style={styles.currency}>{product.currency}</Text></Text>

              {description && (
                <View style={styles.descriptionBlock}>
                  <Text accessibilityRole="header" style={styles.sectionTitle}>Descripción</Text>
                  <Text style={styles.description}>{description}</Text>
                </View>
              )}

              {'brand_id' in product && <View style={styles.purchaseCard}>
                <View style={styles.quantityRow}>
                  <Text style={styles.sectionTitle}>Cantidad para agregar</Text>
                  <View style={styles.quantityControls}>
                    <Pressable accessibilityRole="button" accessibilityLabel="Disminuir unidades para agregar" accessibilityState={{ disabled: quantity <= 1 || !!flight?.busy }} disabled={quantity <= 1 || !!flight?.busy}
                      onPress={() => changeQuantity(-1)} style={[styles.quantityButton, quantity <= 1 && { opacity: 0.4 }]}><Text style={styles.quantitySymbol}>−</Text></Pressable>
                    <Text accessibilityLiveRegion="polite" accessibilityLabel={`${quantity} unidades para agregar`} style={styles.quantityValue}>{quantity}</Text>
                    <Pressable accessibilityRole="button" accessibilityLabel="Aumentar unidades para agregar" accessibilityState={{ disabled: quantity >= 99 || !!flight?.busy }} disabled={quantity >= 99 || !!flight?.busy}
                      onPress={() => changeQuantity(1)} style={styles.quantityButton}><Text style={styles.quantitySymbol}>+</Text></Pressable>
                  </View>
                </View>
                <Text accessibilityLiveRegion="polite" style={styles.inCart}>{cart.status === 'loading' ? 'Recuperando tu carrito…' : cart.status === 'error' ? 'Revisa el estado de tu carrito para continuar.' : unitsInCart
                  ? `Ya tienes ${unitsInCart} ${unitsInCart === 1 ? 'unidad' : 'unidades'} en el carrito.` : 'Este artículo todavía no está en tu carrito.'}</Text>
                <AddToCartButton key={product.id} product={product} source={photo} quantity={quantity} />
                <Pressable accessibilityRole="button" onPress={() => router.push('/carrito')} style={styles.viewCart}><Text style={styles.catalogLinkText}>Ver carrito</Text><HomeIcon name="arrow" color={palette.blue} size={18} /></Pressable>
                {cart.error && <Text accessibilityRole="alert" style={styles.description}>{cart.error}</Text>}
              </View>}
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
    </View>
  );
}

export default function ProductDetailScreen() {
  return <CartFlightScope><ProductDetailContent /></CartFlightScope>;
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
  descriptionBlock: { marginTop: 24, gap: 9 },
  categoryRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  purchaseCard: { marginTop: 24, padding: 16, borderRadius: 23, borderWidth: 1, borderColor: '#F3D6E2', backgroundColor: '#FFF8FB', gap: 12 },
  quantityRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  quantityControls: { flexDirection: 'row', alignItems: 'center', gap: 5, padding: 3, borderRadius: 18, borderWidth: 1, borderColor: '#EDD5E2', backgroundColor: '#FFFFFF' },
  quantityButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 15, backgroundColor: '#FFF1CF' },
  quantitySymbol: { fontSize: 25, color: palette.ink },
  quantityValue: { minWidth: 30, textAlign: 'center', fontSize: 18, fontWeight: '800', color: palette.ink },
  inCart: { color: '#726D7D', fontSize: 13, lineHeight: 20 },
  viewCart: { flexDirection: 'row', gap: 8, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  sectionTitle: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  description: { color: '#665E72', fontSize: 14, lineHeight: 23 },
  infoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 22 },
  infoCard: { flexGrow: 1, flexBasis: '29%', minWidth: 85, borderRadius: 14, padding: 11, gap: 7 },
  infoCategory: { backgroundColor: '#FFF5D9' },
  infoSku: { backgroundColor: '#FDEAF2' },
  infoCurrency: { backgroundColor: '#E8F5FC' },
  infoLabel: { color: '#6F647B', fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  infoValue: { color: palette.ink, fontSize: 11, lineHeight: 16, fontWeight: '700', flexShrink: 1 },
  catalogLink: { minHeight: 48, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, marginTop: 20 },
  catalogLinkText: { color: palette.blue, fontSize: 12, fontWeight: '700' },
});
