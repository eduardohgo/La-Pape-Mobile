export type PrivacyDecision = Readonly<{
  type: 'terms' | 'notice' | 'specific' | 'promotions';
  purpose: string;
  granted: boolean;
  documentVersion: string;
  recordedAt: string;
}>;

export type LegalDocuments = Readonly<{
  terms: { version: string; body: string };
  notice: { version: string; body: string; specificPurpose: string | null };
}>;

export type SignupPrivacy = Readonly<{
  termsVersion: string;
  noticeVersion: string;
  termsAccepted: true;
  noticePresented: true;
  specificGranted: boolean | null;
  promotions: boolean;
}>;

export type LegalChoices = Readonly<{
  termsAccepted: boolean;
  noticePresented: boolean;
  specificGranted: boolean | null;
  promotions: boolean;
}>;

export const emptyLegalChoices: LegalChoices = Object.freeze({
  termsAccepted: false, noticePresented: false, specificGranted: null, promotions: false,
});

export function registrationPrivacy(documents: LegalDocuments | null, choices: LegalChoices): SignupPrivacy | null {
  if (!documents || !choices.termsAccepted || !choices.noticePresented
    || (documents.notice.specificPurpose === null) !== (choices.specificGranted === null)) return null;
  return { ...choices, termsAccepted: true, noticePresented: true,
    termsVersion: documents.terms.version, noticeVersion: documents.notice.version };
}

export function validProfileName(value: string) {
  return !!value.trim() && [...value.trim()].length <= 120 && !/[\p{Cc}\p{Cf}\p{Cs}]/u.test(value);
}

export const record = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value);

const version = (value: unknown) => typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]{0,39}$/.test(value);
export const validPrivacyPurpose = (value: unknown) => typeof value === 'string' && /^[a-z][a-z0-9_]{0,39}$/.test(value);
export const validPrivacyDate = (value: unknown) => typeof value === 'string' && Number.isFinite(Date.parse(value));
const document = (value: unknown): value is { version: string; body: string } & Record<string, unknown> =>
  record(value) && version(value.version) && typeof value.body === 'string' && !!value.body.trim();

export function isLegalDocuments(value: unknown): value is LegalDocuments {
  return record(value) && document(value.terms) && document(value.notice)
    && (value.notice.specificPurpose === null || validPrivacyPurpose(value.notice.specificPurpose));
}

export const oppositionPurposes = {
  promotions: 'Promociones',
  account_management: 'Gestión de la cuenta',
  account_security: 'Seguridad de la cuenta',
} as const;

export type OppositionPurpose = keyof typeof oppositionPurposes;
export type OppositionStatus = 'RECEIVED' | 'IN_REVIEW' | 'RESOLVED' | 'REJECTED';
export const oppositionStatusLabels: Record<OppositionStatus, string> = {
  RECEIVED: 'Recibida', IN_REVIEW: 'En revisión', RESOLVED: 'Resuelta', REJECTED: 'Rechazada',
};
export type OppositionInput = { requestId: string; purpose: OppositionPurpose; reason: string | null };
export type OppositionSummary = { folio: string; purpose: OppositionPurpose; status: OppositionStatus;
  createdAt: string; respondedAt: string | null };
export type OppositionDetail = OppositionSummary & {
  reason: string | null; determination: string | null;
  history: { status: OppositionStatus; recordedAt: string }[];
};
export type OppositionPage = { items: OppositionSummary[]; nextCursor: string | null };
export type PrivacyPreferences = { noticeVersion: string | null; promotions: boolean; recordedAt: string | null };

export const isFolio = (value: unknown): value is string => typeof value === 'string'
  && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
const isOppositionStatus = (value: unknown) => typeof value === 'string' && Object.hasOwn(oppositionStatusLabels, value);
const nullableText = (value: unknown) => value === null || typeof value === 'string';
const nullableDate = (value: unknown) => value === null || validPrivacyDate(value);

function isOppositionSummary(value: unknown): value is OppositionSummary {
  return record(value) && isFolio(value.folio) && typeof value.purpose === 'string'
    && Object.hasOwn(oppositionPurposes, value.purpose) && isOppositionStatus(value.status)
    && validPrivacyDate(value.createdAt) && nullableDate(value.respondedAt)
    && (value.status === 'RESOLVED' || value.status === 'REJECTED') === (value.respondedAt !== null);
}
export function isOppositionDetail(value: unknown): value is OppositionDetail {
  if (!record(value)) return false;
  const { reason, determination, history } = value;
  return isOppositionSummary(value) && nullableText(reason) && nullableText(determination)
    && ((value.status === 'RESOLVED' || value.status === 'REJECTED') ===
      (typeof determination === 'string' && !!determination.trim()))
    && Array.isArray(history) && history.length > 0
    && history.every(item => record(item) && isOppositionStatus(item.status) && validPrivacyDate(item.recordedAt))
    && history[0].status === 'RECEIVED' && history.at(-1).status === value.status;
}
export function isOppositionPage(value: unknown): value is OppositionPage {
  return record(value) && Array.isArray(value.items) && value.items.every(isOppositionSummary)
    && (value.nextCursor === null || isFolio(value.nextCursor));
}
export function isPrivacyPreferences(value: unknown): value is PrivacyPreferences {
  return record(value) && (value.noticeVersion === null || version(value.noticeVersion))
    && typeof value.promotions === 'boolean' && (!value.promotions || value.noticeVersion !== null)
    && nullableDate(value.recordedAt);
}

export function oppositionReason(purpose: OppositionPurpose, input: string) {
  if (/[\p{Cc}\p{Cf}\p{Cs}]/u.test(input) || [...input].length > 240) return undefined;
  return input.trim() || (purpose === 'promotions' ? null : undefined);
}

// The request ID correlates retries for one authenticated user. It is not a folio,
// token or proof of identity. The server generates those independently.
export function newPrivacyRequestId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, key => {
    const nibble = Math.floor(Math.random() * 16);
    return (key === 'x' ? nibble : (nibble & 3) | 8).toString(16);
  });
}

export function isPrivacyDecision(value: unknown): value is PrivacyDecision {
  return record(value) && (value.type === 'terms' || value.type === 'notice' || value.type === 'specific' || value.type === 'promotions')
    && validPrivacyPurpose(value.purpose) && version(value.documentVersion) && typeof value.granted === 'boolean'
    && validPrivacyDate(value.recordedAt);
}
