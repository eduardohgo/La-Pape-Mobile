import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { useColorScheme } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/arranque/splash-animado';

import { RegistrationProvider } from '@/features/auth/proveedor-registro';
import { SessionProvider } from '@/features/auth/proveedor-sesion';
import { CartProvider } from '@/features/compra-local/proveedor-carrito';
import { FavoritesProvider } from '@/features/compra-local/proveedor-favoritos';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
      <SessionProvider>
        <RegistrationProvider>
        <CartProvider>
          <FavoritesProvider>
            <AnimatedSplashOverlay />
            <Stack screenOptions={{ headerShown: false }}>
              <Stack.Screen name="(tabs)" />
              <Stack.Screen name="products/[id]" />
              <Stack.Screen name="login" />
              <Stack.Screen name="registro" />
              <Stack.Screen name="verificar-correo" />
            </Stack>
          </FavoritesProvider>
        </CartProvider>
        </RegistrationProvider>
      </SessionProvider>
    </ThemeProvider>
  );
}
