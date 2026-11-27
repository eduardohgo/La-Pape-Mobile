import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { CheckoutFrame } from '@/components/compra/marco-checkout';
import { PurchaseButton, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { checkoutReviewReady } from '@/features/compra-local/checkout';
import { useCheckout } from '@/features/compra-local/proveedor-checkout';
import { CartContents } from '@/pantallas/pantalla-carrito';

export default function ConfirmationCheckout() {
  const { draft } = useCheckout();
  return <CheckoutFrame step={3}>
    {checkoutReviewReady(draft) ? <>
      <View style={ui.card}><Text style={ui.heading}>Resumen del pedido</Text>
        <Text style={ui.text}>{draft.delivery === 'home' ? 'Envío a domicilio' : 'Recolección en sucursal'}</Text>
        {draft.delivery === 'home' && <Text style={ui.text}>{draft.address.recipient}{'\n'}{draft.address.street} {draft.address.number}{'\n'}{draft.address.neighborhood}, {draft.address.city}{'\n'}{draft.address.region}, C.P. {draft.address.postalCode}</Text>}
        <Text style={ui.text}>Método seleccionado · {draft.payment === 'card' ? 'Tarjeta' : draft.payment === 'paypal' ? 'PayPal' : 'Pago en tienda'}</Text>
      </View>
      <CartContents checkout />
      <Text style={ui.note}>Los pedidos aún no están habilitados. Este resumen no registra una compra ni reserva existencias.</Text>
      <PurchaseButton title="Confirmar pedido" disabled />
    </> : <><Text style={ui.note}>Completa Dirección y Pago antes de revisar el resumen.</Text>
      <PurchaseButton title="Completar los pasos" onPress={() => router.replace('/checkout/direccion')} /></>}
  </CheckoutFrame>;
}
