import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ProductVisual, ShopStatus } from '@/components/catalogo/componentes-catalogo';
import { AccountGate } from '@/components/compra/marco-cuenta';
import { PurchaseButton, PurchaseFrame, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { formatMoney } from '@/features/compra-local/carrito';
import { buildDemoOrders, orderLabels, type OrderStatus } from '@/features/compra-local/pedidos-demostracion';
import { useCommercialProducts } from '@/features/compra-local/use-productos-comerciales';

function DemoOrders() {
  const products = useCommercialProducts();
  const [filter, setFilter] = useState<OrderStatus | 'all'>('all');
  if (products.status === 'loading') return <ShopStatus title="Preparando ejemplos…" loading />;
  if (products.status === 'error') return <ShopStatus title="No se pudieron preparar los ejemplos" onRetry={products.retry} />;
  const orders = buildDemoOrders(products.products);
  return <>
    <Text style={ui.note}>Demostración de diseño. Estos ejemplos no pertenecen a tu historial y no registran compras.</Text>
    <View style={[ui.row, { flexWrap: 'wrap', justifyContent: 'flex-start' }]}>
      {(['all', 'processing', 'shipping', 'delivered'] as const).map(status => <Pressable key={status} accessibilityRole="button"
        accessibilityState={{ selected: filter === status }} onPress={() => setFilter(status)}
        style={{ borderRadius: 18, backgroundColor: filter === status ? '#FFDF57' : '#F5F4F8', padding: 12, minHeight: 44 }}>
        <Text style={{ color: '#252334', fontSize: 12 }}>{status === 'all' ? 'Todos' : orderLabels[status]}</Text>
      </Pressable>)}
    </View>
    {!orders.length && <ShopStatus title="No hay artículos para mostrar ejemplos" />}
    {orders.filter(order => filter === 'all' || order.status === filter).map(order => <View key={order.id} style={ui.card}>
      <View style={ui.row}><Text style={ui.bold}>Pedido de ejemplo</Text>
        <Text style={{ color: '#166694', backgroundColor: '#E1F3FF', borderRadius: 12, padding: 8, fontSize: 12 }}>{orderLabels[order.status]}</Text></View>
      <View style={[ui.row, { justifyContent: 'flex-start' }]}>{order.lines.map(({ product }) => <View key={product.id} style={{ width: 64 }}><ProductVisual product={product} compact /></View>)}</View>
      <View style={ui.row}><Text style={ui.text}>{order.lines.length} artículos de ejemplo</Text><Text style={ui.bold}>{formatMoney(order.subtotal)} MXN</Text></View>
      <PurchaseButton title="Ver seguimiento de ejemplo" onPress={() => router.push({ pathname: '/pedidos/[id]', params: { id: order.id, demo: '1' } })} />
    </View>)}
  </>;
}

export default function OrdersScreen() {
  const [demo, setDemo] = useState(false);
  return <PurchaseFrame title="Mis pedidos" active="profile" back="/perfil"><AccountGate>
    <Text style={ui.text}>Consulta el estado y los detalles de tus pedidos.</Text>
    {demo ? <><DemoOrders /><PurchaseButton title="Salir de los ejemplos" onPress={() => setDemo(false)} /></>
      : <><ShopStatus title="Todavía no hay pedidos para consultar" message="El historial estará disponible cuando habilitemos el servicio de pedidos." />
        <PurchaseButton title="Ver ejemplos de diseño" onPress={() => setDemo(true)} /></>}
  </AccountGate></PurchaseFrame>;
}
