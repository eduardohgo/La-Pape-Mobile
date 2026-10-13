import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeIcon } from '@/components/home/home-icon';
import { StationeryArt, productIllustration } from '@/components/home/stationery-art';

export const palette = { ink: '#252334', muted: '#726D7D', yellow: '#FFDC57', pink: '#EF4C8B', blue: '#2379B6' };

export function ShopHeader({ left, right, children }: { left?: ReactNode; right?: ReactNode; children?: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
      <View style={styles.decorations}>
        <View style={styles.pinkShape} /><View style={styles.yellowShape} /><View style={styles.glow} />
      </View>
      <View style={styles.headerInner}>
        <View style={styles.identityRow}>
          <View style={styles.headerSide}>{left}</View>
          <View accessible accessibilityLabel="La Pape, y algo más" style={styles.identity}>
            <View style={styles.brandMark}><Text style={styles.markLetter}>P</Text><View style={styles.pencil} /></View>
            <Text style={styles.wordmark}><Text style={styles.pinkLetters}>La</Text><Text style={styles.blueLetters}>Pa</Text><Text style={styles.greenLetters}>pe</Text></Text>
            <Text style={styles.tagline}>y algo más…</Text>
          </View>
          <View style={styles.headerSide}>{right}</View>
        </View>
        {children}
      </View>
    </View>
  );
}

export function ProductVisual({ product, large = false }: {
  product: { name: string; category_name: string; image_url: string | null }; large?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const realPhoto = product.image_url && product.image_url !== failedUrl ? product.image_url : null;
  return (
    <View style={[styles.photo, large && styles.photoLarge]}>
      {large && <View style={[styles.decorations, styles.photoDecorations]}><View style={styles.photoBlueShape} /><View style={styles.photoPinkShape} /></View>}
      {realPhoto ? (
        <Image source={{ uri: realPhoto }} style={[styles.realPhoto, large && styles.realPhotoLarge]} contentFit="contain" accessibilityLabel={`Fotografía de ${product.name}`} onError={() => setFailedUrl(realPhoto)} />
      ) : (
        <>
          <StationeryArt kind={productIllustration(product.name, product.category_name)} width={large ? 200 : 102} height={large ? 212 : 105} />
        </>
      )}
    </View>
  );
}

export function ShopStatus({ title, message, loading = false, onRetry, retryLabel = 'Volver a intentar' }: {
  title: string; message?: string; loading?: boolean; onRetry?: () => void; retryLabel?: string;
}) {
  return (
    <View style={styles.status} accessibilityLiveRegion="polite">
      {loading ? <ActivityIndicator color={palette.pink} size="large" /> : <StationeryArt kind="paper" width={75} height={72} />}
      <Text style={styles.statusTitle}>{title}</Text>
      {message && <Text style={styles.statusMessage}>{message}</Text>}
      {onRetry && <Pressable onPress={onRetry} accessibilityRole="button" style={styles.action}><Text style={styles.actionText}>{retryLabel}</Text></Pressable>}
    </View>
  );
}

export function ShopModal({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: ReactNode }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.modalCard} accessibilityViewIsModal>
          <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button" accessibilityLabel="Cerrar aviso"><HomeIcon name="close" /></Pressable>
          {children}
        </View>
      </View>
    </Modal>
  );
}

export function PendingFeatureModal({ feature, onClose }: { feature: string | null; onClose: () => void }) {
  return (
    <ShopModal visible={feature !== null} onClose={onClose}>
      <Text style={styles.eyebrow}>LA PAPE</Text>
      <Text accessibilityRole="header" style={styles.modalTitle}>{feature}</Text>
      <Text style={styles.modalMessage}>Descubre más artículos e ideas para crear en nuestro catálogo.</Text>
      <Pressable onPress={onClose} accessibilityRole="button" style={styles.action}><Text style={styles.actionText}>Seguir explorando</Text></Pressable>
    </ShopModal>
  );
}

