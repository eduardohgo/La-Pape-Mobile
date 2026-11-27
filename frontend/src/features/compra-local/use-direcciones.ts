import { useCallback, useMemo, useSyncExternalStore } from 'react';
import { useFocusEffect } from 'expo-router';
import { useAuth } from '../auth/proveedor-sesion';
import { createLocalController } from './controlador-local';
import { deviceStorage } from './persistencia-nativa';
import { isUuid } from './carrito';
import { parseAddresses, type LocalAddress } from './checkout';

export function useAddresses() {
  const { state } = useAuth();
  const owner = state.status === 'authenticated' ? state.session.user.id : null;
  const controller = useMemo(() => {
    const storage = owner && isUuid(owner) ? deviceStorage('lapape.local.addresses.v1.' + owner) : {
      read: async () => null,
      write: async () => { throw new Error('Inicia sesión para guardar direcciones.'); },
    };
    return createLocalController<readonly LocalAddress[]>(storage, [], parseAddresses);
  }, [owner]);
  useFocusEffect(useCallback(() => { if (owner) void controller.restore(); }, [controller, owner]));
  const value = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { ...value, update: controller.update, retry: controller.restore, clear: controller.reset };
}
