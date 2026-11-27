import { Image } from 'expo-image';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState, type ComponentRef, type Ref } from 'react';
import {
  Alert, Keyboard, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, TextInput,
  View, type TextInputProps,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ShopHeader } from '@/components/catalogo/componentes-catalogo';
import { isAuthAvailable, privacyPhaseEnabled } from '@/config/configuracion-api';
import { AuthUnavailableNotice } from '@/components/auth/acceso-no-disponible';
import { PrivacyDraft, RegistrationConsent } from '@/components/auth/consentimiento-registro';
import { emptyLegalChoices, registrationPrivacy, type LegalDocuments } from '@/features/auth/contratos-privacidad';
import { useRegistration } from '@/features/auth/proveedor-registro';
import { HomeIcon } from '@/components/compartidos/iconos-papeleria';
import {
  REGISTRATION_MIN_LENGTH, validateRegistrationDraft, type RegistrationDraft,
} from '@/features/auth/validacion-registro';

const googleMark = require('@/assets/images/login/google-g.png');
const ink = '#15142D';
const muted = '#626878';
const pink = '#E32670';
const termsLabel = 'Acepto los Términos y Condiciones y la Política de Privacidad';
const emptyDraft: RegistrationDraft = { name: '', email: '', password: '', confirmation: '', acceptedTerms: false };

type FieldName = keyof RegistrationDraft;
type InputRef = ComponentRef<typeof TextInput>;
type FieldProps = TextInputProps & {
  label: string;
  icon: 'user' | 'mail' | 'lock';
  error?: string;
  hint?: string;
  inputRef?: Ref<InputRef>;
  passwordShown?: boolean;
  onTogglePassword?: () => void;
};

