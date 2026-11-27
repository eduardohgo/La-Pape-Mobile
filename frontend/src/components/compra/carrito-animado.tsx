import { router, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useRef, useState, type ComponentRef } from 'react';
import { AccessibilityInfo, ActivityIndicator, Keyboard, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, { cancelAnimation, useAnimatedStyle, useSharedValue, withSequence, withSpring, withTiming } from 'react-native-reanimated';
import { HomeIcon } from '../compartidos/iconos-papeleria';
import { useCart } from '@/features/compra-local/proveedor-carrito';
import { cartItemCount, createCartAddAction } from '@/features/compra-local/accion-agregar';
import { CartFlightTarget, useCartFlight, useMotionPreference, type CartVisualProduct, type CartVisualRef } from './vuelo-carrito';

export function CartCounterIcon({ color = '#252334' }: { color?: string }) {
  const cart = useCart();
  const flight = useCartFlight();
  const count = flight?.displayCount ?? cartItemCount(cart.value);
  const localReduced = useMotionPreference();
  const reduced = flight?.reduced ?? localReduced;
  const previous = useRef(count);
  const scale = useSharedValue(1);
  const badgeScale = useSharedValue(1);
  useEffect(() => {
    if (!reduced && count > previous.current) {
      scale.set(withSequence(withTiming(1.2, { duration: 120 }), withSpring(1, { damping: 9, stiffness: 230 })));
      badgeScale.set(withSequence(withTiming(1.35, { duration: 110 }), withSpring(1, { damping: 9 })));
    } else { scale.set(1); badgeScale.set(1); }
    previous.current = count;
    return () => { cancelAnimation(scale); cancelAnimation(badgeScale); };
  }, [count, reduced, scale, badgeScale]);
  const iconStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.get() }] }));
  const badgeStyle = useAnimatedStyle(() => ({ transform: [{ scale: badgeScale.get() }] }));
  return <Animated.View style={[styles.icon, iconStyle]} accessible accessibilityLabel={`Carrito, ${count} ${count === 1 ? 'artículo' : 'artículos'}`}>
    <HomeIcon name="cart" color={color} />
    {count > 0 && <Animated.View style={[styles.badge, badgeStyle]}><Text style={styles.badgeText}>{count > 99 ? '99+' : count}</Text></Animated.View>}
  </Animated.View>;
}

export function CartShortcut() {
  const cart = useCart();
  const count = useCartFlight()?.displayCount ?? cartItemCount(cart.value);
  return <CartFlightTarget name="header"><Pressable style={styles.shortcut} onPress={() => router.navigate('/carrito')} accessibilityRole="button" accessibilityLabel={`Abrir carrito, ${count} artículos`}>
    <CartCounterIcon />
  </Pressable></CartFlightTarget>;
}

