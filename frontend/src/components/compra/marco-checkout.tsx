import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { AuthUnavailableNotice } from '@/components/auth/acceso-no-disponible';
import { isAuthAvailable } from '@/config/configuracion-api';
import { useAuth } from '@/features/auth/proveedor-sesion';
import { useCart } from '@/features/compra-local/proveedor-carrito';
import { ShopStatus } from '../catalogo/componentes-catalogo';
import { PurchaseButton, PurchaseFrame, purchaseStyles as ui } from './marco-compra';

export function CheckoutFrame({ step, children }: { step: 1 | 2 | 3; children: ReactNode }) {
  const { state } = useAuth();
  const cart = useCart();
  return <PurchaseFrame title="" back="/carrito">
    <Text accessibilityRole="header" style={[ui.title, styles.center]}>Finalizar compra</Text>
    <View style={styles.steps} accessibilityLabel={`Paso ${step} de 3`}>
      {['Dirección', 'Pago', 'Confirmación'].map((label, index) => <View key={label} style={styles.step}>
        <View style={[styles.circle, index + 1 === step && styles.active]}><Text style={index + 1 === step ? styles.white : styles.muted}>{index + 1}</Text></View>
        <Text style={[styles.label, index + 1 === step && styles.pink]}>{label}</Text>
      </View>)}
      <View style={styles.line} />
    </View>
    {!isAuthAvailable() ? <AuthUnavailableNotice />
      : state.status === 'restoring' || cart.status === 'loading' ? <ShopStatus title="Recuperando tus datos…" loading />
      : state.status !== 'authenticated' ? <><ShopStatus title="Inicia sesión para continuar" message="Accede a tu cuenta para preparar la dirección de entrega." />
        <PurchaseButton title="Iniciar sesión" onPress={() => router.push('/login')} /></>
      : cart.status !== 'ready' || !cart.value.length ? <><ShopStatus title="Revisa tu carrito" message="Agrega artículos antes de continuar." />
        <PurchaseButton title="Volver al carrito" onPress={() => router.navigate('/carrito')} /></>
      : children}
  </PurchaseFrame>;
}
const styles = StyleSheet.create({
  center: { textAlign: 'center' },
  steps: { flexDirection: 'row', marginVertical: 5, paddingBottom: 6 },
  step: { flex: 1, alignItems: 'center', gap: 8, zIndex: 1 },
  circle: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#ACA8B8', alignItems: 'center', justifyContent: 'center' },
  active: { backgroundColor: '#F92D81', borderColor: '#F92D81' },
  white: { color: '#FFFFFF', fontWeight: '700' }, muted: { color: '#858195' },
  label: { fontSize: 12, color: '#726D7D' }, pink: { color: '#E52975', fontWeight: '700' },
  line: { position: 'absolute', top: 13, height: 1, backgroundColor: '#CBC8D5', left: '17%', right: '17%' },
});
