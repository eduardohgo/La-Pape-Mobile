import { fetch as expoFetch } from 'expo/fetch';
import * as SecureStore from 'expo-secure-store';
import { createContext, useContext, useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { AppState, Platform } from 'react-native';

import { getApiConfig } from '../../config/configuracion-api';
import { ApiError } from '../../services/http/errores-http';
import { createSessionController, sessionDeadline, type SessionController } from './controlador-sesion';
import { createAuthService } from './servicio-auth';

function createMobileController() {
  function config() { return getApiConfig(); }

  // A token issued by one API origin must never be restored against a different origin.
  function storageKey() {
    const origin = config().baseUrl;
    const suffix = Array.from(origin, (char) => char.charCodeAt(0).toString(16).padStart(2, '0')).join('');
    return 'lapape.auth.' + suffix;
  }

  function api() {
    if (Platform.OS === 'web') throw new ApiError('configuration');
    const preferJwt = typeof process !== 'undefined' && process.env.EXPO_PUBLIC_AUTH_TOKEN_FORMAT === 'jwt';
    return createAuthService(config(), expoFetch, preferJwt);
  }

  const storageOptions = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };

  return createSessionController({
    async login(credentials) { return api().login(credentials); },
    async me(token) { return api().me(token); },
    async refresh(token) { return api().refresh(token); },
    async deleteAccount(token, password) { return api().deleteAccount(token, password); },
    async readPrivacyData(token, signal) { return api().readPrivacyData(token, signal); },
    async readPrivacyPreferences(...args) { return api().readPrivacyPreferences(...args); },
    async listOppositions(...args) { return api().listOppositions(...args); },
    async readOpposition(...args) { return api().readOpposition(...args); },
    async createOpposition(...args) { return api().createOpposition(...args); },
    async recordPromotions(...args) { return api().recordPromotions(...args); },
    async updateProfileName(token, name) { return api().updateProfileName(token, name); },
    async logout(token) { return api().logout(token); },
  }, {
    async read() {
      if (Platform.OS === 'web') return null;
      let key: string;
      try { key = storageKey(); } catch { return null; }
      return SecureStore.getItemAsync(key, storageOptions);
    },
    save: (token) => SecureStore.setItemAsync(storageKey(), token, storageOptions),
    clear: () => SecureStore.deleteItemAsync(storageKey(), storageOptions),
  });
}

const SessionContext = createContext<SessionController | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [controller] = useState(createMobileController);
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);

  useEffect(() => {
    void controller.restore();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void controller.resume();
    });
    return () => subscription.remove();
  }, [controller]);

  useEffect(() => {
    if (state.status !== 'authenticated') return;
    const expires = sessionDeadline(state.session);
    const timer = setTimeout(() => { void controller.expire(); }, Math.max(0, expires - Date.now()));
    const renewTimer = controller.isJwtSession() ? setTimeout(() => { void controller.renew(); },
      Math.max(0, expires - Date.now() - 120000)) : undefined;
    return () => { clearTimeout(timer); if (renewTimer) clearTimeout(renewTimer); };
  }, [controller, state]);

  return <SessionContext.Provider value={controller}>{children}</SessionContext.Provider>;
}

export function useAuth() {
  const controller = useContext(SessionContext);
  if (!controller) throw new Error('Falta SessionProvider.');
  const state = useSyncExternalStore(controller.subscribe, controller.getSnapshot);
  return { state, readPrivacyData: controller.readPrivacyData, updateProfileName: controller.updateProfileName,
    readPrivacyPreferences: controller.readPrivacyPreferences, listOppositions: controller.listOppositions,
    readOpposition: controller.readOpposition, createOpposition: controller.createOpposition, recordPromotions: controller.recordPromotions,
    login: controller.login, logout: controller.logout, deleteAccount: controller.deleteAccount, restore: controller.restore, retryCleanup: controller.retryCleanup };
}
