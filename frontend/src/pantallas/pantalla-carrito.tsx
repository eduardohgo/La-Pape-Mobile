import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ProductVisual, ShopStatus } from '@/components/catalogo/componentes-catalogo';
import { PurchaseButton, PurchaseFrame, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { useCart } from '@/features/compra-local/proveedor-carrito';
import { useCommercialProducts } from '@/features/compra-local/use-productos-comerciales';
import { formatMoney, priceCents, resolveCart } from '@/features/compra-local/carrito';

export function CartContents({ checkout = false }: { checkout?: boolean }) {
  const cart = useCart();
  const products = useCommercialProducts();
  if (products.status === 'loading') return <ShopStatus title="Consultando precios actuales…" loading />;
  if (products.status === 'error') return <ShopStatus title="No pudimos consultar el catálogo" message="Tu lista local se conserva. Revisa la conexión." onRetry={products.retry} />;
  let resolved;
  try { resolved = resolveCart(cart.value, products.products); }
  catch { return <ShopStatus title="Revisa las cantidades" message="La cantidad supera el límite de cálculo. Puedes vaciar la lista y volver a agregar artículos." onRetry={cart.clear} retryLabel="Vaciar carrito" />; }
  return <>
    {resolved.lines.map(({ product, quantity, cents }) => <View key={product.id} style={styles.line}>
      <Pressable style={styles.visual} accessibilityRole="button" accessibilityLabel={`Ver ${product.name}`}
        onPress={() => router.push({ pathname: '/products/[id]', params: { id: product.id } })}><ProductVisual product={product} compact /></Pressable>
      <View style={styles.description}>
        <Text style={ui.bold}>{product.name}</Text>
        <Text style={ui.text}>{product.brand_name}</Text>
        <Text style={ui.bold}>{formatMoney(cents)} MXN</Text>
        <Text style={styles.unit}>{formatMoney(priceCents(product.price))} por unidad</Text>
        {checkout ? <Text style={ui.text}>{quantity} {quantity === 1 ? 'pieza' : 'piezas'}</Text> : <View style={styles.controls}>
          <Pressable disabled={cart.saving || quantity <= 1} accessibilityRole="button" accessibilityLabel={`Disminuir cantidad de ${product.name}`}
            onPress={() => void cart.quantity(product.id, quantity - 1)} style={styles.quantity}><Text style={styles.symbol}>−</Text></Pressable>
          <Text accessibilityLiveRegion="polite" style={ui.bold}>{quantity}</Text>
          <Pressable disabled={cart.saving} accessibilityRole="button" accessibilityLabel={`Aumentar cantidad de ${product.name}`}
            onPress={() => void cart.quantity(product.id, quantity + 1)} style={styles.quantity}><Text style={styles.symbol}>+</Text></Pressable>
          <Pressable disabled={cart.saving} accessibilityRole="button" accessibilityLabel={`Eliminar ${product.name}`}
            onPress={() => void cart.remove(product.id)} style={styles.remove}><Text style={styles.deleteText}>Eliminar</Text></Pressable>
        </View>}
      </View>
    </View>)}
    {resolved.missing.map(id => <View key={id} style={ui.card}><Text style={ui.error}>Un artículo guardado ya no aparece en el catálogo público.</Text>
      <PurchaseButton title="Quitar artículo pendiente" onPress={() => void cart.remove(id)} /></View>)}
    <View style={[ui.card, styles.summary]}>
      <View style={ui.row}><Text style={ui.text}>Subtotal de artículos</Text><Text style={ui.bold}>{formatMoney(resolved.subtotal)} MXN</Text></View>
      <View style={ui.row}><Text style={ui.text}>Envío</Text><Text style={ui.text}>Por confirmar</Text></View>
      <View style={ui.row}><Text style={ui.heading}>Total de artículos</Text><Text style={ui.heading}>{formatMoney(resolved.subtotal)} MXN</Text></View>
    </View>
    {cart.error && <Text accessibilityRole="alert" style={ui.error}>{cart.error}</Text>}
    {!checkout && <><Text style={ui.note}>Lista guardada en este dispositivo. La compra y la disponibilidad se confirmarán cuando habilitemos pedidos.</Text>
      <PurchaseButton title="Continuar compra" disabled={cart.saving || resolved.missing.length > 0 || !resolved.lines.length}
        onPress={() => router.push('/checkout/direccion')} /></>}
  </>;
}

export default function CartScreen() {
  const cart = useCart();
  return <PurchaseFrame title="Carrito">
    {cart.status === 'loading' ? <ShopStatus title="Recuperando tu carrito…" loading />
      : cart.status === 'error' ? <><ShopStatus title="No pudimos abrir tu lista local" onRetry={cart.retry} />
        <PurchaseButton title="Restablecer carrito local" onPress={() => Alert.alert('Vaciar carrito', 'Se eliminará la lista guardada en este dispositivo.', [
          { text: 'Cancelar', style: 'cancel' }, { text: 'Vaciar', style: 'destructive', onPress: () => void cart.clear() },
        ])} /></>
      : !cart.value.length ? <><ShopStatus title="Tu carrito está vacío" message="Encuentra algo para tu próxima idea." />
        <PurchaseButton title="Explorar catálogo" onPress={() => router.navigate('/explore')} /></>
      : <CartContents />}
  </PurchaseFrame>;
}

const styles = StyleSheet.create({
  line: { flexDirection: 'row', gap: 12, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: '#EEEAF0' },
  visual: { width: 85, alignSelf: 'flex-start' },
  description: { flex: 1, gap: 4 },
  controls: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  quantity: { width: 40, height: 40, borderRadius: 15, backgroundColor: '#F6F5F9', alignItems: 'center', justifyContent: 'center' },
  symbol: { fontSize: 23, color: '#252334' },
  remove: { minHeight: 44, justifyContent: 'center', marginLeft: 'auto' },
  deleteText: { color: '#C32361', fontSize: 12, fontWeight: '700' },
  unit: { color: '#726D7D', fontSize: 11 },
  summary: { backgroundColor: '#FFF6E2' },
});
