import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentRef, type ReactNode, type RefObject } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, View } from 'react-native';
import Animated, { Easing, cancelAnimation, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import { StationeryArt, productIllustration } from '../compartidos/ilustraciones-papeleria';
import { useCart } from '@/features/compra-local/proveedor-carrito';
import { cartItemCount, type CartAddResult } from '@/features/compra-local/accion-agregar';
import { createCartFlightCoordinator, makeCartFlight, sampleCartFlight, type CartFlightPath, type FlightRect } from '@/features/compra-local/vuelo-carrito';

export type CartVisualProduct = Readonly<{ id: string; name: string; category_name: string; image_url: string | null }>;
export type CartVisualRef = RefObject<ComponentRef<typeof View> | null>;
type TargetName = 'header' | 'footer';
type Flight = { id: number; product: CartVisualProduct; path: CartFlightPath };
type ContextValue = {
  busy: boolean; displayCount: number; reduced: boolean;
  register(name: TargetName, ref: CartVisualRef): () => void;
  add(product: CartVisualProduct, source: CartVisualRef, fallback: CartVisualRef, commit: () => Promise<CartAddResult>, settle?: () => Promise<void>): Promise<CartAddResult>;
};
const Context = createContext<ContextValue | null>(null);
export const useCartFlight = () => useContext(Context);

export function useMotionPreference(onReduce?: () => void) {
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    let active = true;
    const receive = (value: boolean) => { if (active) { setReduced(value); if (value) onReduce?.(); } };
    void AccessibilityInfo.isReduceMotionEnabled().then(receive).catch(() => {});
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', receive);
    return () => { active = false; subscription.remove(); };
  }, [onReduce]);
  return reduced;
}
async function measure(ref: CartVisualRef | undefined): Promise<FlightRect | null> {
  if (!ref?.current) return null;
  return new Promise(resolve => {
    const timer = setTimeout(() => resolve(null), 150);
    ref.current?.measureInWindow((x, y, width, height) => { clearTimeout(timer); resolve({ x, y, width, height }); });
  });
}

function FlightThumbnail({ product }: { product: CartVisualProduct }) {
  const [failed, setFailed] = useState<string | null>(null);
  return <View style={styles.thumbnail}>
    {product.image_url && product.image_url !== failed ? <Image source={{ uri: product.image_url }} contentFit="contain" style={styles.photo} onError={() => setFailed(product.image_url)} />
      : <StationeryArt kind={productIllustration(product.name, product.category_name)} width={58} height={64} />}
  </View>;
}
function FlyingProduct({ flight, finish }: { flight: Flight; finish: (id: number) => void }) {
  const progress = useSharedValue(0);
  useEffect(() => {
    progress.set(0);
    progress.set(withTiming(1, { duration: 620, easing: Easing.inOut(Easing.quad) }, completed => {
      if (completed) scheduleOnRN(finish, flight.id);
    }));
    return () => cancelAnimation(progress);
  }, [flight, finish, progress]);
  const animated = useAnimatedStyle(() => {
    const point = sampleCartFlight(flight.path, progress.get());
    return { opacity: point.opacity, transform: [{ translateX: point.x - flight.path.size / 2 },
      { translateY: point.y - flight.path.size / 2 }, { scale: point.scale }, { rotate: `${-8 * (1 - progress.get())}deg` }] };
  });
  return <Animated.View style={[styles.flying, { width: flight.path.size, height: flight.path.size }, animated]}>
    <FlightThumbnail product={flight.product} />
  </Animated.View>;
}

