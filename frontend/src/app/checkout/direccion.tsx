import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CheckoutFrame } from '@/components/compra/marco-checkout';
import { Choice, PurchaseButton, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { AddressForm } from '@/components/compra/formulario-direccion';
import { useCheckout } from '@/features/compra-local/proveedor-checkout';
import { checkoutAddressReady, validateAddress, type AddressField } from '@/features/compra-local/checkout';
import { useAddresses } from '@/features/compra-local/use-direcciones';

function SavedAddressChoices() {
  const addresses = useAddresses();
  const { draft, setDraft } = useCheckout();
  return <View style={{ gap: 10 }}>
    {addresses.status === 'loading' && <Text style={ui.text}>Recuperando direcciones guardadas…</Text>}
    {addresses.status === 'error' && <><Text style={ui.error}>No pudimos leer las direcciones locales. Puedes escribir una dirección abajo.</Text>
      <PurchaseButton title="Reintentar direcciones" onPress={() => void addresses.retry()} /></>}
    {addresses.status === 'ready' && addresses.value.map(address => <Choice key={address.id}
      title={address.label} detail={`${address.street} ${address.number}, ${address.city}, C.P. ${address.postalCode}`}
      selected={'id' in draft.address && draft.address.id === address.id} onPress={() => setDraft(value => ({ ...value, address }))} />)}
    <Pressable accessibilityRole="button" style={{ minHeight: 44, justifyContent: 'center' }} onPress={() => router.push('/direcciones')}>
      <Text style={{ color: '#176EAE', fontWeight: '700' }}>Gestionar mis direcciones</Text>
    </Pressable>
  </View>;
}

export default function AddressCheckout() {
  const { draft, setDraft } = useCheckout();
  const [errors, setErrors] = useState<Partial<Record<AddressField, string>>>({});
  function next() {
    if (!checkoutAddressReady(draft)) { setErrors(validateAddress(draft.address)); return; }
    router.push('/checkout/pago');
  }
  return <CheckoutFrame step={1}>
    <Text style={ui.heading}>Método de envío</Text>
    <Choice title="Envío a domicilio" detail="Costo y cobertura por confirmar" selected={draft.delivery === 'home'} onPress={() => setDraft(value => ({ ...value, delivery: 'home' }))} />
    <Choice title="Recolección en sucursal" detail="Sucursal y horario pendientes de confirmar" selected={draft.delivery === 'pickup'} onPress={() => setDraft(value => ({ ...value, delivery: 'pickup' }))} />
    {draft.delivery === 'home' && <View style={ui.card}>
      <Text style={ui.heading}>Dirección de envío</Text>
      <SavedAddressChoices />
      <AddressForm value={draft.address} errors={errors} onChange={address => setDraft(value => ({ ...value, address }))} />
    </View>}
    <Text style={ui.note}>Esta es una vista previa de compra. La entrega y su costo estarán disponibles al habilitar pedidos.</Text>
    <PurchaseButton title="Continuar" onPress={next} />
  </CheckoutFrame>;
}
