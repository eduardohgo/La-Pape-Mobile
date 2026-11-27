import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { ActivityIndicator, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AuthUnavailableNotice } from '@/components/auth/acceso-no-disponible';
import { ShopHeader } from '@/components/catalogo/componentes-catalogo';
import { HomeIcon } from '@/components/compartidos/iconos-papeleria';
import { isAuthAvailable } from '@/config/configuracion-api';
import { useRecovery } from '@/features/auth/proveedor-recuperacion';
import { useAuth } from '@/features/auth/proveedor-sesion';

function Frame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <StatusBar style="dark" />
    <ScrollView contentContainerStyle={{ flexGrow: 1, paddingBottom: Math.max(insets.bottom, 22) }} keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag">
      <ShopHeader variant="login" left={<Pressable accessibilityRole="button" accessibilityLabel="Volver" onPress={() => router.canGoBack() ? router.back() : router.replace('/login')} style={styles.back}><HomeIcon name="back" /></Pressable>} />
      <View style={styles.card}>{!isAuthAvailable() ? <AuthUnavailableNotice /> : <>
        <Text accessibilityRole="header" style={styles.title}>{title}</Text><Text style={styles.description}>{description}</Text>{children}
      </>}</View>
      <View pointerEvents="none" style={styles.decoration}><View style={styles.yellow} /><View style={styles.pink} /></View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
