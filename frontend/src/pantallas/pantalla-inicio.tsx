import { Image } from 'expo-image';
import { router, usePathname } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { HomeIcon } from '@/components/compartidos/iconos-papeleria';
import { StationeryArt, productIllustration, type StationeryKind } from '@/components/compartidos/ilustraciones-papeleria';
import { useHomeProducts, type HomeProduct } from '@/hooks/use-productos-inicio';

const palette = { ink: '#252334', muted: '#726D7D', yellow: '#FFDC57', pink: '#EF4C8B', blue: '#2379B6' };
const categories: { name: string; art: StationeryKind; background: string }[] = [
  { name: 'Cuadernos', art: 'notebook', background: '#FDEBF2' },
  { name: 'Marcadores', art: 'markers', background: '#E3F5FC' },
  { name: 'Lápices', art: 'pencils', background: '#FFF7D9' },
  { name: 'Tijeras', art: 'scissors', background: '#F0EBFC' },
  { name: 'Pegamento', art: 'glue', background: '#EAF6E4' },
];

function openCatalog() { router.navigate('/explore'); }

function FeaturedProduct({ product, onFavorite }: { product: HomeProduct; onFavorite: () => void }) {
  const [photoFailed, setPhotoFailed] = useState(false);
  const hasPhoto = product.image_url !== null && !photoFailed;
  return (
    <View style={styles.productCard}>
      <Pressable
        style={({ pressed }) => [styles.productLink, pressed && styles.pressed]}
        accessibilityRole="button"
        accessibilityLabel={`${product.name}, ${product.price} pesos mexicanos.`}
        accessibilityHint="Abrir información del producto."
        onPress={() => router.push({ pathname: '/products/[id]', params: { id: product.id } })}>
        <View style={styles.productArt}>
          {hasPhoto ? (
            <Image source={{ uri: product.image_url! }} contentFit="contain" style={styles.productPhoto} onError={() => setPhotoFailed(true)} accessible={false} />
          ) : (
            <StationeryArt kind={productIllustration(product.name, product.category_name)} width={94} height={100} />
          )}
        </View>
        <Text style={styles.productName} numberOfLines={3}>{product.name}</Text>
        <Text style={styles.productPrice}>${product.price} <Text style={styles.currency}>MXN</Text></Text>
      </Pressable>
      <Pressable style={styles.favoriteButton} onPress={onFavorite} accessibilityRole="button" accessibilityLabel={`Favoritos de ${product.name}: próximamente`}>
        <HomeIcon name="heart" size={19} color={palette.muted} />
      </Pressable>
    </View>
  );
}

function SectionHeading({ title, link }: { title: string; link: string }) {
  return (
    <View style={styles.sectionHeader}>
      <Text accessibilityRole="header" style={styles.sectionTitle}>{title}</Text>
      <Pressable onPress={openCatalog} style={styles.sectionLink} accessibilityRole="button" accessibilityLabel={`${link}: abrir catálogo completo`}>
        <Text style={styles.sectionLinkText}>{link}</Text>
        <HomeIcon name="arrow" size={16} color={palette.blue} />
      </Pressable>
    </View>
  );
}

