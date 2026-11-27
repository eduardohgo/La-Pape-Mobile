import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import { createLocalStorage, type KeyValueStorage } from './almacenamiento';

const options = { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY };
const native: KeyValueStorage = {
  get: key => SecureStore.getItemAsync(key, options),
  set: (key, value) => SecureStore.setItemAsync(key, value, options),
  remove: key => SecureStore.deleteItemAsync(key, options),
};
const web: KeyValueStorage = {
  get: async key => globalThis.localStorage.getItem(key),
  set: async (key, value) => { globalThis.localStorage.setItem(key, value); },
  remove: async key => { globalThis.localStorage.removeItem(key); },
};
export const deviceStorage = (namespace: string) => createLocalStorage(Platform.OS === 'web' ? web : native, namespace);