function Field({ label, icon, error, ...props }: TextInputProps & { label: string; icon: 'mail' | 'lock'; error?: string }) {
  return <View><View style={[styles.field, error && { borderColor: '#A6274E' }]}><HomeIcon name={icon} size={21} color="#626878" /><TextInput {...props} accessibilityLabel={label} placeholder={label} placeholderTextColor="#626878" style={styles.input} /></View>
    {error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}</View>;
}
function SecretField({ label, value, onChangeText, error, editable }: { label: string; value: string; onChangeText: (value: string) => void; error?: string; editable: boolean }) {
  const [visible, setVisible] = useState(false);
  useFocusEffect(useCallback(() => () => setVisible(false), []));
  return <View><View style={[styles.field, error && { borderColor: '#A6274E' }]}><HomeIcon name="lock" size={21} color="#626878" />
    <TextInput accessibilityLabel={label} placeholder={label} placeholderTextColor="#626878" value={value} onChangeText={onChangeText} secureTextEntry={!visible} editable={editable}
      autoCorrect={false} autoCapitalize="none" autoComplete="new-password" textContentType="newPassword" style={styles.input} />
    <Pressable accessibilityRole="button" accessibilityLabel={`${visible ? 'Ocultar' : 'Mostrar'} ${label}`} onPress={() => setVisible(!visible)} style={styles.visibility}><HomeIcon name={visible ? 'eye' : 'eye-off'} size={20} color="#626878" /></Pressable>
  </View>{error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}</View>;
}
function Button({ title, onPress, busy = false, disabled = false }: { title: string; onPress: () => void; busy?: boolean; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ busy, disabled: disabled || busy }} disabled={disabled || busy} onPress={onPress} style={[styles.button, (busy || disabled) && { opacity: 0.55 }]}>
    {busy ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.buttonText}>{title}</Text>}
  </Pressable>;
}
export function RecoveryRequestScreen() {
  const { state, request, cancel } = useRecovery();
  const [email, setEmail] = useState(state.email);
  const active = useRef(false);
  useFocusEffect(useCallback(() => { active.current = true; return () => { active.current = false; cancel(); }; }, [cancel]));
  async function submit() { Keyboard.dismiss(); if (await request(email) && active.current) router.push('/recuperar/codigo'); }
  return <Frame title="Recupera tu acceso" description="Escribe tu correo electrónico para solicitar un código de recuperación.">
    <Field label="Correo electrónico" icon="mail" value={email} onChangeText={setEmail} error={state.errors.email} keyboardType="email-address" autoComplete="email" autoCorrect={false} autoCapitalize="none" maxLength={254} editable={!state.busy} returnKeyType="send" onSubmitEditing={() => void submit()} />
    {state.message && <Text accessibilityRole="alert" style={styles.error}>{state.message}</Text>}
    <Button title="Solicitar código" busy={state.busy} onPress={() => void submit()} />
    {state.stage === 'code' && <Button title="Ya tengo un código" onPress={() => router.push('/recuperar/codigo')} />}
    <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => router.dismissTo('/login')}><Text style={styles.link}>Volver a Iniciar sesión</Text></Pressable>
  </Frame>;
}
export function RecoveryCodeScreen() {
  const { state, request, confirm, cancel } = useRecovery();
  const { state: session, logout } = useAuth();
  const [code, setCode] = useState(''), [password, setPassword] = useState(''), [confirmation, setConfirmation] = useState('');
  const [now, setNow] = useState(Date.now);
  const active = useRef(false);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  useFocusEffect(useCallback(() => { active.current = true; return () => { active.current = false; cancel(); setCode(''); setPassword(''); setConfirmation(''); }; }, [cancel]));
  async function submit() {
    Keyboard.dismiss();
    const ok = await confirm(code, password, confirmation);
    if (!active.current) return;
    setCode(''); setPassword(''); setConfirmation('');
    if (ok) {
      if (session.status === 'authenticated' && session.session.user.email.trim().toLowerCase() === state.email) await logout();
      if (active.current) router.replace('/recuperar/resultado');
    }
  }
  if (state.stage === 'done') return <Frame title="Contraseña actualizada" description="El servidor confirmó el cambio de contraseña."><Button title="Ver resultado" onPress={() => router.replace('/recuperar/resultado')} /></Frame>;
  if (state.stage !== 'code') return <Frame title="Solicita un código" description="Primero introduce tu correo electrónico."><Button title="Solicitar código" onPress={() => router.replace('/recuperar/solicitud')} /></Frame>;
  const remaining = Math.max(0, Math.ceil((state.resendAt - now) / 1000));
  return <Frame title="Nueva contraseña" description="Si tu cuenta permite recuperación, se intentará enviar un código. La solicitud no confirma la entrega del correo.">
    <Text style={styles.note}>Código de seis dígitos · vigencia de 15 minutos. Revisa también correo no deseado.</Text>
    <Field label="Código de recuperación" icon="lock" value={code} onChangeText={setCode} keyboardType="number-pad" autoComplete="one-time-code" textContentType="oneTimeCode" maxLength={6} editable={!state.busy} error={state.errors.code} />
    <SecretField label="Nueva contraseña" value={password} onChangeText={setPassword} error={state.errors.password} editable={!state.busy} />
    <Text style={styles.hint}>Mínimo {state.policy.passwordMinCodePoints} caracteres, hasta 1024 bytes UTF-8. No necesitas combinar mayúsculas, números o símbolos.</Text>
    <SecretField label="Confirmar contraseña" value={confirmation} onChangeText={setConfirmation} error={state.errors.confirmation} editable={!state.busy} />
    {state.message && <Text accessibilityRole="alert" style={styles.error}>{state.message}</Text>}
    <Button title="Cambiar contraseña" busy={state.busy} onPress={() => void submit()} />
    <Button title={remaining ? `Reenviar código (${remaining} s)` : 'Solicitar otro código'} disabled={remaining > 0 || state.busy} onPress={() => { setCode(''); void request(); }} />
    <Pressable accessibilityRole="button" style={styles.linkButton} onPress={() => router.dismissTo('/login')}><Text style={styles.link}>Volver a Iniciar sesión</Text></Pressable>
  </Frame>;
}
export function RecoveryResultScreen() {
  const { state } = useRecovery();
  const done = state.stage === 'done';
  return <Frame title={done ? 'Contraseña actualizada' : 'Recuperación pendiente'} description={done ? 'El servidor confirmó el cambio. Tus sesiones anteriores fueron revocadas. Inicia sesión con tu nueva contraseña.' : 'No se ha confirmado un cambio de contraseña.'}>
    {done && <View style={styles.success}><HomeIcon name="lock" size={40} color="#2379B6" /></View>}
    <Button title="Volver a Iniciar sesión" onPress={() => router.dismissTo('/login')} />
  </Frame>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' }, back: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  card: { width: '94%', maxWidth: 500, alignSelf: 'center', borderRadius: 28, backgroundColor: '#FFFFFF', marginTop: -8, padding: 22, gap: 18 },
  title: { fontSize: 30, fontWeight: '900', color: '#15142D', textAlign: 'center', letterSpacing: -0.8 },
  description: { color: '#626878', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  field: { flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingLeft: 14, gap: 10, borderWidth: 1, borderColor: '#DDDEE6', backgroundColor: '#FAFAFC', borderRadius: 17 },
  input: { flex: 1, minWidth: 0, minHeight: 52, paddingVertical: 12, paddingRight: 12, fontSize: 15, color: '#15142D' },
  visibility: { minWidth: 44, minHeight: 48, alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 52, backgroundColor: '#E32670', padding: 14, borderRadius: 25, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '800', textAlign: 'center' },
  linkButton: { minHeight: 44, justifyContent: 'center', alignItems: 'center' }, link: { color: '#2379B6', fontWeight: '700', fontSize: 14 },
  note: { color: '#665528', backgroundColor: '#FFF5D4', padding: 13, borderRadius: 14, fontSize: 13, lineHeight: 20 },
  hint: { color: '#626878', fontSize: 12, lineHeight: 18 }, error: { color: '#A6274E', fontSize: 13, lineHeight: 20 },
  success: { alignSelf: 'center', padding: 24, borderRadius: 50, backgroundColor: '#DDF5FF' },
  decoration: { marginTop: 'auto', height: 55, overflow: 'hidden' }, yellow: { width: 140, height: 100, borderRadius: 50, backgroundColor: '#FFDF57', position: 'absolute', left: -20, top: 10 },
  pink: { width: 100, height: 120, borderRadius: 42, backgroundColor: '#F88BBB', position: 'absolute', right: -15, top: 8 },
});