export function CatalogTabBar({ onPending, onCatalog }: { onPending: (feature: string) => void; onCatalog: () => void }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      <View style={styles.barInner}>
        <Pressable onPress={() => router.navigate('/')} style={styles.navItem} accessibilityRole="button" accessibilityLabel="Ir a Inicio"><HomeIcon name="home" color={palette.muted} /><Text style={styles.navLabel}>Inicio</Text></Pressable>
        <Pressable onPress={onCatalog} style={styles.navItem} accessibilityRole="button" accessibilityLabel="Catálogo, seleccionado" accessibilityState={{ selected: true }}><HomeIcon name="grid" color="#EDB800" filled /><Text style={styles.navActive}>Categorías</Text><View style={styles.indicator} /></Pressable>
        <Pressable onPress={() => onPending('Carrito')} style={styles.navItem} accessibilityRole="button" accessibilityLabel="Carrito: próximamente"><HomeIcon name="cart" color={palette.muted} /><Text style={styles.navLabel}>Carrito</Text></Pressable>
        <Pressable onPress={() => onPending('Favoritos')} style={styles.navItem} accessibilityRole="button" accessibilityLabel="Favoritos: próximamente"><HomeIcon name="heart" color={palette.muted} /><Text style={styles.navLabel}>Favoritos</Text></Pressable>
        <Pressable onPress={() => onPending('Acceder')} style={styles.navItem} accessibilityRole="button" accessibilityLabel="Acceder"><HomeIcon name="user" color={palette.muted} /><Text style={styles.navLabel}>Acceder</Text></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { backgroundColor: palette.yellow, paddingBottom: 18 },
  decorations: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, overflow: 'hidden', pointerEvents: 'none' },
  pinkShape: { position: 'absolute', width: 175, height: 170, right: -40, bottom: -78, backgroundColor: '#FA83B2', borderRadius: 70, transform: [{ rotate: '-28deg' }] },
  yellowShape: { position: 'absolute', width: 70, height: 90, left: -20, top: 80, backgroundColor: '#FFCA43', borderRadius: 28, transform: [{ rotate: '28deg' }] },
  glow: { position: 'absolute', width: 180, height: 135, top: 26, alignSelf: 'center', backgroundColor: '#FFE67F', borderRadius: 65, transform: [{ rotate: '-10deg' }] },
  headerInner: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 18 },
  identityRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
  headerSide: { width: 46, alignItems: 'center' },
  identity: { alignItems: 'center' },
  brandMark: { width: 40, height: 30, marginBottom: -2 },
  markLetter: { fontSize: 39, lineHeight: 42, fontWeight: '900', color: palette.pink, transform: [{ rotate: '16deg' }] },
  pencil: { position: 'absolute', width: 32, height: 7, borderRadius: 4, backgroundColor: '#36AFC7', bottom: -2, left: 9, transform: [{ rotate: '-16deg' }] },
  wordmark: { fontSize: 33, fontWeight: '900', letterSpacing: -1.2 },
  pinkLetters: { color: palette.pink }, blueLetters: { color: '#268CB9' }, greenLetters: { color: '#64B590' },
  tagline: { color: palette.ink, fontSize: 12, fontWeight: '800', marginTop: -2 },
  photo: { minHeight: 140, paddingTop: 16, paddingBottom: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFF9E9', borderRadius: 14, gap: 4 },
  photoLarge: { minHeight: 270, paddingTop: 20, paddingBottom: 18, borderRadius: 24, backgroundColor: '#FFE885' },
  photoDecorations: { borderRadius: 24 },
  photoBlueShape: { position: 'absolute', width: 140, height: 140, top: -36, right: -45, borderRadius: 48, backgroundColor: '#7CD3EC', transform: [{ rotate: '24deg' }] },
  photoPinkShape: { position: 'absolute', width: 110, height: 100, bottom: -40, left: -35, borderRadius: 38, backgroundColor: '#F889B4', transform: [{ rotate: '-25deg' }] },
  realPhoto: { width: '100%', height: 109 }, realPhotoLarge: { height: 240 },
  status: { padding: 24, borderRadius: 22, backgroundColor: '#FFF8E9', alignItems: 'center', gap: 13, marginTop: 16 },
  statusTitle: { color: palette.ink, fontWeight: '800', fontSize: 18, textAlign: 'center' },
  statusMessage: { color: palette.muted, fontSize: 13, lineHeight: 21, textAlign: 'center' },
  action: { minHeight: 44, backgroundColor: '#BC2862', borderRadius: 24, paddingHorizontal: 20, paddingVertical: 13, alignItems: 'center', justifyContent: 'center' },
  actionText: { fontSize: 13, fontWeight: '800', color: '#FFFFFF' },
  backdrop: { flex: 1, backgroundColor: 'rgba(37,35,52,0.35)', alignItems: 'center', justifyContent: 'center', padding: 20 },
  modalCard: { width: '100%', maxWidth: 380, backgroundColor: '#FFFFFF', padding: 24, borderRadius: 26, alignItems: 'center' },
  closeButton: { alignSelf: 'flex-end', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -10, marginRight: -10 },
  eyebrow: { color: '#A51D53', fontWeight: '900', fontSize: 10, letterSpacing: 1.5 },
  modalTitle: { fontSize: 25, fontWeight: '900', color: palette.ink, marginTop: 8, textAlign: 'center' },
  modalMessage: { fontSize: 14, lineHeight: 22, color: palette.muted, textAlign: 'center', marginTop: 12, marginBottom: 22 },
  bottomBar: { backgroundColor: '#FFFFFF', borderTopWidth: 1, borderTopColor: '#F1EEF3', paddingTop: 8, boxShadow: '0 -4px 16px rgba(45,33,57,0.04)' },
  barInner: { width: '100%', maxWidth: 620, alignSelf: 'center', flexDirection: 'row', paddingHorizontal: 8 },
  navItem: { flex: 1, minHeight: 57, alignItems: 'center', gap: 5, paddingTop: 2 },
  navLabel: { fontSize: 10, color: palette.muted, fontWeight: '500', textAlign: 'center' },
  navActive: { fontSize: 10, color: palette.ink, fontWeight: '800' },
  indicator: { width: 36, height: 4, borderRadius: 4, backgroundColor: '#F5C400' },
});
