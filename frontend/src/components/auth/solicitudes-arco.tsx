import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';
import { Choice, PurchaseButton, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { newPrivacyRequestId, oppositionPurposes, oppositionReason, oppositionStatusLabels,
  type OppositionDetail, type OppositionInput, type OppositionPage, type OppositionPurpose } from '@/features/auth/contratos-privacidad';
import { useAuth } from '@/features/auth/proveedor-sesion';
import { ApiError } from '@/services/http/errores-http';

const purposes = Object.keys(oppositionPurposes) as OppositionPurpose[];
const dateLabel = (date: string) => new Date(date).toLocaleString('es-MX');

export function OppositionRequests() {
  const { createOpposition, listOppositions, readOpposition } = useAuth();
  const [purpose, setPurpose] = useState<OppositionPurpose>();
  const [reason, setReason] = useState('');
  const [page, setPage] = useState<OppositionPage>();
  const [detail, setDetail] = useState<OppositionDetail>();
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [listError, setListError] = useState('');
  const [detailError, setDetailError] = useState('');
  const [loadingFolio, setLoadingFolio] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [loadingPage, setLoadingPage] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const submission = useRef<OppositionInput>(undefined);
  const submitting = useRef(false);
  const detailRequest = useRef<AbortController>(undefined);

  useEffect(() => {
    const abort = new AbortController();
    void listOppositions(undefined, abort.signal).then(result => {
      if (!abort.signal.aborted) { setPage(result); setListError(''); }
    }).catch(() => {
      if (!abort.signal.aborted) setListError('No pudimos consultar tus solicitudes.');
    });
    return () => abort.abort();
  }, [listOppositions, refresh]);

  useEffect(() => () => detailRequest.current?.abort(), []);

  async function send() {
    if (submitting.current) return;
    setError('');
    setNotice('');
    if (!purpose) { setError('Selecciona el tratamiento al que te opones.'); return; }
    const cleaned = oppositionReason(purpose, reason);
    if (cleaned === undefined) { setError('Escribe un motivo válido de hasta 240 caracteres para este tratamiento.'); return; }
    const previous = submission.current;
    const payload = previous?.purpose === purpose && previous.reason === cleaned ? previous
      : { requestId: newPrivacyRequestId(), purpose, reason: cleaned };
    submission.current = payload;
    submitting.current = true;
    setBusy(true);
    try {
      const result = await createOpposition(payload);
      detailRequest.current?.abort();
      setLoadingFolio(undefined);
      setDetailError('');
      setDetail(result);
      setNotice('Solicitud registrada con folio ' + result.folio + '. Consulta el estado abajo.');
      submission.current = undefined;
      setPurpose(undefined);
      setReason('');
      setRefresh(current => current + 1);
    } catch (failure) {
      if (failure instanceof ApiError && failure.status === 409) {
        submission.current = undefined;
        setError('La solicitud cambió. Verifica el historial antes de enviarla otra vez.');
      } else setError('No pudimos confirmar el envío. Reintenta con los mismos datos para conservar el folio.');
    } finally { submitting.current = false; setBusy(false); }
  }

  async function open(folio: string) {
    detailRequest.current?.abort();
    const abort = new AbortController();
    detailRequest.current = abort;
    setLoadingFolio(folio);
    setDetailError('');
    setDetail(undefined);
    try {
      const result = await readOpposition(folio, abort.signal);
      if (!abort.signal.aborted) setDetail(result);
    } catch {
      if (!abort.signal.aborted) setDetailError('No pudimos abrir esta solicitud. Selecciona el folio para reintentar.');
    } finally {
      if (!abort.signal.aborted) setLoadingFolio(undefined);
    }
  }

  async function more() {
    if (!page?.nextCursor || loadingPage) return;
    setLoadingPage(true);
    setListError('');
    const cursor = page.nextCursor;
    try {
      const next = await listOppositions(cursor);
      setPage(current => current?.nextCursor === cursor
        ? { items: [...current.items, ...next.items], nextCursor: next.nextCursor } : current);
    } catch { setListError('No pudimos consultar más solicitudes.'); }
    finally { setLoadingPage(false); }
  }

  return <>
    <Text style={ui.heading}>Solicitar oposición</Text>
    <View style={ui.card}>
      <Text style={ui.text}>Selecciona un tratamiento. Recibirás un folio para consultar la determinación cuando se registre.</Text>
      {purposes.map(item => <View key={item} pointerEvents={busy ? 'none' : 'auto'}>
        <Choice title={oppositionPurposes[item]} selected={purpose === item} onPress={() => setPurpose(item)} />
      </View>)}
      <Text style={ui.text}>El motivo es obligatorio para gestión y seguridad de la cuenta. Evita incluir datos sensibles.</Text>
      <TextInput accessibilityLabel="Motivo de oposición" placeholder="Escribe el motivo" value={reason}
        maxLength={240} editable={!busy} onChangeText={setReason} style={ui.field} />
      {!!error && <Text accessibilityRole="alert" style={ui.error}>{error}</Text>}
      {!!notice && <Text accessibilityLiveRegion="polite" style={ui.note}>{notice}</Text>}
      <PurchaseButton title={busy ? 'Enviando…' : 'Enviar solicitud'} disabled={busy || !purpose} onPress={() => void send()} />
    </View>

    <Text style={ui.heading}>Consultar mis solicitudes</Text>
    <View style={ui.card}>
      {!!listError && <Text accessibilityRole="alert" style={ui.error}>{listError}</Text>}
      {!page && !listError && <Text style={ui.text}>Consultando solicitudes…</Text>}
      {page?.items.length === 0 && <Text style={ui.text}>Todavía no tienes solicitudes.</Text>}
      {page?.items.map(item => <Pressable accessibilityRole="button" key={item.folio}
        onPress={() => void open(item.folio)}>
        <Text style={ui.bold}>{oppositionPurposes[item.purpose]} · {oppositionStatusLabels[item.status]}</Text>
        <Text style={ui.text}>Folio {item.folio}</Text>
      </Pressable>)}
      {!!page?.nextCursor && <PurchaseButton title={loadingPage ? 'Cargando…' : 'Ver más'} disabled={loadingPage} onPress={() => void more()} />}
      {(page || listError) && <PurchaseButton title="Actualizar solicitudes" onPress={() => {
        setListError(''); setRefresh(current => current + 1);
      }} />}
      {!!loadingFolio && <Text accessibilityLiveRegion="polite" style={ui.text}>Consultando detalle…</Text>}
      {!!detailError && <Text accessibilityRole="alert" style={ui.error}>{detailError}</Text>}
      {detail && <View style={ui.card}>
        <Text style={ui.bold}>{oppositionStatusLabels[detail.status]} · {oppositionPurposes[detail.purpose]}</Text>
        <Text style={ui.text}>Folio {detail.folio}</Text>
        {!!detail.reason && <Text style={ui.text}>Motivo · {detail.reason}</Text>}
        {detail.determination && detail.respondedAt ? <>
          <Text style={ui.text}>Determinación · {detail.determination}</Text>
          <Text style={ui.text}>Fecha de respuesta · {dateLabel(detail.respondedAt)}</Text>
        </> : <Text style={ui.text}>Aún no hay una determinación.</Text>}
        {detail.history.map(event => <Text key={event.status} style={ui.text}>
          {oppositionStatusLabels[event.status]} · {dateLabel(event.recordedAt)}
        </Text>)}
        <PurchaseButton title="Actualizar detalle" onPress={() => void open(detail.folio)} />
      </View>}
    </View>
  </>;
}