export function CartFlightScope({ children }: { children: ReactNode }) {
  const root = useRef<ComponentRef<typeof View>>(null);
  const targets = useRef<Partial<Record<TargetName, CartVisualRef>>>({});
  const sequence = useRef(0);
  const settling = useRef<number | null>(null);
  const pending = useRef<{ id: number; resolve: () => void; timer: ReturnType<typeof setTimeout> } | null>(null);
  const [coordinator] = useState(createCartFlightCoordinator);
  const [flight, setFlight] = useState<Flight | null>(null);
  const [heldCount, setHeldCount] = useState<number | null>(null);
  const cart = useCart();
  const actualCount = cartItemCount(cart.value);
  const finish = useCallback((id: number) => {
    const work = pending.current;
    if (!work || work.id !== id) return;
    clearTimeout(work.timer); pending.current = null;
    setFlight(null); work.resolve();
  }, []);
  const cancel = useCallback(() => {
    sequence.current++;
    settling.current = null;
    coordinator.cancel();
    if (pending.current) finish(pending.current.id);
    setHeldCount(null); setFlight(null);
  }, [coordinator, finish]);
  const reduced = useMotionPreference(cancel);
  useFocusEffect(useCallback(() => () => cancel(), [cancel]));
  useEffect(() => {
    const subscription = AppState.addEventListener('change', next => { if (next !== 'active') cancel(); });
    return () => subscription.remove();
  }, [cancel]);
  const register = useCallback((name: TargetName, ref: CartVisualRef) => {
    targets.current[name] = ref;
    return () => { if (targets.current[name] === ref) delete targets.current[name]; };
  }, []);
  async function add(product: CartVisualProduct, source: CartVisualRef, fallback: CartVisualRef, commit: () => Promise<CartAddResult>, settle?: () => Promise<void>) {
    if (coordinator.isBusy()) return 'ignored';
    const ticket = ++sequence.current;
    const result = await coordinator.run(async () => {
      setHeldCount(actualCount);
      settling.current = ticket;
      try { await settle?.(); }
      finally { if (settling.current === ticket) settling.current = null; }
      if (reduced) return null;
      const [bounds, origin, button, header, footer] = await Promise.all([measure(root), measure(source), measure(fallback), measure(targets.current.header), measure(targets.current.footer)]);
      return makeCartFlight(bounds, origin, button, [header, footer]);
    }, commit, async path => {
      if (!path) return;
      await new Promise<void>(resolve => {
        // Guard against a missing native completion callback; never keep the UI locked.
        const timer = setTimeout(() => finish(ticket), 1000);
        pending.current = { id: ticket, resolve, timer };
        setFlight({ id: ticket, product, path });
      });
    });
    if (sequence.current === ticket) setHeldCount(null);
    return result;
  }
  return <View ref={root} collapsable={false} onLayout={() => { if (settling.current === null) cancel(); }} style={styles.scope}>
    <Context.Provider value={{ busy: heldCount !== null, displayCount: heldCount ?? actualCount, reduced, register, add }}>
      {children}
      {flight && <View pointerEvents="none" accessibilityElementsHidden importantForAccessibility="no-hide-descendants" style={styles.overlay}>
        <FlyingProduct key={flight.id} flight={flight} finish={finish} />
      </View>}
    </Context.Provider>
  </View>;
}
export function CartFlightTarget({ name, children }: { name: TargetName; children: ReactNode }) {
  const ref = useRef<ComponentRef<typeof View>>(null);
  const register = useCartFlight()?.register;
  useEffect(() => register?.(name, ref), [register, name]);
  return <View ref={ref} collapsable={false}>{children}</View>;
}
const styles = StyleSheet.create({
  scope: { flex: 1, backgroundColor: '#FFFFFF' },
  overlay: { position: 'absolute', top: 0, bottom: 0, left: 0, right: 0, zIndex: 1000, elevation: 20, overflow: 'hidden' },
  flying: { position: 'absolute', top: 0, left: 0 },
  thumbnail: { flex: 1, borderRadius: 20, backgroundColor: '#FFF8DC', borderWidth: 2, borderColor: '#F178A8', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', boxShadow: '0 5px 15px rgba(109,39,74,0.2)' },
  photo: { width: '88%', height: '88%' },
});
