import { fetch as expoFetch } from 'expo/fetch';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { getApiConfig } from '../../config/configuracion-api';
import { createRegistrationController, type RegistrationController } from './controlador-registro';
import { createRegistrationService } from './servicio-registro';
const Context = createContext<RegistrationController | null>(null);
function createController() {
  // Resolve lazily: guest-only Android must boot without an authentication URL.
  const api = () => createRegistrationService(getApiConfig(), expoFetch);
  return createRegistrationController({
    documents: (...args) => api().documents(...args),
    request: (...args) => api().request(...args),
    resend: (...args) => api().resend(...args),
    verify: (...args) => api().verify(...args),
  });
}
export function RegistrationProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(createController);
  useEffect(() => () => controller.reset(), [controller]);
  return <Context.Provider value={controller}>{children}</Context.Provider>;
}
export function useRegistration() {
  const controller = useContext(Context);
  if (!controller) throw new Error('Falta RegistrationProvider.');
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot, controller.getSnapshot);
  return { state, documents: controller.documents, register: controller.register, verify: controller.verify, resend: controller.resend, reset: controller.reset };
}