export default function HomeScreen() {
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const { width, fontScale } = useWindowDimensions();
  const compact = width < 360 || fontScale > 1.25;
  const scroll = useRef<ScrollView>(null);
  const { state, retry } = useHomeProducts();
  const [placeholder, setPlaceholder] = useState<string | null>(null);

  return (
    <View style={styles.screen}>
      {pathname === '/' && <StatusBar style="dark" />}
      <ScrollView ref={scroll} style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={[styles.header, { paddingTop: insets.top + 16 }]}>
          <View style={styles.decorationLayer}>
            <View style={styles.headerPinkShape} />
            <View style={styles.headerBlueShape} />
            <View style={styles.headerGlow} />
          </View>
          <View style={styles.headerInner}>
            <View style={styles.brandRow}>
              <View style={styles.brandSpacer} />
              <View accessible accessibilityLabel="La Pape, y algo más" style={styles.identity}>
                <View style={styles.brandMark}><Text style={styles.brandMarkText}>P</Text><View style={styles.pencilStroke} /></View>
                <Text style={styles.wordmark}><Text style={styles.wordmarkPink}>La</Text><Text style={styles.wordmarkBlue}>Pa</Text><Text style={styles.wordmarkGreen}>pe</Text></Text>
                <Text style={styles.tagline}>y algo más…</Text>
              </View>
              <Pressable style={styles.headerCart} onPress={() => setPlaceholder('Carrito')} accessibilityRole="button" accessibilityLabel="Carrito: próximamente">
                <HomeIcon name="cart" size={25} />
              </Pressable>
            </View>
            <Pressable
              style={styles.search}
              accessibilityRole="button"
              accessibilityLabel="Buscar productos, marcas o categorías"
              onPress={() => setPlaceholder('Búsqueda')}>
              <HomeIcon name="search" size={23} color={palette.muted} />
              <Text style={styles.searchText} numberOfLines={1}>Buscar productos, marcas o categorías…</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.body}>
          <View style={[styles.banner, compact && styles.bannerCompact]}>
            <View style={[styles.decorationLayer, styles.bannerDecoration]}>
              <View style={styles.bannerBlueShape} />
              <View style={styles.bannerPinkShape} />
              <View style={[styles.bannerArt, compact && styles.bannerArtCompact]}>
                <StationeryArt kind="hero" width={compact ? 165 : 200} height={220} />
              </View>
            </View>
            <View style={[styles.bannerCopy, compact && styles.bannerCopyCompact]}>
              <Text style={styles.bannerEyebrow}>DALE COLOR A TUS IDEAS</Text>
              <Text style={[styles.bannerTitle, compact && styles.bannerTitleCompact]}>Todo para{'\n'}un gran{'\n'}<Text style={styles.bannerAccent}>regreso</Text>{'\n'}a clases</Text>
              <Pressable style={({ pressed }) => [styles.bannerButton, pressed && styles.pressed]} onPress={openCatalog} accessibilityRole="button">
                <Text style={styles.bannerButtonText}>Ver productos</Text><HomeIcon name="arrow" size={18} color="#FFFFFF" />
              </Pressable>
            </View>
          </View>
          <View style={styles.bannerCaption}><View style={styles.captionLine} /><Text style={styles.captionText}>Un mundo de ideas, en un solo lugar</Text><View style={styles.captionLine} /></View>

          <SectionHeading title="Categorías" link="Ver todas" />
          <View style={styles.categoryGrid}>
            {categories.map((item) => (
              <Pressable
                key={item.name}
                style={({ pressed }) => [styles.categoryCard, { backgroundColor: item.background }, pressed && styles.pressed]}
                accessibilityRole="button"
                accessibilityLabel={item.name}
                accessibilityHint="Atajo visual. Abre el catálogo completo, donde puedes elegir una categoría."
                onPress={openCatalog}>
                <StationeryArt kind={item.art} width={76} height={72} />
                <Text style={styles.categoryName}>{item.name}</Text>
              </Pressable>
            ))}
            <Pressable style={({ pressed }) => [styles.categoryCard, styles.moreCard, pressed && styles.pressed]} accessibilityRole="button" accessibilityLabel="Ver más categorías en el catálogo" onPress={openCatalog}>
              <View style={styles.colorGrid}>
                {['#EF4C8B', '#59C5E9', '#FFA95B', '#FFDC57'].map((color) => <View key={color} style={[styles.colorTile, { backgroundColor: color }]} />)}
              </View>
              <Text style={styles.categoryName}>Ver más</Text>
            </Pressable>
          </View>

          <SectionHeading title="Productos destacados" link="Ver todos" />
          <Text style={styles.featuredSubtitle}>Descubre productos para aprender, crear e imaginar</Text>
          {state.status === 'loading' ? (
            <View style={styles.statusCard} accessibilityLiveRegion="polite"><ActivityIndicator color={palette.pink} /><Text style={styles.statusText}>Buscando ideas para ti…</Text></View>
          ) : state.status === 'error' ? (
            <View style={styles.statusCard} accessibilityLiveRegion="polite">
              <Text style={styles.statusTitle}>Tus ideas te esperan</Text>
              <Text style={styles.statusText}>No pudimos cargar los productos. Puedes volver a intentarlo o abrir el catálogo.</Text>
              <Pressable onPress={retry} style={styles.retryButton} accessibilityRole="button"><Text style={styles.retryText}>Reintentar</Text></Pressable>
            </View>
          ) : state.products.length === 0 ? (
            <View style={styles.statusCard}><StationeryArt kind="notebook" width={60} height={60} /><Text style={styles.statusTitle}>Pronto, más ideas para crear</Text><Text style={styles.statusText}>Todavía no hay productos disponibles para mostrar.</Text></View>
          ) : (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuredRow} accessibilityLabel="Productos destacados del catálogo">
              {state.products.map((product) => <FeaturedProduct key={product.id} product={product} onFavorite={() => setPlaceholder('Favoritos')} />)}
            </ScrollView>
          )}
          <View style={styles.closingNote}><Text style={styles.closingStar}>✦</Text><Text style={styles.closingText}>Para aprender, crear y volver a imaginar.</Text><Text style={styles.closingStar}>✦</Text></View>
        </View>
      </ScrollView>

      <View style={[styles.bottomBar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
        <View style={styles.bottomBarInner}>
          <Pressable accessibilityRole="button" accessibilityLabel="Inicio, seleccionado" accessibilityState={{ selected: true }} onPress={() => scroll.current?.scrollTo({ y: 0, animated: true })} style={styles.navItem}>
            <HomeIcon name="home" color="#EDB800" size={25} filled /><Text style={styles.navActiveLabel}>Inicio</Text><View style={styles.navIndicator} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Categorías: abrir catálogo" onPress={openCatalog} style={styles.navItem}>
            <HomeIcon name="grid" color={palette.muted} /><Text style={styles.navLabel}>Catálogo</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Carrito: próximamente" onPress={() => setPlaceholder('Carrito')} style={styles.navItem}>
            <HomeIcon name="cart" color={palette.muted} /><Text style={styles.navLabel}>Carrito</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Favoritos: próximamente" onPress={() => setPlaceholder('Favoritos')} style={styles.navItem}>
            <HomeIcon name="heart" color={palette.muted} /><Text style={styles.navLabel}>Favoritos</Text>
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="Acceder: próximamente" onPress={() => setPlaceholder('Acceder')} style={styles.navItem}>
            <HomeIcon name="user" color={palette.muted} /><Text style={styles.navLabel}>Acceder</Text>
          </Pressable>
        </View>
      </View>

      <Modal visible={placeholder !== null} transparent animationType="fade" onRequestClose={() => setPlaceholder(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard} accessibilityViewIsModal>
            <Pressable onPress={() => setPlaceholder(null)} style={styles.modalClose} accessibilityRole="button" accessibilityLabel="Cerrar aviso"><HomeIcon name="close" /></Pressable>
            <Text style={styles.modalEyebrow}>MUY PRONTO</Text>
            <Text accessibilityRole="header" style={styles.modalTitle}>{placeholder}</Text>
            <Text style={styles.modalText}>Conoce más artículos de papelería en nuestro catálogo.</Text>
            <Pressable style={styles.modalAction} accessibilityRole="button" onPress={() => { setPlaceholder(null); openCatalog(); }}><Text style={styles.bannerButtonText}>Explorar catálogo</Text><HomeIcon name="arrow" size={18} color="#FFFFFF" /></Pressable>
            <Pressable onPress={() => setPlaceholder(null)} style={styles.modalDismiss} accessibilityRole="button"><Text style={styles.sectionLinkText}>Seguir en Inicio</Text></Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  decorationLayer: { position: 'absolute', top: 0, right: 0, bottom: 0, left: 0, pointerEvents: 'none', overflow: 'hidden' },
  bannerDecoration: { borderRadius: 22 },
  screen: { flex: 1, backgroundColor: '#FFFFFF' },
  scroll: { flex: 1 },
  scrollContent: { paddingBottom: 12 },
  header: { backgroundColor: palette.yellow, paddingBottom: 18 },
  headerInner: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 20 },
  headerPinkShape: { position: 'absolute', right: -40, bottom: -80, width: 170, height: 180, backgroundColor: '#FA83B2', borderRadius: 70, transform: [{ rotate: '-28deg' }] },
  headerBlueShape: { position: 'absolute', left: -20, top: 80, width: 70, height: 90, backgroundColor: '#FFCA43', borderRadius: 28, transform: [{ rotate: '28deg' }] },
  headerGlow: { position: 'absolute', alignSelf: 'center', top: 26, width: 180, height: 135, borderRadius: 65, backgroundColor: '#FFE67F', transform: [{ rotate: '-10deg' }] },
  brandRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  brandSpacer: { width: 46 },
  identity: { alignItems: 'center' },
  brandMark: { width: 40, height: 30, marginBottom: -2 },
  brandMarkText: { fontSize: 39, lineHeight: 42, fontWeight: '900', color: palette.pink, transform: [{ rotate: '16deg' }] },
  pencilStroke: { position: 'absolute', width: 32, height: 7, borderRadius: 4, backgroundColor: '#36AFC7', bottom: -2, left: 9, transform: [{ rotate: '-16deg' }] },
  wordmark: { fontSize: 33, fontWeight: '900', letterSpacing: -1.2 },
  wordmarkPink: { color: palette.pink },
  wordmarkBlue: { color: '#268CB9' },
  wordmarkGreen: { color: '#64B590' },
  tagline: { color: palette.ink, fontSize: 12, fontWeight: '800', marginTop: -2 },
  headerCart: { width: 46, height: 46, backgroundColor: '#FFFFFF', borderRadius: 23, alignItems: 'center', justifyContent: 'center' },
  search: { minHeight: 50, backgroundColor: '#FFFFFF', borderRadius: 25, paddingHorizontal: 15, flexDirection: 'row', alignItems: 'center', gap: 11, boxShadow: '0 3px 10px rgba(127, 93, 17, 0.07)' },
  searchText: { flex: 1, fontSize: 12, color: '#78727F' },
  body: { width: '100%', maxWidth: 620, alignSelf: 'center', paddingHorizontal: 18, paddingTop: 16 },
  banner: { backgroundColor: '#FFE26B', borderRadius: 22, minHeight: 244, justifyContent: 'center', padding: 18 },
  bannerCompact: { minHeight: 244, padding: 14 },
  bannerCopy: { width: '57%', zIndex: 1, alignItems: 'flex-start', gap: 11 },
  bannerCopyCompact: { width: '65%' },
  bannerEyebrow: { fontSize: 8, letterSpacing: 1.1, fontWeight: '900', color: '#796014' },
  bannerTitle: { fontSize: 29, lineHeight: 29, fontWeight: '900', letterSpacing: -0.8, color: palette.ink },
  bannerTitleCompact: { fontSize: 25, lineHeight: 26 },
  bannerAccent: { color: '#DB3575' },
  bannerButton: { minHeight: 44, backgroundColor: '#BC2862', borderRadius: 22, paddingHorizontal: 13, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 6 },
  bannerButtonText: { color: '#FFFFFF', fontSize: 12, fontWeight: '800' },
  bannerArt: { position: 'absolute', right: -10, bottom: 7 },
  bannerArtCompact: { right: -23, bottom: 5, opacity: 0.88 },
  bannerBlueShape: { width: 145, height: 150, borderRadius: 60, position: 'absolute', right: -55, top: -45, backgroundColor: '#78D0EC', transform: [{ rotate: '-32deg' }] },
  bannerPinkShape: { width: 70, height: 80, borderRadius: 32, position: 'absolute', right: 136, bottom: -55, backgroundColor: '#F678AC', transform: [{ rotate: '30deg' }] },
  bannerCaption: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 12, marginBottom: 20 },
  captionLine: { width: 12, height: 2, backgroundColor: '#F49CBE', borderRadius: 2 },
  captionText: { color: palette.muted, fontSize: 10, letterSpacing: 0.1, flexShrink: 1 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6, marginBottom: 9, flexWrap: 'wrap' },
  sectionTitle: { fontSize: 19, fontWeight: '900', letterSpacing: -0.5, color: palette.ink, flexShrink: 1 },
  sectionLink: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44 },
  sectionLinkText: { fontSize: 12, fontWeight: '700', color: palette.blue },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 22 },
  categoryCard: { width: '31%', flexGrow: 1, flexBasis: '30%', minHeight: 103, alignItems: 'center', justifyContent: 'center', paddingVertical: 8, paddingHorizontal: 4, borderRadius: 14, gap: 1 },
  categoryName: { fontSize: 12, fontWeight: '600', color: palette.ink, textAlign: 'center' },
  moreCard: { backgroundColor: '#FDEBF2' },
  colorGrid: { width: 51, height: 58, flexDirection: 'row', flexWrap: 'wrap', gap: 5, paddingTop: 7, marginBottom: 14 },
  colorTile: { width: 22, height: 22, borderRadius: 6 },
  featuredSubtitle: { color: palette.muted, fontSize: 10, lineHeight: 16, marginBottom: 12 },
  featuredRow: { gap: 10, paddingBottom: 8, paddingRight: 4 },
  productCard: { width: 151, borderWidth: 1, borderColor: '#F0EDF2', borderRadius: 17, backgroundColor: '#FFFFFF', boxShadow: '0 3px 9px rgba(45, 33, 57, 0.035)' },
  productLink: { padding: 10, paddingTop: 15, flex: 1 },
  productArt: { height: 105, alignItems: 'center', justifyContent: 'center', marginBottom: 5 },
  productPhoto: { width: '100%', height: '100%' },
  productName: { fontSize: 12, fontWeight: '600', lineHeight: 16, color: palette.ink, minHeight: 48 },
  productPrice: { fontSize: 19, fontWeight: '900', color: palette.ink, marginTop: 8 },
  currency: { fontSize: 10, fontWeight: '700' },
  favoriteButton: { position: 'absolute', right: 2, top: 2, width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  statusCard: { backgroundColor: '#FFF8E9', borderRadius: 18, padding: 22, alignItems: 'center', gap: 10 },
  statusTitle: { color: palette.ink, fontSize: 15, fontWeight: '800', textAlign: 'center' },
  statusText: { color: palette.muted, fontSize: 12, lineHeight: 19, textAlign: 'center' },
  retryButton: { backgroundColor: '#FCE1ED', paddingHorizontal: 20, paddingVertical: 13, minHeight: 44, borderRadius: 20 },
  retryText: { color: '#A51D53', fontSize: 12, fontWeight: '800' },
  closingNote: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', marginTop: 22, marginBottom: 12 },
  closingStar: { color: '#D1AD38', fontSize: 13 },
  closingText: { color: '#8F8197', fontSize: 10, flexShrink: 1, textAlign: 'center' },
  bottomBar: { backgroundColor: '#FFFFFF', borderTopColor: '#F1EEF3', borderTopWidth: 1, paddingTop: 8, boxShadow: '0 -4px 16px rgba(45, 33, 57, 0.04)' },
  bottomBarInner: { width: '100%', maxWidth: 620, alignSelf: 'center', flexDirection: 'row', paddingHorizontal: 8 },
  navItem: { flex: 1, minHeight: 57, alignItems: 'center', gap: 5, paddingTop: 2 },
  navLabel: { color: palette.muted, fontSize: 10, fontWeight: '500', textAlign: 'center' },
  navActiveLabel: { color: palette.ink, fontSize: 10, fontWeight: '800' },
  navIndicator: { height: 4, width: 36, backgroundColor: '#F5C400', borderRadius: 4 },
  pressed: { opacity: 0.78 },
  modalBackdrop: { flex: 1, backgroundColor: 'rgba(37, 35, 52, 0.35)', justifyContent: 'center', alignItems: 'center', padding: 22 },
  modalCard: { width: '100%', maxWidth: 380, borderRadius: 26, backgroundColor: '#FFFFFF', padding: 26, alignItems: 'center' },
  modalClose: { alignSelf: 'flex-end', width: 44, height: 44, alignItems: 'center', justifyContent: 'center', marginTop: -10, marginRight: -12 },
  modalEyebrow: { color: '#A51D53', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  modalTitle: { color: palette.ink, fontSize: 26, fontWeight: '900', marginTop: 8 },
  modalText: { color: palette.muted, fontSize: 14, lineHeight: 22, textAlign: 'center', marginTop: 12, marginBottom: 22 },
  modalAction: { minHeight: 44, borderRadius: 24, paddingHorizontal: 22, paddingVertical: 13, backgroundColor: '#BC2862', flexDirection: 'row', gap: 8, alignItems: 'center' },
  modalDismiss: { minHeight: 44, justifyContent: 'center', marginTop: 8 },
});
