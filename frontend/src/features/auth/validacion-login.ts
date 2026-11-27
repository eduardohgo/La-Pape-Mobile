export type LoginCredentials = Readonly<{ email: string; password: string }>;
export type LoginErrors = Partial<Record<keyof LoginCredentials, string>>;

const localPart = /^[A-Za-z0-9!#$%&'*+\/=?^_\x60{|}~.-]+$/;
const domainLabel = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?$/;

export function validEmail(email: string): boolean {
  if (email.length > 254 || /[^\x21-\x7e]/.test(email)) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  const labels = domain.split('.');
  return local.length <= 64 && localPart.test(local)
    && !local.startsWith('.') && !local.endsWith('.') && !local.includes('..')
    && labels.length >= 2 && labels.every((label) => domainLabel.test(label));
}

function passwordFits(password: string): boolean {
  if (password.length > 1024 || /\p{Cs}/u.test(password)) return false;
  let bytes = 0;
  for (const character of password) {
    const codePoint = character.codePointAt(0)!;
    bytes += codePoint < 0x80 ? 1 : codePoint < 0x800 ? 2 : codePoint < 0x10000 ? 3 : 4;
  }
  return bytes <= 1024;
}

export function validateLogin(emailInput: string, password: string):
  { credentials: LoginCredentials; errors?: never } | { credentials?: never; errors: LoginErrors } {
  const email = emailInput.trim();
  const errors: LoginErrors = {};
  if (!validEmail(email)) errors.email = 'Ingresa un correo electrónico válido.';
  if (!password.trim()) errors.password = 'Ingresa tu contraseña.';
  else if (!passwordFits(password)) errors.password = 'La contraseña contiene caracteres inválidos o es demasiado larga.';
  return errors.email || errors.password ? { errors } : { credentials: { email, password } };
}
