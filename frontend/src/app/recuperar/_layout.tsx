import { Stack } from 'expo-router';
import { RecoveryProvider } from '@/features/auth/proveedor-recuperacion';
export default function RecoveryLayout() {
  return <RecoveryProvider><Stack screenOptions={{ headerShown: false }} /></RecoveryProvider>;
}