export function AddToCartButton({ product, source, quantity = 1, appearance = 'primary' }: {
  product: CartVisualProduct; source: CartVisualRef; quantity?: number; appearance?: 'split' | 'primary';
}) {
  const cart = useCart();
  const flight = useCartFlight();
  const button = useRef<ComponentRef<typeof View>>(null);
  const [add] = useState(() => createCartAddAction(cart.add));
  const [status, setStatus] = useState<'idle' | 'saving' | 'added' | 'error'>('idle');
  const [lastQuantity, setLastQuantity] = useState(1);
  const alive = useRef(true);
  const submission = useRef<symbol | null>(null);
  const keyboardWait = useRef<(() => void) | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useFocusEffect(useCallback(() => {
    alive.current = true;
    return () => { alive.current = false; submission.current = null; keyboardWait.current?.(); if (timer.current) clearTimeout(timer.current); setStatus('idle'); };
  }, []));
  async function settleKeyboard() {
    // Measure only after the keyboard has stopped resizing the Android viewport.
    if (typeof Keyboard.isVisible === 'function' && Keyboard.isVisible()) {
      await new Promise<void>(resolve => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true; clearTimeout(deadline); listener.remove(); keyboardWait.current = null; resolve();
        };
        const listener = Keyboard.addListener('keyboardDidHide', finish);
        const deadline = setTimeout(finish, 500);
        keyboardWait.current = finish;
        Keyboard.dismiss();
      });
    }
  }
  async function submit() {
    if (cart.status !== 'ready' || cart.saving || flight?.busy || submission.current) return;
    const ticket = Symbol(); submission.current = ticket;
    if (timer.current) clearTimeout(timer.current);
    setStatus('saving');
    const commit = () => add(product.id, quantity);
    const result = flight ? await flight.add(product, source, button, commit, settleKeyboard) : await commit();
    if (!alive.current || submission.current !== ticket) return;
    submission.current = null;
    if (result === 'ignored') { setStatus('idle'); return; }
    setStatus(result === 'added' ? 'added' : 'error');
    if (result === 'added') {
      setLastQuantity(quantity);
      AccessibilityInfo.announceForAccessibility('Agregado al carrito');
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => { if (alive.current) setStatus('idle'); }, 1700);
    }
  }
  const busy = status === 'saving' || cart.saving || cart.status !== 'ready' || !!flight?.busy;
  const split = appearance === 'split';
  return <View ref={button} collapsable={false} style={split ? styles.splitContainer : undefined}>
    <Pressable accessibilityRole="button" accessibilityLabel={`Agregar ${quantity} ${quantity === 1 ? 'unidad' : 'unidades'} de ${product.name} al carrito`} accessibilityState={{ disabled: busy, busy }} disabled={busy}
      onPress={() => void submit()} style={({ pressed }) => [styles.add, split && styles.split, (pressed || busy) && { opacity: 0.65 }, status === 'added' && split && styles.added]}>
      {status === 'saving' ? <ActivityIndicator color="#FFFFFF" size="small" /> : <HomeIcon name={status === 'added' ? 'check' : 'cart'} size={split ? 20 : 21} color="#FFFFFF" />}
      <Text style={[styles.addText, split && styles.splitLabel]}>{split && status === 'added' ? '¡Agregado!' : 'Agregar al carrito'}</Text>
    </Pressable>
    {!split && status === 'added' && <Text accessibilityLiveRegion="polite" style={styles.success}>Se {lastQuantity === 1 ? 'agregó 1 unidad' : `agregaron ${lastQuantity} unidades`} al carrito.</Text>}
    {status === 'error' && <Text accessibilityRole="alert" style={styles.error}>No se pudo agregar. Revisa tu carrito e inténtalo de nuevo.</Text>}
  </View>;
}

const styles = StyleSheet.create({
  icon: { width: 32, height: 28, justifyContent: 'center', alignItems: 'center' },
  badge: { position: 'absolute', top: -6, right: -7, minWidth: 19, minHeight: 19, paddingHorizontal: 4, borderRadius: 10, backgroundColor: '#C21F60', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#FFFFFF' },
  badgeText: { fontSize: 10, fontWeight: '800', color: '#FFFFFF' },
  shortcut: { width: 46, height: 46, borderRadius: 23, backgroundColor: '#FFFFFF', justifyContent: 'center', alignItems: 'center' },
  add: { minHeight: 54, borderRadius: 24, backgroundColor: '#E32670', paddingHorizontal: 12, paddingVertical: 13, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 9 },
  splitContainer: { flex: 1, minWidth: 0 },
  split: { flex: 1, borderRadius: 0, minHeight: 76, paddingHorizontal: 5, paddingVertical: 10, flexDirection: 'column', gap: 5 },
  splitLabel: { fontSize: 12, lineHeight: 16 },
  added: { backgroundColor: '#2379B6' },
  addText: { color: '#FFFFFF', fontSize: 15, lineHeight: 20, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  success: { color: '#176EAE', fontSize: 13, lineHeight: 19, marginTop: 9, fontWeight: '600' },
  error: { color: '#A6274E', fontSize: 11, lineHeight: 16, marginTop: 5 },
});
