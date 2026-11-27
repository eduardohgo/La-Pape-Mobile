import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { AuthUnavailableNotice } from '@/components/auth/acceso-no-disponible';
import { isAuthAvailable } from '@/config/configuracion-api';
import { useAuth } from '@/features/auth/proveedor-sesion';
import { ShopStatus } from '../catalogo/componentes-catalogo';
import { PurchaseButton } from './marco-compra';

export function AccountGate({ children }: { children: ReactNode }) {
  const { state, restore, retryCleanup } = useAuth();
  if (!isAuthAvailable()) return <AuthUnavailableNotice />;
  if (state.status === 'authenticated') return children;
  if (state.status === 'restoring' || state.status === 'logging-in' || state.status === 'logging-out') return <ShopStatus title="Comprobando sesión…" loading />;
  if (state.status === 'restore-error' || state.status === 'cleanup-error') return <ShopStatus title="Revisa tu sesión" message={state.message}
    onRetry={state.status === 'restore-error' ? restore : retryCleanup} />;
  return <><ShopStatus title="Inicia sesión" message="Accede a tu cuenta para continuar." />
    <PurchaseButton title="Iniciar sesión" onPress={() => router.push('/login')} /></>;
}
