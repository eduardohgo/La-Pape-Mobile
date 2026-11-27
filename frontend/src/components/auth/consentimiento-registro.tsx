import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { LegalChoices, LegalDocuments } from '@/features/auth/contratos-privacidad';

export function PrivacyDraft() {
  return <View style={styles.card}>
    <Text style={styles.heading}>Aviso de privacidad · BORRADOR</Text>
    <Text style={styles.text}>Propuesta local. Falta confirmar responsable legal, domicilio, canal ARCO y conservación. No es un aviso vigente.</Text>
    <Text style={styles.text}>Se prevé tratar el nombre y correo para gestionar la cuenta, verificar la dirección y proteger el acceso. Las promociones serían opcionales.</Text>
  </View>;
}

type Props = {
  documents: LegalDocuments;
  choices: LegalChoices;
  onChange: (choices: LegalChoices) => void;
};

export function RegistrationConsent({ documents, choices, onChange }: Props) {
  function checkbox(label: string, checked: boolean, action: () => void) {
    return <Pressable onPress={action} accessibilityRole="checkbox" accessibilityState={{ checked }}
      accessibilityLabel={label} style={styles.row}>
      <Text style={styles.mark}>{checked ? '☑' : '☐'}</Text><Text style={styles.text}>{label}</Text>
    </Pressable>;
  }

  return <View style={styles.card}>
    <Text style={styles.heading}>Términos · {documents.terms.version}</Text>
    <Text style={styles.text}>{documents.terms.body}</Text>
    {checkbox('Acepto los términos del servicio.', choices.termsAccepted,
      () => onChange({ ...choices, termsAccepted: !choices.termsAccepted }))}
    <Text style={styles.heading}>Aviso de privacidad · {documents.notice.version}</Text>
    <Text style={styles.text}>{documents.notice.body}</Text>
    {checkbox('Confirmo que se me presentó el aviso de privacidad.', choices.noticePresented,
      () => onChange({ ...choices, noticePresented: !choices.noticePresented }))}
    {documents.notice.specificPurpose !== null && <View>
      <Text style={styles.text}>Finalidad específica descrita en el aviso · {documents.notice.specificPurpose}</Text>
      {checkbox('Autorizo esta finalidad específica.', choices.specificGranted === true,
        () => onChange({ ...choices, specificGranted: choices.specificGranted === true ? null : true }))}
      {checkbox('Rechazo esta finalidad específica.', choices.specificGranted === false,
        () => onChange({ ...choices, specificGranted: choices.specificGranted === false ? null : false }))}
    </View>}
    {checkbox('Quiero recibir promociones (opcional).', choices.promotions,
      () => onChange({ ...choices, promotions: !choices.promotions }))}
  </View>;
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#FFF8DF', borderRadius: 14, gap: 9, padding: 12 },
  heading: { color: '#252334', fontWeight: '700', fontSize: 14 },
  text: { color: '#252334', flexShrink: 1, fontSize: 13, lineHeight: 20 },
  row: { alignItems: 'center', flexDirection: 'row', gap: 9, minHeight: 44 },
  mark: { color: '#AC155C', fontSize: 23 },
});
