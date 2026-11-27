import { router, useLocalSearchParams } from 'expo-router';
import { Text, View } from 'react-native';
import { ProductVisual, ShopStatus } from '@/components/catalogo/componentes-catalogo';
import { AccountGate } from '@/components/compra/marco-cuenta';
import { PurchaseButton, PurchaseFrame, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { formatMoney } from '@/features/compra-local/carrito';
import { buildDemoOrders, orderLabels, orderProgress, trackingSteps } from '@/features/compra-local/pedidos-demostracion';
import { useCommercialProducts } from '@/features/compra-local/use-productos-comerciales';

function DemoDetail({ id }: { id: string }) {
  const products = useCommercialProducts();
  if (products.status === 'loading') return <ShopStatus title="Preparando seguimiento…" loading />;
  if (products.status === 'error') return <ShopStatus title="No pudimos cargar los artículos del ejemplo" onRetry={products.retry} />;
  const order = buildDemoOrders(products.products).find(value => value.id === id);
  if (!order) return <ShopStatus title="Ejemplo no encontrado" />;
  return <>
    <Text style={ui.note}>Demostración · sin pedido real, fechas de entrega ni movimiento de inventario.</Text>
    <Text style={ui.heading}>{orderLabels[order.status]}</Text>
    <View style={{ paddingLeft: 8, gap: 0 }}>
      {trackingSteps.map((step, index) => <View key={step} style={{ flexDirection: 'row', gap: 15, minHeight: 62 }}>
        <View style={{ alignItems: 'center', width: 18 }}>
          <View style={{ width: 15, height: 15, borderRadius: 8, backgroundColor: index <= orderProgress[order.status] ? '#1689E7' : '#D2D0DC' }} />
          {index < trackingSteps.length - 1 && <View style={{ width: 2, flex: 1, backgroundColor: index < orderProgress[order.status] ? '#1689E7' : '#D2D0DC' }} />}
        </View>
        <Text style={[ui.bold, { flex: 1 }]}>{step}</Text>
      </View>)}
    </View>
    <View style={[ui.card, { backgroundColor: '#FFF0F6' }]}><Text style={ui.heading}>Productos del ejemplo</Text>
      {order.lines.map(({ product, quantity, cents }) => <View key={product.id} style={[ui.row, { alignItems: 'flex-start' }]}>
        <View style={{ width: 70 }}><ProductVisual product={product} compact /></View>
        <View style={{ flex: 1, gap: 6 }}><Text style={ui.bold}>{product.name}</Text><Text style={ui.text}>{quantity} pieza</Text><Text style={ui.bold}>{formatMoney(cents)} MXN</Text></View>
      </View>)}
      <View style={ui.row}><Text style={ui.heading}>Total de artículos</Text><Text style={ui.bold}>{formatMoney(order.subtotal)} MXN</Text></View>
    </View>
  </>;
}

export default function OrderDetailScreen() {
  const { id, demo } = useLocalSearchParams<{ id: string; demo?: string }>();
  return <PurchaseFrame title="Detalle de pedido" active="profile" back="/pedidos"><AccountGate>
    {demo === '1' && /^ejemplo-(processing|shipping|delivered)$/.test(id ?? '') ? <DemoDetail id={id} />
      : <ShopStatus title="Pedido pendiente de consulta" message="El servicio de pedidos aún no está disponible. No se ha consultado ni creado un pedido." />}
    <PurchaseButton title="Mis pedidos" onPress={() => router.navigate('/pedidos')} />
  </AccountGate></PurchaseFrame>;
}
