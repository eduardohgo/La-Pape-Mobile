import { Image } from 'expo-image';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState, type ComponentRef } from 'react';
import {
  ActivityIndicator, Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView,
  StyleSheet, Text, TextInput, View, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AuthUnavailableNotice } from '@/components/auth/acceso-no-disponible';
import { palette, ShopHeader, ShopStatus } from '@/components/catalogo/componentes-catalogo';
import { HomeIcon } from '@/components/compartidos/iconos-papeleria';
import { StationeryArt, type StationeryKind } from '@/components/compartidos/ilustraciones-papeleria';
import { isAuthAvailable } from '@/config/configuracion-api';
import { useAuth } from '@/features/auth/proveedor-sesion';
import { validateLogin, type LoginErrors } from '@/features/auth/validacion-login';

const googleMark = require('@/assets/images/login/google-g.png');
const ink = '#15142D';
const iconColor = '#626878';
const formWidth = 500;

const schoolSupplies: { kind: StationeryKind; scale: number; lift: number; angle: string }[] = [
  { kind: 'notebook', scale: 1.82, lift: 0, angle: '-5deg' },
  { kind: 'markers', scale: 1.60, lift: 4, angle: '3deg' },
  { kind: 'scissors', scale: 1.74, lift: 8, angle: '-8deg' },
  { kind: 'pencils', scale: 1.70, lift: 0, angle: '4deg' },
  { kind: 'glue', scale: 1.43, lift: -9, angle: '8deg' },
];

function LoginStationery() {
  const { width } = useWindowDimensions();
  const unit = Math.min(formWidth, width * 0.94) / schoolSupplies.length;
  return (
    <View style={[styles.stationery, { height: Math.min(158, unit * 1.94) }]}
      pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={styles.yellowWave} />
      <View style={styles.yellowWaveRight} />
      <View style={styles.pinkWave} />
      {schoolSupplies.map(({ kind, scale, lift, angle }, index) => {
        const size = unit * scale;
        return (
          <View key={kind} style={{
            position: 'absolute', left: (index + 0.5) * unit - size / 2, bottom: lift - 10,
            transform: [{ rotate: angle }],
          }}>
            <StationeryArt kind={kind} width={size} height={size} />
          </View>
        );
      })}
    </View>
  );
}

