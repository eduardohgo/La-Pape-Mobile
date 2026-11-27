import { fetch as expoFetch } from 'expo/fetch';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getApiConfig } from '@/config/configuracion-api';
import { createRecoveryController } from './controlador-recuperacion';
import { createRecoveryService } from './servicio-recuperacion';

type Controller = ReturnType<typeof createRecoveryController>;
const Context = createContext<Controller | null>(null);
export function RecoveryProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(() => createRecoveryController({
    request: (email, signal) => createRecoveryService(getApiConfig(), expoFetch).request(email, signal),
    confirm: (input, signal) => createRecoveryService(getApiConfig(), expoFetch).confirm(input, signal),
  }));
  useEffect(() => () => controller.cancel(), [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useRecovery() {
  const controller = useContext(Context);
  if (!controller) throw new Error('Falta RecoveryProvider.');
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { state, request: controller.request, confirm: controller.confirm, cancel: controller.cancel };
}
