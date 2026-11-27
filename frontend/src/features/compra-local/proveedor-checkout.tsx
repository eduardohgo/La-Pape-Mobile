import { createContext, useContext, useState, type Dispatch, type ReactNode, type SetStateAction } from 'react';
import { useAuth } from '../auth/proveedor-sesion';
import { emptyAddress, type CheckoutDraft } from './checkout';

const Context = createContext<{ draft: CheckoutDraft; setDraft: Dispatch<SetStateAction<CheckoutDraft>> } | null>(null);
function DraftScope({ children, name }: { children: ReactNode; name: string }) {
  const [draft, setDraft] = useState<CheckoutDraft>(() => ({ delivery: 'home', address: { ...emptyAddress, recipient: name }, payment: null }));
  return <Context.Provider value={{ draft, setDraft }}>{children}</Context.Provider>;
}
export function CheckoutProvider({ children }: { children: ReactNode }) {
  const { state } = useAuth();
  const user = state.status === 'authenticated' ? state.session.user : null;
  return <DraftScope key={user?.id ?? 'guest'} name={user?.name ?? ''}>{children}</DraftScope>;
}
export function useCheckout() {
  const value = useContext(Context);
  if (!value) throw new Error('Falta CheckoutProvider.');
  return value;
}
