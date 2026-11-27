import { Stack } from 'expo-router';
import { CheckoutProvider } from '@/features/compra-local/proveedor-checkout';
export default function CheckoutLayout() {
  return <CheckoutProvider><Stack screenOptions={{ headerShown: false }} /></CheckoutProvider>;
}
