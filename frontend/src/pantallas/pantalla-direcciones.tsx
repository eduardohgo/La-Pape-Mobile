import { useState } from 'react';
import { Alert, Pressable, Text, View } from 'react-native';
import { ShopStatus } from '@/components/catalogo/componentes-catalogo';
import { AccountGate } from '@/components/compra/marco-cuenta';
import { AddressForm } from '@/components/compra/formulario-direccion';
import { Choice, PurchaseButton, PurchaseFrame, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { useAuth } from '@/features/auth/proveedor-sesion';
import { emptyAddress, validateAddress, type AddressInput, type AddressField } from '@/features/compra-local/checkout';
import { useAddresses } from '@/features/compra-local/use-direcciones';

function AddressContents() {
  const addresses = useAddresses();
  const { state } = useAuth();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<AddressInput>(emptyAddress);
  const [errors, setErrors] = useState<Partial<Record<AddressField, string>>>({});
  async function save() {
    const errors = validateAddress(draft);
    setErrors(errors);
    if (Object.keys(errors).length) return;
    const id = editing === 'new' ? 'address_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2) : editing;
    if (!id) return;
    const ok = await addresses.update(value => editing === 'new' ? [...value, { ...draft, id }] : value.map(item => item.id === id ? { ...draft, id } : item));
    if (ok) setEditing(null);
  }
  if (addresses.status === 'loading') return <ShopStatus title="Recuperando direcciones…" loading />;
  if (addresses.status === 'error') return <><ShopStatus title="No pudimos recuperar tus direcciones locales" onRetry={addresses.retry} />
    <PurchaseButton title="Restablecer direcciones locales" onPress={() => Alert.alert('Borrar direcciones locales', 'Se eliminarán las direcciones de esta cuenta en este dispositivo.', [
      { text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: () => void addresses.clear() },
    ])} /></>;
  return <>
    <Text style={ui.note}>Direcciones de esta cuenta guardadas solo en este dispositivo.</Text>
    {editing ? <View style={ui.card}><Text style={ui.heading}>{editing === 'new' ? 'Agregar dirección' : 'Editar dirección'}</Text>
      <AddressForm value={draft} onChange={setDraft} errors={errors} showLabel />
      <PurchaseButton title={addresses.saving ? 'Guardando…' : 'Guardar dirección'} disabled={addresses.saving} onPress={() => void save()} />
      <PurchaseButton title="Cancelar" disabled={addresses.saving} onPress={() => setEditing(null)} />
    </View> : <>
      {!addresses.value.length && <ShopStatus title="Todavía no tienes direcciones" message="Agrega una dirección para seleccionarla en la vista previa de checkout." />}
      {addresses.value.map((address, index) => <View key={address.id} style={ui.card}>
        <Choice title={address.label} detail={`${address.recipient}\n${address.street} ${address.number}\n${address.neighborhood}, ${address.city}\n${address.region}, C.P. ${address.postalCode}`}
          selected={index === 0} onPress={() => { void addresses.update(value => [address, ...value.filter(item => item.id !== address.id)]); }} />
        <View style={ui.row}><Pressable accessibilityRole="button" disabled={addresses.saving} style={{ minHeight: 44, justifyContent: 'center' }}
          onPress={() => { setDraft(address); setErrors({}); setEditing(address.id); }}><Text style={{ color: '#176EAE', fontWeight: '700' }}>Editar</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={addresses.saving} style={{ minHeight: 44, justifyContent: 'center' }}
            onPress={() => Alert.alert('Eliminar dirección', 'Se quitará esta dirección del dispositivo.', [
              { text: 'Cancelar', style: 'cancel' }, { text: 'Eliminar', style: 'destructive', onPress: () => { void addresses.update(value => value.filter(item => item.id !== address.id)); } },
            ])}><Text style={{ color: '#C32361', fontWeight: '700' }}>Eliminar</Text></Pressable></View>
      </View>)}
      <PurchaseButton title="Agregar dirección" disabled={addresses.saving} onPress={() => {
        setDraft({ ...emptyAddress, recipient: state.status === 'authenticated' ? state.session.user.name : '' }); setErrors({}); setEditing('new');
      }} />
    </>}
    {addresses.error && <Text accessibilityRole="alert" style={ui.error}>{addresses.error}</Text>}
  </>;
}
export default function AddressesScreen() {
  return <PurchaseFrame title="Mis direcciones" active="profile" back="/perfil"><AccountGate><AddressContents /></AccountGate></PurchaseFrame>;
}
