export type AddressInput = Readonly<{
  label: string; recipient: string; phone: string; street: string; number: string;
  neighborhood: string; city: string; region: string; postalCode: string; references: string;
}>;
export type AddressField = keyof AddressInput;
export type LocalAddress = AddressInput & Readonly<{ id: string }>;
export const emptyAddress: AddressInput = Object.freeze({ label: 'Casa', recipient: '', phone: '', street: '', number: '',
  neighborhood: '', city: '', region: '', postalCode: '', references: '' });

export const addressFields: readonly { key: AddressField; label: string; max: number; numeric?: boolean; optional?: boolean }[] = [
  { key: 'recipient', label: 'Nombre de quien recibe', max: 120 },
  { key: 'phone', label: 'Teléfono de 10 dígitos', max: 10, numeric: true },
  { key: 'street', label: 'Calle', max: 160 }, { key: 'number', label: 'Número exterior e interior', max: 30 },
  { key: 'neighborhood', label: 'Colonia', max: 100 }, { key: 'city', label: 'Municipio o alcaldía', max: 100 },
  { key: 'region', label: 'Estado', max: 80 }, { key: 'postalCode', label: 'Código postal', max: 5, numeric: true },
  { key: 'references', label: 'Referencias (opcional)', max: 240, optional: true },
];

export function validateAddress(value: AddressInput): Partial<Record<AddressField, string>> {
  const errors: Partial<Record<AddressField, string>> = {};
  for (const field of addressFields) {
    if (typeof value[field.key] !== 'string' || value[field.key].length > field.max
      || (!field.optional && !value[field.key].trim())) errors[field.key] = 'Revisa este campo.';
  }
  if (!/^\d{10}$/.test(value.phone)) errors.phone = 'Escribe un teléfono de 10 dígitos.';
  if (!/^\d{5}$/.test(value.postalCode)) errors.postalCode = 'Escribe un código postal de 5 dígitos.';
  if (!value.label?.trim() || value.label.length > 32) errors.label = 'Escribe un nombre corto para la dirección.';
  return errors;
}

export function parseAddresses(value: unknown): readonly LocalAddress[] {
  if (!Array.isArray(value)) throw new Error('Direcciones locales inválidas.');
  const seen = new Set<string>();
  return Object.freeze(value.map(item => {
    if (!item || typeof item.id !== 'string' || !/^[a-z0-9_-]{1,80}$/.test(item.id) || seen.has(item.id)
      || Object.keys(validateAddress(item)).length) throw new Error('Dirección local inválida.');
    seen.add(item.id);
    const address: Record<string, string> = { id: item.id, label: item.label.trim() };
    for (const field of addressFields) address[field.key] = item[field.key].trim();
    return Object.freeze(address) as LocalAddress;
  }));
}

export type DeliveryMethod = 'home' | 'pickup';
export type PaymentMethod = 'card' | 'paypal' | 'store';
export type CheckoutDraft = Readonly<{ delivery: DeliveryMethod | null; address: AddressInput; payment: PaymentMethod | null }>;
export function checkoutAddressReady(draft: CheckoutDraft): boolean {
  return draft.delivery === 'pickup' || (draft.delivery === 'home' && !Object.keys(validateAddress(draft.address)).length);
}
export function checkoutReviewReady(draft: CheckoutDraft): boolean {
  return checkoutAddressReady(draft) && ['card', 'paypal', 'store'].includes(draft.payment ?? '');
}
