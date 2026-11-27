import { Alert, Pressable, type StyleProp, type ViewStyle } from 'react-native';
import { HomeIcon } from '../compartidos/iconos-papeleria';
import { useFavorites } from '@/features/compra-local/proveedor-favoritos';

export function FavoriteButton({ id, name, style }: { id: string; name: string; style?: StyleProp<ViewStyle> }) {
  const favorites = useFavorites();
  const selected = favorites.value.includes(id);
  return <Pressable style={[{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }, style]}
    accessibilityRole="button" accessibilityLabel={`${selected ? 'Quitar de' : 'Agregar a'} favoritos ${name}`}
    accessibilityState={{ selected, disabled: favorites.status !== 'ready' || favorites.saving }}
    disabled={favorites.status !== 'ready' || favorites.saving}
    onPress={() => { void favorites.toggle(id).then(ok => { if (!ok) Alert.alert('Favoritos', 'No pudimos guardar el cambio en este dispositivo.'); }); }}>
    <HomeIcon name="heart" size={22} color={selected ? '#F92D81' : '#726D7D'} filled={selected} />
  </Pressable>;
}
