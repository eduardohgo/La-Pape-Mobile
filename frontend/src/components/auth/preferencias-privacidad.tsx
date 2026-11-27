import { useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';
import { PurchaseButton, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { newPrivacyRequestId, type PrivacyPreferences } from '@/features/auth/contratos-privacidad';
import { useAuth } from '@/features/auth/proveedor-sesion';
import { ApiError } from '@/services/http/errores-http';

export function PrivacyPreferencesCard({ onChanged }: { onChanged: () => void }) {
  const { readPrivacyPreferences, recordPromotions } = useAuth();
  const [prefs, setPrefs] = useState<PrivacyPreferences>();
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [refresh, setRefresh] = useState(0);
  const saving = useRef(false);
  const pending = useRef<{ id: string; version: string; granted: boolean }>(undefined);

  useEffect(() => {
    const abort = new AbortController();
    void readPrivacyPreferences(abort.signal).then(value => {
      if (!abort.signal.aborted) { setPrefs(value); setError(''); }
    }).catch(() => {
      if (!abort.signal.aborted) setError('No pudimos comprobar tus preferencias.');
    });
    return () => abort.abort();
  }, [readPrivacyPreferences, refresh]);

  async function save() {
    if (!prefs?.noticeVersion || saving.current) return;
    const granted = !prefs.promotions;
    const previous = pending.current;
    const change = previous?.version === prefs.noticeVersion && previous.granted === granted ? previous
      : { id: newPrivacyRequestId(), version: prefs.noticeVersion, granted };
    pending.current = change;
    saving.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await recordPromotions(change.id, change.version, change.granted);
      pending.current = undefined;
      const current = await readPrivacyPreferences();
      setPrefs(current);
      setNotice(current.promotions === change.granted
        ? change.granted ? 'Autorización de promociones guardada.' : 'Autorización revocada.'
        : 'Se actualizó la preferencia con el estado vigente del servidor.');
      onChanged();
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        pending.current = undefined;
        setPrefs(undefined);
        setRefresh(value => value + 1);
        setNotice('Cambió la versión del aviso. Consulta el aviso y revisa tu decisión.');
      } else setError('No pudimos confirmar el cambio. Actualiza para consultar el estado o reintenta la misma decisión.');
    } finally { setBusy(false); saving.current = false; }
  }

  return <>
    <Text style={ui.heading}>Preferencias de privacidad</Text>
    <View style={ui.card}>
      <Text style={ui.text}>Recibir promociones es opcional y puedes revocar tu autorización.</Text>
      {prefs ? <>
        <Text style={ui.bold}>{prefs.promotions ? 'Promociones autorizadas' : 'Promociones no autorizadas'}</Text>
        {prefs.noticeVersion ? <>
          <Text style={ui.text}>Versión del aviso · {prefs.noticeVersion}</Text>
          <PurchaseButton title={busy ? 'Guardando…' : prefs.promotions ? 'Revocar promociones' : 'Autorizar promociones'}
            disabled={busy} onPress={() => void save()} />
        </> : <Text style={ui.note}>Solo hay un borrador del aviso. Las promociones permanecen desactivadas.</Text>}
      </> : !error && <Text style={ui.text}>Consultando preferencias…</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={ui.note}>{notice}</Text>}
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      {(prefs || error) && <PurchaseButton title="Actualizar preferencias" disabled={busy} onPress={() => {
        setError(''); setRefresh(value => value + 1);
      }} />}
    </View>
  </>;
}