export default function LoginScreen() {
  const { state, login, logout, restore, retryCleanup } = useAuth();
  const authAvailable = isAuthAvailable();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false);
  const [remember, setRemember] = useState(true);
  const [errors, setErrors] = useState<LoginErrors>({});
  const [loginInProgress, setLoginInProgress] = useState(false);
  const activeSubmission = useRef<symbol | null>(null);
  const passwordInput = useRef<ComponentRef<typeof TextInput>>(null);
  const submitting = loginInProgress || state.status === 'logging-in';
  const busy = state.status === 'restoring' || state.status === 'logging-out';

  useFocusEffect(useCallback(() => () => {
    activeSubmission.current = null;
    setLoginInProgress(false);
    setPassword('');
    setVisible(false);
  }, []));

  async function submit() {
    if (!authAvailable || state.status !== 'guest' || activeSubmission.current) return;
    const result = validateLogin(email, password);
    setErrors(result.errors ?? {});
    if (!result.credentials) return;
    const submission = Symbol();
    activeSubmission.current = submission;
    setLoginInProgress(true);
    Keyboard.dismiss();
    setPassword('');
    setVisible(false);
    const authenticated = await login(result.credentials, remember);
    // A response must not redirect after the user has left this screen.
    if (activeSubmission.current !== submission) return;
    if (authenticated) {
      router.dismissTo('/');
      return;
    }
    activeSubmission.current = null;
    setLoginInProgress(false);
  }

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom }]}
        keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" showsVerticalScrollIndicator={false}>
        <View style={[styles.headerBackdrop, { height: insets.top + 340 }]} pointerEvents="none" />
        <ShopHeader variant="login" left={
          <Pressable style={styles.back} accessibilityRole="button" accessibilityLabel="Volver"
            onPress={() => { if (router.canGoBack()) router.back(); else router.replace('/'); }}>
            <HomeIcon name="back" size={20} />
          </Pressable>
        } />
        <View style={styles.card}>
          {!authAvailable ? (
            <><AuthUnavailableNotice /><LoginStationery /></>
          ) : Platform.OS === 'web' ? (
            <ShopStatus title="Inicia sesión desde La Pape Mobile" />
          ) : busy ? (
            <ShopStatus title={state.status === 'restoring' ? 'Comprobando tu sesión…' : 'Cerrando sesión…'} loading />
          ) : state.status === 'restore-error' || state.status === 'cleanup-error' ? (
            <View style={styles.form}>
              <ShopStatus title="Mi cuenta" message={state.message}
                onRetry={state.status === 'restore-error' ? restore : retryCleanup} />
              {state.status === 'restore-error' && (
                <Pressable style={styles.touchLink} onPress={logout} accessibilityRole="button">
                  <Text style={styles.link}>Cerrar sesión en este dispositivo</Text>
                </Pressable>
              )}
            </View>
          ) : state.status === 'authenticated' && !loginInProgress ? (
            <View style={styles.account}>
              <Text style={styles.title} accessibilityRole="header">Mi cuenta</Text>
              <Text style={styles.name}>{state.session.user.name}</Text>
              <Text style={[styles.description, styles.accountEmail]}>{state.session.user.email}</Text>
              <Pressable style={({ pressed }) => [styles.primary, pressed && styles.dim]}
                onPress={logout} accessibilityRole="button">
                <Text style={styles.primaryText}>Cerrar sesión</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.form}>
                <View style={styles.intro}>
                  <Text style={styles.title} accessibilityRole="header">Bienvenido de nuevo</Text>
                  <Text style={styles.description}>
                    Inicia sesión para seguir explorando todo para tu creatividad y estudios.
                  </Text>
                </View>

                <View style={styles.field}>
                  <View style={[styles.inputRow, errors.email && styles.invalid]}>
                    <HomeIcon name="mail" size={20} color={iconColor} />
                    <TextInput style={styles.input} accessibilityLabel="Correo electrónico"
                      placeholder="Correo electrónico" placeholderTextColor={iconColor}
                      value={email} autoComplete="email" autoCapitalize="none" autoCorrect={false}
                      keyboardType="email-address" editable={!submitting} returnKeyType="next"
                      onSubmitEditing={() => passwordInput.current?.focus()}
                      onChangeText={(value) => { setEmail(value); setErrors((previous) => ({ ...previous, email: undefined })); }} />
                  </View>
                  {errors.email && <Text accessibilityRole="alert" style={styles.error}>{errors.email}</Text>}
                </View>

                <View style={styles.field}>
                  <View style={[styles.inputRow, styles.passwordRow, errors.password && styles.invalid]}>
                    <HomeIcon name="lock" size={20} color={iconColor} />
                    <TextInput ref={passwordInput} style={styles.input} accessibilityLabel="Contraseña"
                      placeholder="Contraseña" placeholderTextColor={iconColor} value={password}
                      secureTextEntry={!visible} autoComplete="current-password" autoCapitalize="none" autoCorrect={false}
                      editable={!submitting} returnKeyType="go" onSubmitEditing={submit}
                      onChangeText={(value) => { setPassword(value); setErrors((previous) => ({ ...previous, password: undefined })); }} />
                    <Pressable style={styles.visibility} accessibilityRole="button"
                      accessibilityLabel={visible ? 'Ocultar contraseña' : 'Mostrar contraseña'} disabled={submitting}
                      onPress={() => setVisible((previous) => !previous)}>
                      <HomeIcon name={visible ? 'eye-off' : 'eye'} size={20} color={iconColor} />
                    </Pressable>
                  </View>
                  {errors.password && <Text accessibilityRole="alert" style={styles.error}>{errors.password}</Text>}
                </View>

                <View style={styles.options}>
                  <Pressable style={styles.remember} accessibilityRole="checkbox" accessibilityLabel="Recordarme"
                    accessibilityHint="Guarda la sesión para la próxima vez que abras la app"
                    accessibilityState={{ checked: remember, disabled: submitting }} disabled={submitting}
                    onPress={() => setRemember((previous) => !previous)}>
                    <View style={[styles.checkBox, remember && styles.checked]}>
                      {remember && <HomeIcon name="check" size={15} color={ink} />}
                    </View>
                    <Text style={styles.optionLabel}>Recordarme</Text>
                  </Pressable>
                  <Pressable style={styles.touchLink} accessibilityRole="button" accessibilityHint="Próximamente"
                    disabled={submitting}
                    onPress={() => router.push('/recuperar/solicitud')}>
                    <Text style={styles.link}>¿Olvidaste tu contraseña?</Text>
                  </Pressable>
                </View>

                {state.status === 'guest' && state.message && (
                  <Text accessibilityRole="alert" accessibilityLiveRegion="polite" style={styles.error}>{state.message}</Text>
                )}
                <Pressable style={({ pressed }) => [styles.primary, (submitting || pressed) && styles.dim]}
                  disabled={submitting} accessibilityRole="button"
                  accessibilityState={{ disabled: submitting, busy: submitting }} onPress={submit}>
                  <Text style={styles.primaryText}>{submitting ? 'Iniciando sesión…' : 'Iniciar sesión'}</Text>
                  {submitting ? <ActivityIndicator color={ink} /> : <HomeIcon name="arrow" size={20} color={ink} />}
                </Pressable>

                <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                  <View style={styles.rule} />
                  <Text style={styles.dividerLabel}>o</Text>
                  <View style={styles.rule} />
                </View>
                <Pressable style={({ pressed }) => [styles.google, pressed && styles.dim]}
                  accessibilityRole="button" accessibilityHint="Próximamente" disabled={submitting}
                  onPress={() => Alert.alert('Continuar con Google', 'El inicio de sesión con Google estará disponible próximamente.')}>
                  <Image source={googleMark} style={styles.googleMark} contentFit="contain" accessible={false} />
                  <Text style={styles.googleLabel}>Continuar con Google</Text>
                </Pressable>
                <View style={styles.registration}>
                  <Text style={styles.registrationLabel}>¿No tienes cuenta?</Text>
                  <Pressable style={styles.touchLink} accessibilityRole="button"
                    disabled={submitting}
                    onPress={() => router.navigate('/registro')}>
                    <Text style={styles.link}>Regístrate</Text>
                  </Pressable>
                </View>
              </View>
              <LoginStationery />
            </>
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flexGrow: 1 },
  headerBackdrop: { position: 'absolute', top: 0, left: 0, right: 0, backgroundColor: palette.yellow },
  back: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF3AD' },
  card: { width: '94%', maxWidth: formWidth, alignSelf: 'center', marginTop: -12, borderRadius: 24,
    overflow: 'hidden', backgroundColor: '#FFFFFF' },
  form: { paddingHorizontal: 19, paddingTop: 25 },
  intro: { marginBottom: 18, gap: 5, alignItems: 'center' },
  title: { color: ink, fontSize: 29, fontWeight: '900', letterSpacing: -0.9, textAlign: 'center' },
  description: { color: '#505568', fontSize: 15, lineHeight: 20, textAlign: 'center', maxWidth: 320 },
  field: { marginBottom: 11, gap: 5 },
  inputRow: { minHeight: 50, flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 13,
    backgroundColor: '#F5F6F8', borderWidth: 1, borderColor: '#E8E9EE', borderRadius: 13 },
  passwordRow: { paddingRight: 1, gap: 8 },
  input: { flex: 1, minWidth: 0, minHeight: 48, fontSize: 15, color: ink, paddingVertical: 8 },
  visibility: { minWidth: 44, minHeight: 44, justifyContent: 'center', alignItems: 'center' },
  invalid: { borderColor: '#A6274E' },
  error: { color: '#A6274E', fontSize: 14, lineHeight: 20, marginBottom: 5 },
  options: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', columnGap: 12, marginTop: -9, marginBottom: 6 },
  remember: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 7, flexShrink: 0 },
  checkBox: { width: 20, height: 20, borderWidth: 1, borderColor: '#737684', borderRadius: 5, alignItems: 'center', justifyContent: 'center' },
  checked: { backgroundColor: '#FFD32E', borderColor: '#FFD32E' },
  optionLabel: { fontSize: 13, color: ink, fontWeight: '600' },
  touchLink: { minHeight: 44, justifyContent: 'center', flexShrink: 1 },
  link: { color: '#1458A0', fontSize: 13, fontWeight: '800' },
  primary: { flexDirection: 'row', gap: 9, backgroundColor: '#FFD32E', minHeight: 48, borderRadius: 26,
    paddingHorizontal: 14, paddingVertical: 10, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: ink, fontSize: 16, fontWeight: '900', flexShrink: 1, textAlign: 'center' },
  dim: { opacity: 0.78 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  rule: { flex: 1, height: 1, backgroundColor: '#D6D8DD' },
  dividerLabel: { color: '#505568', fontSize: 13, fontWeight: '600' },
  google: { minHeight: 47, borderRadius: 26, borderWidth: 1, borderColor: '#B6BAC5', backgroundColor: '#FFFFFF',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 8 },
  googleMark: { width: 22, height: 22 },
  googleLabel: { color: ink, fontSize: 15, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  registration: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 3 },
  registrationLabel: { color: '#505568', fontSize: 13 },
  account: { alignItems: 'stretch', padding: 24, gap: 14 },
  accountEmail: { alignSelf: 'center' },
  name: { color: ink, fontWeight: '700', fontSize: 18, textAlign: 'center' },
  stationery: { width: '100%', overflow: 'hidden' },
  yellowWave: { position: 'absolute', left: '-12%', right: '-10%', top: 22, bottom: -60,
    borderTopLeftRadius: 72, borderTopRightRadius: 102, backgroundColor: '#FFE277', transform: [{ rotate: '3deg' }] },
  yellowWaveRight: { position: 'absolute', width: '56%', height: 170, top: 10, right: -29,
    borderRadius: 70, backgroundColor: '#FFF0A2', transform: [{ rotate: '-9deg' }] },
  pinkWave: { position: 'absolute', width: 63, height: 125, top: -5, left: -40,
    borderRadius: 32, backgroundColor: '#FA83B2', transform: [{ rotate: '-19deg' }] },
});
