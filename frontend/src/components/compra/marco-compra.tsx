import { router, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { palette, ShopHeader } from '../catalogo/componentes-catalogo';
import { HomeIcon } from '../compartidos/iconos-papeleria';
import { useCart } from '@/features/compra-local/proveedor-carrito';

export const purchaseStyles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '900', letterSpacing: -0.7, color: palette.ink },
  heading: { fontSize: 17, fontWeight: '800', color: palette.ink },
  text: { fontSize: 14, lineHeight: 21, color: palette.muted },
  card: { padding: 16, borderRadius: 19, borderWidth: 1, borderColor: '#ECE9F0', backgroundColor: '#FFFFFF', gap: 12 },
  note: { padding: 13, borderRadius: 14, backgroundColor: '#FFF5D4', color: '#665528', fontSize: 13, lineHeight: 20 },
  error: { color: '#A6274E', fontSize: 13, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  bold: { color: palette.ink, fontSize: 15, fontWeight: '800' },
  field: { minHeight: 49, borderRadius: 13, borderWidth: 1, borderColor: '#DCDCE4', padding: 13, color: palette.ink, fontSize: 15, backgroundColor: '#FCFBFD' },
});

export function PurchaseButton({ title, onPress, disabled = false }: { title: string; onPress?: () => void; disabled?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityState={{ disabled }} disabled={disabled}
    onPress={onPress} style={({ pressed }) => [styles.button, (disabled || pressed) && styles.dim]}>
    <Text style={styles.buttonText}>{title}</Text><HomeIcon name="arrow" color="#FFFFFF" size={19} />
  </Pressable>;
}

export function Choice({ title, detail, selected, onPress }: { title: string; detail?: string; selected: boolean; onPress: () => void }) {
  return <Pressable accessibilityRole="radio" accessibilityState={{ checked: selected }} onPress={onPress}
    style={[purchaseStyles.card, { flexDirection: 'row', alignItems: 'center', borderColor: selected ? '#2588D6' : '#ECE9F0' }]}>
    <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: 1.5, borderColor: selected ? '#2588D6' : '#AAA6B4', alignItems: 'center', justifyContent: 'center' }}>
      {selected && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: '#2588D6' }} />}
    </View>
    <View style={{ flex: 1, gap: 4 }}><Text style={purchaseStyles.bold}>{title}</Text>{detail && <Text style={purchaseStyles.text}>{detail}</Text>}</View>
  </Pressable>;
}

export function PurchaseTabs({ active }: { active: 'cart' | 'favorites' | 'profile' }) {
  const insets = useSafeAreaInsets();
  const cart = useCart();
  const items: { id: string; label: string; icon: 'home' | 'grid' | 'cart' | 'heart' | 'user'; href: Href }[] = [
    { id: 'home', label: 'Inicio', icon: 'home', href: '/' },
    { id: 'catalog', label: 'Catálogo', icon: 'grid', href: '/explore' },
    { id: 'cart', label: 'Carrito', icon: 'cart', href: '/carrito' },
    { id: 'favorites', label: 'Favoritos', icon: 'heart', href: '/favoritos' },
    { id: 'profile', label: 'Perfil', icon: 'user', href: '/perfil' },
  ];
  return <View style={[styles.tabs, { paddingBottom: Math.max(insets.bottom, 8) }]}>
    {items.map(item => <Pressable key={item.id} accessibilityRole="button" accessibilityState={{ selected: item.id === active }}
      onPress={() => router.navigate(item.href)} style={styles.tab}>
      <HomeIcon name={item.icon} size={22} color={item.id === active ? active === 'favorites' ? '#EF2D78' : '#D4A800' : palette.ink} filled={item.id === active} />
      <Text style={styles.tabLabel}>{item.label}{item.id === 'cart' && cart.value.length ? ` (${cart.value.length})` : ''}</Text>
      {item.id === active && <View style={styles.indicator} />}
    </Pressable>)}
  </View>;
}

export function PurchaseFrame({ title, children, active = 'cart', back = '/explore' }: {
  title: string; children: ReactNode; active?: 'cart' | 'favorites' | 'profile'; back?: Href;
}) {
  return <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
    <StatusBar style="dark" />
    <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="on-drag" contentContainerStyle={styles.scroll}>
      <ShopHeader left={<Pressable accessibilityRole="button" accessibilityLabel="Volver" style={styles.back}
        onPress={() => { if (router.canGoBack()) router.back(); else router.replace(back); }}><HomeIcon name="back" /></Pressable>}
        right={<Pressable accessibilityRole="button" accessibilityLabel="Abrir carrito" style={styles.back}
          onPress={() => router.navigate('/carrito')}><HomeIcon name="cart" /></Pressable>}>
        {title ? <Text accessibilityRole="header" style={purchaseStyles.title}>{title}</Text> : null}
      </ShopHeader>
      <View style={styles.content}>{children}</View>
      <View pointerEvents="none" style={styles.decorations}><View style={styles.yellow} /><View style={styles.pink} /><View style={styles.blue} /></View>
    </ScrollView>
    <PurchaseTabs active={active} />
  </KeyboardAvoidingView>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flexGrow: 1, paddingBottom: 32 },
  content: { width: '100%', maxWidth: 620, alignSelf: 'center', padding: 18, gap: 16, zIndex: 1 },
  back: { width: 42, height: 42, borderRadius: 21, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center' },
  button: { minHeight: 50, paddingHorizontal: 20, paddingVertical: 13, borderRadius: 25, backgroundColor: '#F92D81', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9 },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800' },
  dim: { opacity: 0.48 },
  tabs: { flexDirection: 'row', backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#EEEAF0', paddingTop: 10 },
  tab: { flex: 1, minHeight: 48, alignItems: 'center', gap: 5, position: 'relative', paddingHorizontal: 2 },
  tabLabel: { fontSize: 10, color: palette.ink, fontWeight: '600', textAlign: 'center' },
  indicator: { position: 'absolute', bottom: -3, width: 32, height: 4, borderRadius: 2, backgroundColor: palette.yellow },
  decorations: { marginTop: 'auto', height: 35, overflow: 'hidden', pointerEvents: 'none' },
  yellow: { position: 'absolute', width: 130, height: 120, left: -20, top: 0, borderRadius: 50, backgroundColor: '#FFDF57' },
  pink: { position: 'absolute', width: 80, height: 95, right: -12, top: 4, borderRadius: 38, backgroundColor: '#F78AB8' },
  blue: { position: 'absolute', width: 65, height: 65, right: 33, top: 15, borderRadius: 26, backgroundColor: '#82D4EE' },
});
