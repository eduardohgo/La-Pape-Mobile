import { router } from 'expo-router';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { ProductVisual, ShopStatus } from '@/components/catalogo/componentes-catalogo';
import { FavoriteButton } from '@/components/compra/boton-favorito';
import { PurchaseButton, PurchaseFrame, purchaseStyles as ui } from '@/components/compra/marco-compra';
import { useFavorites } from '@/features/compra-local/proveedor-favoritos';
import { useCommercialProducts } from '@/features/compra-local/use-productos-comerciales';

function FavoriteProducts() {
  const favorites = useFavorites();
  const products = useCommercialProducts();
  if (products.status === 'loading') return <ShopStatus title="Buscando tus favoritos…" loading />;
  if (products.status === 'error') return <ShopStatus title="No pudimos consultar el catálogo" message="Tus favoritos guardados se conservan." onRetry={products.retry} />;
  const byId = new Map(products.products.map(product => [product.id, product]));
  return <View style={styles.grid}>{favorites.value.map(id => {
    const product = byId.get(id);
    return product ? <View key={id} style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Ver ${product.name}`}
        onPress={() => router.push({ pathname: '/products/[id]', params: { id } })}>
        <ProductVisual product={product} />
        <View style={{ padding: 11, gap: 7 }}><Text style={ui.bold}>{product.name}</Text><Text style={ui.bold}>${product.price} MXN</Text></View>
      </Pressable>
      <FavoriteButton id={id} name={product.name} style={styles.heart} />
    </View> : <View key={id} style={[ui.card, { width: '100%' }]}>
      <Text style={ui.text}>Un favorito ya no aparece en el catálogo público.</Text><PurchaseButton title="Quitar de favoritos" onPress={() => void favorites.toggle(id)} />
    </View>;
  })}</View>;
}
export default function FavoritesScreen() {
  const favorites = useFavorites();
  return <PurchaseFrame title="Favoritos" active="favorites"><Text style={ui.text}>Tus productos favoritos siempre a la mano. Guardados en este dispositivo.</Text>
    {favorites.status === 'loading' ? <ShopStatus title="Recuperando favoritos…" loading />
      : favorites.status === 'error' ? <><ShopStatus title="No pudimos abrir tus favoritos" onRetry={favorites.retry} />
        <PurchaseButton title="Restablecer favoritos locales" onPress={() => Alert.alert('Borrar favoritos', 'Se borrará la lista de este dispositivo.', [
          { text: 'Cancelar', style: 'cancel' }, { text: 'Borrar', style: 'destructive', onPress: () => void favorites.clear() },
        ])} /></>
      : !favorites.value.length ? <><ShopStatus title="Todavía no tienes favoritos" message="Toca el corazón de un producto para guardarlo aquí." />
        <PurchaseButton title="Explorar catálogo" onPress={() => router.navigate('/explore')} /></>
      : <FavoriteProducts />}
    {favorites.error && <Text accessibilityRole="alert" style={ui.error}>{favorites.error}</Text>}
  </PurchaseFrame>;
}
const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  card: { width: '47%', flexGrow: 1, flexBasis: '45%', backgroundColor: '#FFFFFF', borderRadius: 17, borderWidth: 1, borderColor: '#EEEAF0', overflow: 'hidden' },
  heart: { position: 'absolute', right: 1, top: 1, backgroundColor: '#FFFFFF', borderRadius: 22 },
});
