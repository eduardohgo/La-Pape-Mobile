import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Keyboard, Pressable, Text, TextInput, View } from 'react-native';
import { ShopModal } from '@/components/catalogo/componentes-catalogo';
import { PurchaseButton, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { useAuth } from '@/features/auth/proveedor-sesion';
import { ApiError } from '@/services/http/errores-http';

export function AccountCancellation() {
  const { state, deleteAccount } = useAuth();
  const [deletionOpen, setDeletionOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deletionError, setDeletionError] = useState('');
  const submitting = useRef(false);

  function closeDeletion() {
    if (submitting.current) return;
    setDeletionOpen(false);
    setPassword('');
    setConfirmed(false);
    setDeletionError('');
  }

  async function submitDeletion() {
    if (submitting.current || !confirmed || !password.trim()) return;
    submitting.current = true;
    setBusy(true);
    setDeletionError('');
    Keyboard.dismiss();
    const currentPassword = password;
    setPassword('');
    try {
      const result = await deleteAccount(currentPassword);
      if (result === 'deleted') {
        Alert.alert('Cuenta eliminada', 'Tu sesión se cerró y tus datos de cuenta se eliminaron del servicio de autenticación.',
          [{ text: 'Volver al inicio', onPress: () => router.dismissTo('/') }]);
      } else if (result === 'cleanup-error') {
        Alert.alert('Cuenta eliminada', 'No se pudo borrar la sesión guardada en este dispositivo. Selecciona Reintentar en Mi cuenta.');
      } else if (result === 'expired') {
        Alert.alert('Sesión vencida', 'Vuelve a iniciar sesión para solicitar la eliminación.');
      } else {
        setDeletionError('Espera a que termine la operación de sesión y vuelve a intentarlo.');
      }
    } catch (error) {
      const status = error instanceof ApiError ? error.status : undefined;
      if (status === 422) setDeletionError('No se pudo verificar tu contraseña actual.');
      else if (status === 429) setDeletionError('Demasiados intentos. Espera 15 minutos.');
      else if (status === 404) setDeletionError('La eliminación aún no está disponible en este servidor.');
      else setDeletionError('No se pudo confirmar el resultado. Revisa tu sesión antes de reintentar.');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  if (state.status !== 'authenticated' || state.session.user.role !== 'CLIENTE') return null;
  return <>
    <View style={ui.card}>
      <Pressable accessibilityRole="button" onPress={() => setDeletionOpen(true)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={ui.error}>Eliminar mi cuenta</Text>
      </Pressable>
    </View>
    <ShopModal visible={deletionOpen} onClose={closeDeletion}>
      <Text accessibilityRole="header" style={ui.heading}>Eliminar mi cuenta</Text>
      <Text style={ui.text}>Eliminarás tu perfil, credenciales y solicitudes de privacidad del servicio de autenticación. Se cerrarán todas tus sesiones. Esta acción es irreversible.</Text>
      <Text style={ui.text}>Se conservan los eventos de seguridad sin referencias a tu cuenta. Los respaldos y datos guardados en este dispositivo siguen su propio ciclo de conservación.</Text>
      <TextInput style={ui.field} accessibilityLabel="Contraseña actual" placeholder="Contraseña actual"
        secureTextEntry autoCapitalize="none" autoCorrect={false} editable={!busy} value={password}
        onChangeText={setPassword} />
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: confirmed, disabled: busy }}
        disabled={busy} onPress={() => setConfirmed(value => !value)} style={{ minHeight: 44, justifyContent: 'center' }}>
        <Text style={ui.bold}>{confirmed ? '✓ ' : '☐ '}Confirmo que quiero eliminar mi cuenta</Text>
      </Pressable>
      {!!deletionError && <Text accessibilityRole="alert" style={ui.error}>{deletionError}</Text>}
      <PurchaseButton title={busy ? 'Eliminando…' : 'Eliminar definitivamente'}
        disabled={busy || !confirmed || !password.trim()} onPress={() => void submitDeletion()} />
    </ShopModal>
  </>;
}
