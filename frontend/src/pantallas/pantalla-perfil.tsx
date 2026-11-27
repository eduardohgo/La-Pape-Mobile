import { router, type Href } from 'expo-router';
import { useState, type ComponentProps } from 'react';
import { Pressable, Text, View } from 'react-native';
import { ShopModal } from '@/components/catalogo/componentes-catalogo';
import { HomeIcon } from '@/components/compartidos/iconos-papeleria';
import { privacyPhaseEnabled } from '@/config/configuracion-api';
import { AccountGate } from '@/components/compra/marco-cuenta';
import { PurchaseButton, PurchaseFrame, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { useAuth } from '@/features/auth/proveedor-sesion';

import { AccountCancellation } from '@/components/auth/cancelacion-cuenta';

function ProfileContents() {
  const { state } = useAuth();
  const [personal, setPersonal] = useState(false);
  if (state.status !== 'authenticated') return null;
  const { user } = state.session;
  const entries: { label: string; icon: ComponentProps<typeof HomeIcon>['name']; href: Href }[] = [
    { label: 'Mis pedidos', icon: 'bag', href: '/pedidos' },
    { label: 'Mis direcciones', icon: 'pin', href: '/direcciones' },
    { label: 'Mis métodos de pago', icon: 'card', href: '/metodos-pago' },
    { label: 'Mis favoritos', icon: 'heart', href: '/favoritos' },
    { label: 'Configuración', icon: 'settings', href: '/configuracion' },
  ];
  return <>
    <View style={[ui.card, ui.row, { justifyContent: 'flex-start' }]}>
      <View style={{ width: 62, height: 62, borderRadius: 31, backgroundColor: '#BCEFFF', alignItems: 'center', justifyContent: 'center' }}><HomeIcon name="user" size={35} color="#176C99" /></View>
      <View style={{ flex: 1, gap: 6 }}><Text style={ui.heading}>{user.name}</Text><Text style={ui.text}>{user.email}</Text></View>
    </View>
    <View style={ui.card}>
      {entries.map(entry => <Pressable key={entry.label} accessibilityRole="button" onPress={() => router.push(entry.href)}
        style={[ui.row, { minHeight: 52, borderBottomWidth: 1, borderBottomColor: '#F0EDF4', paddingVertical: 8 }]}>
        <HomeIcon name={entry.icon} size={21} /><Text style={[ui.text, { flex: 1, color: '#252334' }]}>{entry.label}</Text><HomeIcon name="arrow" size={16} />
      </Pressable>)}
      <Pressable accessibilityRole="button" onPress={() => privacyPhaseEnabled() ? router.push('/privacidad') : setPersonal(true)} style={[ui.row, { minHeight: 52 }]}>
        <HomeIcon name="user" size={21} /><Text style={[ui.text, { flex: 1, color: '#252334' }]}>{privacyPhaseEnabled() ? 'Privacidad y datos personales' : 'Mis datos personales'}</Text><HomeIcon name="arrow" size={16} />
      </Pressable>
    </View>
    <AccountCancellation />
    <ShopModal visible={personal} onClose={() => setPersonal(false)}>
      <Text style={ui.heading}>Mis datos personales</Text><Text style={ui.text}>{user.name}</Text><Text style={ui.text}>{user.email}</Text>
      <Text style={ui.note}>Datos de tu sesión actual. La edición del perfil está pendiente.</Text>
      <PurchaseButton title="Cerrar" onPress={() => setPersonal(false)} />
    </ShopModal>
  </>;
}
export default function ProfileScreen() {
  return <PurchaseFrame title="Mi perfil" active="profile" back="/"><AccountGate><ProfileContents /></AccountGate></PurchaseFrame>;
}
