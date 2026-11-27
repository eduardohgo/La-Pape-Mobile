import { router } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { HomeIcon } from '@/components/compartidos/iconos-papeleria';

export function AuthUnavailableNotice() {
  return <View style={styles.notice}>
    <View style={styles.icon} accessible={false}><HomeIcon name="user" color="#2379B6" size={32} /></View>
    <Text accessibilityRole="header" style={styles.title}>Tu cuenta en La Pape</Text>
    <Text style={styles.message}>El acceso a cuentas todavía no está disponible en esta versión de prueba</Text>
    <Text style={styles.detail}>Puedes explorar el catálogo y guardar tu carrito y favoritos en este dispositivo.</Text>
    <Pressable accessibilityRole="button" onPress={() => router.dismissTo('/explore')}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
      <Text style={styles.buttonText}>Explorar catálogo</Text><HomeIcon name="arrow" size={19} color="#FFFFFF" />
    </Pressable>
  </View>;
}

const styles = StyleSheet.create({
  notice: { padding: 22, gap: 17, alignItems: 'center' },
  icon: { backgroundColor: '#DDF5FF', padding: 17, borderRadius: 40 },
  title: { color: '#15142D', fontSize: 25, fontWeight: '900', textAlign: 'center' },
  message: { color: '#505568', fontSize: 16, lineHeight: 23, textAlign: 'center' },
  detail: { color: '#626878', fontSize: 14, lineHeight: 21, textAlign: 'center' },
  button: { alignSelf: 'stretch', minHeight: 50, padding: 14, borderRadius: 25, backgroundColor: '#E32670', flexDirection: 'row', gap: 9, alignItems: 'center', justifyContent: 'center' },
  buttonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '800', flexShrink: 1, textAlign: 'center' },
  pressed: { opacity: 0.7 },
});