export function RegistrationField({
  label, icon, error, hint, inputRef, passwordShown, onTogglePassword, ...props
}: FieldProps) {
  return (
    <View style={styles.field}>
      <View style={[styles.inputRow, error && styles.invalid]}>
        <HomeIcon name={icon} size={20} color={muted} />
        <TextInput
          {...props}
          ref={inputRef}
          accessibilityLabel={label}
          placeholder={label}
          placeholderTextColor={muted}
          secureTextEntry={onTogglePassword ? !passwordShown : undefined}
          style={styles.input}
        />
        {onTogglePassword && (
          <Pressable
            style={styles.visibility}
            accessibilityRole="button"
            accessibilityLabel={(passwordShown ? 'Ocultar: ' : 'Mostrar: ') + label}
            onPress={onTogglePassword}
          >
            <HomeIcon name={passwordShown ? 'eye' : 'eye-off'} size={19} color={muted} />
          </Pressable>
        )}
      </View>
      {error ? (
        <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{error}</Text>
      ) : hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

export default function RegistrationScreen() {
  const insets = useSafeAreaInsets();
  const registration = useRegistration();
  const privacyEnabled = privacyPhaseEnabled();
  const loadDocuments = registration.documents;
  const [documents, setDocuments] = useState<LegalDocuments | null>(null);
  const [choices, setChoices] = useState(emptyLegalChoices);
  const [documentAttempt, setDocumentAttempt] = useState(0);
  const [documentIssue, setDocumentIssue] = useState(false);
  const privacy = registrationPrivacy(documents, choices);

  useEffect(() => {
    if (!privacyEnabled) return;
    const abort = new AbortController();
    void loadDocuments(abort.signal).then(value => {
      if (!abort.signal.aborted) setDocuments(value);
    }).catch(() => {
      if (!abort.signal.aborted) setDocumentIssue(true);
    });
    return () => abort.abort();
  }, [privacyEnabled, loadDocuments, documentAttempt]);

  function retryDocuments() {
    setDocuments(null);
    setChoices(emptyLegalChoices);
    setDocumentIssue(false);
    setDocumentAttempt(attempt => attempt + 1);
  }
  const [draft, setDraft] = useState(emptyDraft);
  const [touched, setTouched] = useState<Partial<Record<FieldName, boolean>>>({});
  const [submitted, setSubmitted] = useState(false);
  const [passwordShown, setPasswordShown] = useState(false);
  const [confirmationShown, setConfirmationShown] = useState(false);
  const emailInput = useRef<InputRef>(null);
  const passwordInput = useRef<InputRef>(null);
  const confirmationInput = useRef<InputRef>(null);
  const draftForSubmission = privacyEnabled ? { ...draft, acceptedTerms: choices.termsAccepted } : draft;
  const errors = validateRegistrationDraft(draftForSubmission);

  function updateField<K extends FieldName>(field: K, value: RegistrationDraft[K]) {
    setDraft(previous => ({ ...previous, [field]: value }));
  }

  function touch(field: FieldName) {
    setTouched(previous => ({ ...previous, [field]: true }));
  }

  function visibleError(field: FieldName) {
    return (submitted || touched[field]) ? errors[field] : undefined;
  }

  async function submit() {
    setSubmitted(true);
    if (Object.keys(errors).length || registration.state.busy || (privacyEnabled && !privacy)) return;
    Keyboard.dismiss();
    // Returning from verification must allow a deliberate new request.
    if (registration.state.stage !== 'form') registration.reset();
    if (await registration.register(draftForSubmission, privacyEnabled ? privacy ?? undefined : undefined)) {
      setDraft(previous => ({ ...previous, password: '', confirmation: '' }));
      router.push('./verificar-correo');
    }
  }

  const termsError = visibleError('acceptedTerms');
  if (!isAuthAvailable()) return <View style={styles.screen}><ShopHeader variant="login" /><AuthUnavailableNotice /></View>;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={styles.scroll}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        showsVerticalScrollIndicator={false}
      >
        <ShopHeader variant="login" />
        <View style={styles.card}>
          <View style={styles.form}>
            <View style={styles.intro}>
              <Text style={styles.title} accessibilityRole="header">Crear cuenta</Text>
              <Text style={styles.description}>
                Únete a La Pape y descubre todo para tus ideas, estudios y mucha más creatividad.
              </Text>
            </View>

            <View style={styles.fields}>
              <RegistrationField
                label="Nombre completo" icon="user" value={draft.name} autoComplete="name"
                returnKeyType="next" submitBehavior="submit" error={visibleError('name')}
                onBlur={() => touch('name')} onChangeText={value => updateField('name', value)}
                onSubmitEditing={() => emailInput.current?.focus()}
              />
              <RegistrationField
                label="Correo electrónico" icon="mail" value={draft.email} inputRef={emailInput}
                autoComplete="email" autoCapitalize="none" autoCorrect={false} keyboardType="email-address"
                returnKeyType="next" submitBehavior="submit" error={visibleError('email')}
                onBlur={() => touch('email')} onChangeText={value => updateField('email', value)}
                onSubmitEditing={() => passwordInput.current?.focus()}
              />
              <RegistrationField
                label="Contraseña" icon="lock" value={draft.password} inputRef={passwordInput}
                autoComplete="off" autoCapitalize="none" autoCorrect={false}
                returnKeyType="next" submitBehavior="submit" error={visibleError('password')}
                hint={`Mínimo ${REGISTRATION_MIN_LENGTH} caracteres.`} passwordShown={passwordShown}
                onBlur={() => touch('password')} onChangeText={value => updateField('password', value)}
                onTogglePassword={() => setPasswordShown(previous => !previous)}
                onSubmitEditing={() => confirmationInput.current?.focus()}
              />
              <RegistrationField
                label="Confirmar contraseña" icon="lock" value={draft.confirmation} inputRef={confirmationInput}
                autoComplete="off" autoCapitalize="none" autoCorrect={false}
                returnKeyType="done" error={visibleError('confirmation')} passwordShown={confirmationShown}
                onBlur={() => touch('confirmation')} onChangeText={value => updateField('confirmation', value)}
                onTogglePassword={() => setConfirmationShown(previous => !previous)}
              />
            </View>

            {privacyEnabled ? documents
              ? <>
                <RegistrationConsent documents={documents} choices={choices} onChange={setChoices} />
                <Pressable disabled={registration.state.busy} accessibilityRole="button" onPress={retryDocuments}>
                  <Text style={styles.linkText}>Volver a consultar los documentos</Text>
                </Pressable>
              </> : <>
                <PrivacyDraft />
                {documentIssue
                  ? <Pressable accessibilityRole="button" onPress={retryDocuments}>
                    <Text style={styles.linkText}>Volver a consultar los documentos</Text>
                  </Pressable>
                  : <Text accessibilityLiveRegion="polite" style={styles.termsText}>Consultando documentos…</Text>}
              </>
              : <View style={styles.terms}>
              <Pressable
                style={styles.termsRow} accessibilityRole="checkbox" accessibilityLabel={termsLabel}
                accessibilityState={{ checked: draft.acceptedTerms }}
                onPress={() => updateField('acceptedTerms', !draft.acceptedTerms)}
              >
                <View style={[styles.checkbox, draft.acceptedTerms && styles.checked, termsError && styles.invalid]}>
                  {draft.acceptedTerms && <HomeIcon name="check" size={17} color="#FFFFFF" />}
                </View>
                <Text style={styles.termsText}>
                  Acepto los <Text style={styles.linkText}>Términos y Condiciones</Text> y la{' '}
                  <Text style={styles.linkText}>Política de Privacidad</Text>
                </Text>
              </Pressable>
              {termsError && <Text style={styles.error} accessibilityRole="alert" accessibilityLiveRegion="polite">{termsError}</Text>}
            </View>}

            {registration.state.error && <Text style={styles.error} accessibilityRole="alert">{registration.state.error}</Text>}
            <Pressable style={({ pressed }) => [styles.primary, (pressed || registration.state.busy) && styles.dim]}
              accessibilityRole="button" disabled={registration.state.busy || (privacyEnabled && !privacy)} accessibilityState={{ busy: registration.state.busy, disabled: registration.state.busy || (privacyEnabled && !privacy) }}
              onPress={() => { void submit(); }}>
              <Text style={styles.primaryText}>{registration.state.busy ? 'Preparando…' : 'Crear cuenta'}</Text>
              <HomeIcon name="arrow" size={20} color="#FFFFFF" />
            </Pressable>

            <View style={styles.divider} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={styles.rule} />
              <Text style={styles.dividerLabel}>o</Text>
              <View style={styles.rule} />
            </View>

            <Pressable
              style={({ pressed }) => [styles.google, pressed && styles.dim]}
              accessibilityRole="button" accessibilityHint="Próximamente"
              onPress={() => Alert.alert('Continuar con Google', 'El registro con Google estará disponible próximamente.')}
            >
              <Image source={googleMark} style={styles.googleMark} contentFit="contain" accessible={false} />
              <Text style={styles.googleText}>Continuar con Google</Text>
            </Pressable>
          </View>

          <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, 10) }]}>
            <View pointerEvents="none" style={styles.footerArt} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
              <View style={[styles.corner, styles.cornerLeft]} />
              <View style={[styles.cornerTail, styles.cornerTailLeft]} />
              <View style={[styles.corner, styles.cornerRight]} />
              <View style={[styles.cornerTail, styles.cornerTailRight]} />
            </View>
            <View style={styles.loginRow}>
              <Text style={styles.loginText}>¿Ya tienes cuenta?</Text>
              <Pressable style={styles.loginLink} accessibilityRole="link" onPress={() => { registration.reset(); router.dismissTo('/login'); }}>
                <Text style={styles.linkText}>Inicia sesión</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flexGrow: 1 },
  card: {
    flexGrow: 1, alignSelf: 'center', width: '100%', maxWidth: 500, marginTop: -12,
    backgroundColor: '#FFFFFF', borderTopLeftRadius: 27, borderTopRightRadius: 27, overflow: 'hidden',
  },
  form: { paddingHorizontal: 20, paddingTop: 20 },
  intro: { alignItems: 'center', gap: 6, marginBottom: 18 },
  title: { color: ink, fontSize: 34, fontWeight: '900', letterSpacing: -0.9, textAlign: 'center' },
  description: { color: '#505568', fontSize: 15, lineHeight: 20, textAlign: 'center', maxWidth: 330 },
  fields: { gap: 8 },
  field: { gap: 4 },
  inputRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 46, paddingLeft: 13,
    backgroundColor: '#F7F8FA', borderWidth: 1, borderColor: '#DBDDE5', borderRadius: 20,
  },
  input: { flex: 1, minWidth: 0, minHeight: 44, paddingVertical: 9, paddingRight: 10, fontSize: 15, color: ink },
  visibility: { minHeight: 44, minWidth: 44, alignItems: 'center', justifyContent: 'center' },
  invalid: { borderColor: '#A6274E' },
  hint: { color: muted, marginHorizontal: 12, fontSize: 12, lineHeight: 16 },
  error: { color: '#A6274E', marginHorizontal: 12, fontSize: 13, lineHeight: 18 },
  terms: { marginTop: 9, marginBottom: 12, gap: 4 },
  termsRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 9, minHeight: 44, paddingTop: 6, paddingBottom: 6 },
  checkbox: {
    width: 20, height: 20, marginTop: 1, borderRadius: 5, borderWidth: 1.5, borderColor: muted,
    alignItems: 'center', justifyContent: 'center',
  },
  checked: { borderColor: pink, backgroundColor: pink },
  termsText: { flex: 1, color: ink, fontSize: 13, lineHeight: 19 },
  linkText: { color: '#1458A0', fontWeight: '800', fontSize: 13, lineHeight: 19 },
  primary: {
    flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center',
    minHeight: 48, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 26, backgroundColor: pink,
  },
  primaryText: { flexShrink: 1, fontSize: 19, fontWeight: '900', color: '#FFFFFF', textAlign: 'center' },
  dim: { opacity: 0.78 },
  divider: { flexDirection: 'row', alignItems: 'center', gap: 12, marginVertical: 12 },
  rule: { flex: 1, height: 1, backgroundColor: '#D6D8DD' },
  dividerLabel: { fontSize: 13, color: '#505568' },
  google: {
    flexDirection: 'row', gap: 10, alignItems: 'center', justifyContent: 'center', minHeight: 47,
    borderWidth: 1, borderColor: '#C7C9D2', borderRadius: 25, paddingHorizontal: 14, paddingVertical: 8,
  },
  googleMark: { width: 23, height: 23 },
  googleText: { flexShrink: 1, fontSize: 15, fontWeight: '800', color: ink, textAlign: 'center' },
  footer: { flexGrow: 1, justifyContent: 'flex-end', paddingTop: 2, paddingHorizontal: 28 },
  footerArt: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, overflow: 'hidden' },
  corner: { position: 'absolute', width: 96, height: 67, borderRadius: 36, bottom: -30 },
  cornerLeft: { left: -42, backgroundColor: '#FFDD59', transform: [{ rotate: '32deg' }] },
  cornerRight: { right: -47, backgroundColor: '#FA69A5', transform: [{ rotate: '-42deg' }] },
  cornerTail: { position: 'absolute', width: 67, height: 37, borderRadius: 26, bottom: -27 },
  cornerTailLeft: { left: 13, backgroundColor: '#FFDD59' },
  cornerTailRight: { right: 13, backgroundColor: '#FA69A5' },
  loginRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap', columnGap: 5 },
  loginText: { color: '#505568', fontSize: 13 },
  loginLink: { minHeight: 44, justifyContent: 'center' },
});
