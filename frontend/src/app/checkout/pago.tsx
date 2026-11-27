import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';
import { CheckoutFrame } from '@/components/compra/marco-checkout';
import { Choice, PurchaseButton, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { checkoutAddressReady, type PaymentMethod } from '@/features/compra-local/checkout';
import { useCheckout } from '@/features/compra-local/proveedor-checkout';

export default function PaymentCheckout() {
  const { draft, setDraft } = useCheckout();
  const [error, setError] = useState(false);
  if (!checkoutAddressReady(draft)) return <CheckoutFrame step={2}>
    <Text style={ui.note}>Completa primero la dirección o elige recolección.</Text>
    <PurchaseButton title="Ir a Dirección" onPress={() => router.replace('/checkout/direccion')} />
  </CheckoutFrame>;
  const choices: { id: PaymentMethod; name: string; detail: string }[] = [
    { id: 'card', name: 'Tarjeta de crédito o débito', detail: 'Vista previa · pagos electrónicos pendientes' },
    { id: 'paypal', name: 'PayPal', detail: 'Vista previa · integración pendiente' },
    { id: 'store', name: 'Pago en tienda', detail: 'Disponibilidad por confirmar' },
  ];
  return <CheckoutFrame step={2}>
    <View style={ui.card}><Text style={ui.heading}>Método de pago</Text>
      {choices.map(choice => <Choice key={choice.id} title={choice.name} detail={choice.detail} selected={draft.payment === choice.id}
        onPress={() => { setDraft(value => ({ ...value, payment: choice.id })); setError(false); }} />)}
    </View>
    <Text style={ui.note}>Los pagos electrónicos aún no están habilitados. Esta pantalla permite revisar el diseño del método de pago.</Text>
    {error && <Text accessibilityRole="alert" style={ui.error}>Selecciona un método para continuar la vista previa.</Text>}
    <PurchaseButton title="Continuar" onPress={() => { if (!draft.payment) setError(true); else router.push('/checkout/confirmacion'); }} />
  </CheckoutFrame>;
}
