import { router } from 'expo-router';
import { Text, View } from 'react-native';
import { AccountGate } from '@/components/compra/marco-cuenta';
import { PurchaseButton, PurchaseFrame, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { useAuth } from '@/features/auth/proveedor-sesion';

export default function SettingsScreen() {
  const { state, logout } = useAuth();

  async function closeSession() {
    await logout();
    router.dismissTo('/');
  }
  return <PurchaseFrame title="Configuración" active="profile" back="/perfil"><AccountGate>
    <Text style={ui.heading}>Cuenta</Text>
    <View style={ui.card}><View style={ui.row}><Text style={ui.text}>Idioma</Text><Text style={ui.bold}>Español</Text></View>
      <View style={ui.row}><Text style={ui.text}>Apariencia</Text><Text style={ui.bold}>La Pape</Text></View>
      <View style={ui.row}><Text style={ui.text}>Notificaciones</Text><Text style={ui.text}>Pendiente</Text></View>
    </View>
    <Text style={ui.heading}>Seguridad</Text>
    <View style={ui.card}><View style={ui.row}><Text style={ui.text}>Cambiar contraseña</Text><Text style={ui.text}>Pendiente</Text></View>
      <Text style={ui.text}>Autenticación en dos pasos · Pendiente</Text></View>
    <Text style={ui.heading}>General</Text>
    <View style={ui.card}><Text style={ui.text}>Política de privacidad · Pendiente</Text><Text style={ui.text}>Términos y condiciones · Pendiente</Text></View>
    <PurchaseButton title={state.status === 'logging-out' ? 'Cerrando sesión…' : 'Cerrar sesión'}
      disabled={state.status !== 'authenticated'} onPress={() => void closeSession()} />
  </AccountGate></PurchaseFrame>;
}
