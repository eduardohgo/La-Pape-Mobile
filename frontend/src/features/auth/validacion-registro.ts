import { validEmail, validateLogin } from './validacion-login';

export type RegistrationDraft = {
  name: string;
  email: string;
  password: string;
  confirmation: string;
  acceptedTerms: boolean;
};

export type RegistrationErrors = Partial<Record<keyof RegistrationDraft, string>>;

// Same policy as backend registration: Unicode code points, exact password, 1024 UTF-8 bytes.
export const REGISTRATION_MIN_LENGTH = 8;

export function validateRegistrationDraft(draft: RegistrationDraft): RegistrationErrors {
  const errors: RegistrationErrors = {};
  const email = draft.email.trim();

  if (!draft.name.trim()) errors.name = 'Ingresa tu nombre completo.';
  else if (Array.from(draft.name).length > 120 || /[\p{Cc}\p{Cf}\p{Cs}]/u.test(draft.name.trim())) errors.name = 'Revisa tu nombre; máximo 120 caracteres.';
  if (!email) errors.email = 'Ingresa tu correo electrónico.';
  else if (draft.email.length > 254 || !validEmail(email)) errors.email = 'Ingresa un correo electrónico válido.';

  if (!draft.password.trim()) errors.password = 'Ingresa una contraseña.';
  else if (validateLogin(email, draft.password).errors?.password) errors.password = 'La contraseña contiene caracteres inválidos o supera 1024 bytes.';
  else if (Array.from(draft.password).length < REGISTRATION_MIN_LENGTH) {
    errors.password = `Usa al menos ${REGISTRATION_MIN_LENGTH} caracteres.`;
  }

  if (!draft.confirmation.trim()) errors.confirmation = 'Confirma tu contraseña.';
  else if (draft.confirmation !== draft.password) errors.confirmation = 'Las contraseñas no coinciden.';

  if (!draft.acceptedTerms) errors.acceptedTerms = 'Marca la casilla para continuar.';

  return errors;
}
