import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ShopHeader } from '@/components/catalogo/componentes-catalogo';
import { HomeIcon } from '@/components/compartidos/iconos-papeleria';
import { useRegistration } from '@/features/auth/proveedor-registro';
import { RegistrationField } from './pantalla-registro';
export default function VerifyEmailScreen() {
  const { state, verify, resend, reset } = useRegistration();
  const insets = useSafeAreaInsets();
  const [code, setCode] = useState('');
  const [now, setNow] = useState(Date.now);
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(timer); }, []);
  const wait = Math.max(0, Math.ceil(((state.resendAt ?? 0) - now) / 1000));
  function back() { reset(); router.dismissTo('/registro'); }
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }}>
      <ShopHeader variant="login" />
      <View style={[styles.card, { paddingBottom: Math.max(insets.bottom, 24) }]}>
        <View style={styles.symbol}><HomeIcon name={state.stage === 'done' ? 'check' : 'mail'} size={32} color="#2379B6" /></View>
        <Text style={styles.title} accessibilityRole="header">{state.stage === 'done' ? '¡Cuenta verificada!' : 'Verifica tu correo'}</Text>
        {state.stage === 'form' ? <>
          <Text style={styles.message}>Inicia una solicitud de registro para recibir un código. Por seguridad, la solicitud no se conserva al cerrar la aplicación.</Text>
          <Pressable style={styles.primary} onPress={back} accessibilityRole="button"><Text style={styles.primaryText}>Volver a Registro</Text></Pressable>
        </> : <>
          <Text style={styles.message}>{state.message}</Text>
          {state.stage === 'code' && <>
            <Text style={styles.email}>{state.email}</Text>
            <RegistrationField label="Código de seis dígitos" icon="lock" value={code}
              onChangeText={value => setCode(value.replace(/\D/g, '').slice(0, 6))}
              keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} editable={!state.busy} />
            <Text style={styles.caption}>{now >= (state.expiresAt ?? Infinity) ? 'El código ha caducado. Solicita uno nuevo.' : 'El código caduca en 15 minutos y solo puede usarse una vez.'}</Text>
            {state.error && <Text accessibilityRole="alert" style={styles.error}>{state.error}</Text>}
            <Pressable style={[styles.primary, state.busy && styles.dim]} disabled={state.busy}
              accessibilityRole="button" accessibilityState={{ busy: state.busy }} onPress={() => { void verify(code); setCode(''); }}>
              <Text style={styles.primaryText}>{state.busy ? 'Comprobando…' : 'Verificar correo'}</Text>
              <HomeIcon name="arrow" size={20} color="#FFFFFF" />
            </Pressable>
            <Pressable style={styles.link} accessibilityRole="button" disabled={state.busy || wait > 0} onPress={() => { setCode(''); void resend(); }}>
              <Text style={styles.linkText}>{wait > 0 ? 'Solicitar otro código en ' + wait + ' s' : 'Solicitar otro código'}</Text>
            </Pressable>
            <Text style={styles.caption}>Máximo tres envíos por solicitud. Si no llega, revisa spam. Una solicitud aceptada no garantiza la entrega del correo.</Text>
            <Pressable style={styles.link} onPress={back} accessibilityRole="link"><Text style={styles.linkText}>Corregir mis datos</Text></Pressable>
          </>}
          {state.stage === 'done' && <Pressable style={styles.primary} accessibilityRole="button"
            onPress={() => { reset(); router.dismissTo('/login'); }}><Text style={styles.primaryText}>Iniciar sesión</Text></Pressable>}
        </>}
      </View>
    </ScrollView>
  </KeyboardAvoidingView>;
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  card: { flexGrow: 1, marginTop: -12, backgroundColor: '#FFFFFF', borderTopLeftRadius: 27, borderTopRightRadius: 27,
    padding: 24, gap: 18, width: '100%', maxWidth: 500, alignSelf: 'center' },
  symbol: { alignSelf: 'center', backgroundColor: '#DDF5FF', padding: 17, borderRadius: 40 },
  title: { color: '#15142D', fontSize: 30, fontWeight: '900', textAlign: 'center' },
  message: { color: '#505568', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  email: { color: '#15142D', textAlign: 'center', fontWeight: '700' },
  primary: { backgroundColor: '#E32670', borderRadius: 26, minHeight: 50, padding: 13,
    flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#FFFFFF', fontWeight: '900', fontSize: 18 },
  caption: { color: '#626878', fontSize: 13, lineHeight: 19, textAlign: 'center' },
  error: { color: '#A6274E', fontSize: 14, textAlign: 'center' },
  link: { minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  linkText: { color: '#1458A0', fontWeight: '800', textAlign: 'center' },
  dim: { opacity: 0.65 },
});
