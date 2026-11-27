import { useEffect, useState } from 'react';
import { Text, TextInput, View } from 'react-native';
import { AccountCancellation } from '@/components/auth/cancelacion-cuenta';
import { OppositionRequests } from '@/components/auth/solicitudes-arco';
import { PrivacyPreferencesCard } from '@/components/auth/preferencias-privacidad';
import { PrivacyDraft } from '@/components/auth/consentimiento-registro';
import { AccountGate } from '@/components/compra/marco-cuenta';
import { PurchaseButton, PurchaseFrame, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { privacyPhaseEnabled } from '@/config/configuracion-api';
import { useRegistration } from '@/features/auth/proveedor-registro';
import { validProfileName, type LegalDocuments } from '@/features/auth/contratos-privacidad';
import { useAuth } from '@/features/auth/proveedor-sesion';
import type { PrivacyData } from '@/features/auth/servicio-auth';

function PrivacyNotice() {
  const { documents } = useRegistration();
  const [opened, setOpened] = useState(false);
  const [result, setResult] = useState<LegalDocuments>();
  const [finished, setFinished] = useState(false);

  useEffect(() => {
    if (!opened) return;
    const abort = new AbortController();
    void documents(abort.signal).then(data => {
      if (!abort.signal.aborted) setResult(data);
    }).catch(() => {
      if (!abort.signal.aborted) setResult(undefined);
    }).finally(() => {
      if (!abort.signal.aborted) setFinished(true);
    });
    return () => abort.abort();
  }, [opened, documents]);

  return <>
    <Text style={ui.heading}>Consultar aviso de privacidad</Text>
    <PrivacyDraft />
    <PurchaseButton title={opened ? 'Ocultar documento de prueba' : 'Consultar documento del laboratorio'}
      onPress={() => { setFinished(false); setResult(undefined); setOpened(value => !value); }} />
    {opened && <View style={ui.card}>
      <Text style={ui.bold}>NO VÁLIDO PARA PRODUCCIÓN</Text>
      {finished ? result ? <>
        <Text style={ui.text}>Versión de prueba · {result.notice.version}</Text>
        <Text style={ui.text}>{result.notice.body}</Text>
      </> : <Text style={ui.text}>No hay un documento de prueba disponible.</Text>
        : <Text style={ui.text}>Consultando documento de prueba…</Text>}
    </View>}
  </>;
}

function PrivacyDetails() {
  const { readPrivacyData, updateProfileName } = useAuth();
  const [data, setData] = useState<PrivacyData>();
  const [name, setName] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const abort = new AbortController();
    void readPrivacyData(abort.signal).then(result => {
      if (!abort.signal.aborted) {
        setData(result);
        setName(result.account.name);
      }
    }).catch(() => {
      if (!abort.signal.aborted) setNotice('No pudimos consultar tus datos. Vuelve a intentarlo.');
    });
    return () => abort.abort();
  }, [readPrivacyData, attempt]);

  async function save() {
    if (!validProfileName(name)) { setNotice('Ingresa un nombre válido de hasta 120 caracteres.'); return; }
    setSaving(true);
    setNotice('');
    try {
      const { user } = await updateProfileName(name.trim());
      setData(previous => previous && { ...previous, account: user });
      setName(user.name);
      setNotice('Tu nombre fue actualizado.');
    } catch { setNotice('No pudimos confirmar el cambio de nombre.'); }
    finally { setSaving(false); }
  }

  return <>
    {notice ? <Text accessibilityLiveRegion="polite" style={ui.text}>{notice}</Text> : null}
    {data ? <>
      <Text style={ui.heading}>Consultar mis datos</Text>
      <View style={ui.card}>
        <Text style={ui.text}>Nombre · {data.account.name}</Text>
        <Text style={ui.text}>Correo · {data.account.email}</Text>
        <Text style={ui.text}>Tipo de cuenta · {data.account.role}</Text>
        <Text style={ui.text}>Cuenta creada · {data.createdAt.slice(0, 10)}</Text>
        <Text style={ui.text}>Correo verificado · {data.emailVerifiedAt.slice(0, 10)}</Text>
        <Text style={ui.text}>Estos datos provienen del servidor. Las direcciones guardadas en este dispositivo se consultan en Mis direcciones.</Text>
      </View>
      <Text style={ui.heading}>Corregir mi nombre</Text>
      <View style={ui.card}>
        <TextInput accessibilityLabel="Nombre" value={name} autoComplete="name" style={ui.text}
          editable={!saving} onChangeText={setName} />
        <PurchaseButton title={saving ? 'Guardando…' : 'Guardar nombre'}
          disabled={saving || name.trim() === data.account.name} onPress={() => void save()} />
      </View>
      <Text style={ui.heading}>Decisiones registradas</Text>
      <View style={ui.card}>
        {data.decisions.length === 0 ? <Text style={ui.text}>Esta cuenta no tiene decisiones registradas.</Text> :
          data.decisions.map((item, index) => <Text key={item.recordedAt + item.purpose + index} style={ui.text}>
            {item.type === 'terms' ? 'Términos aceptados' : item.type === 'notice' ? 'Aviso presentado' :
              (item.type === 'promotions' ? 'Promociones' : item.purpose) + (item.granted ? ' · Autorizado' : ' · No autorizado')}
            {' · v' + item.documentVersion + ' · ' + item.recordedAt.slice(0, 10)}
          </Text>)}
      </View>
    </> : notice
      ? <PurchaseButton title="Reintentar" onPress={() => { setNotice(''); setAttempt(value => value + 1); }} />
      : <Text accessibilityLiveRegion="polite" style={ui.text}>Consultando tus datos…</Text>}
    <Text style={ui.heading}>Cancelación de cuenta</Text>
    <AccountCancellation />
    <OppositionRequests />
    <PrivacyPreferencesCard onChanged={() => setAttempt(current => current + 1)} />
    <PrivacyNotice />
  </>;
}

export default function PrivacyScreen() {
  return <PurchaseFrame title="Privacidad y datos personales" active="profile" back="/perfil">
    <AccountGate>
      {privacyPhaseEnabled() ? <PrivacyDetails /> : <Text style={ui.text}>Esta sección está disponible en el entorno local de prueba.</Text>}
    </AccountGate>
  </PurchaseFrame>;
}
