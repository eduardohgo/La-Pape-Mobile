import { StyleSheet, Text, View } from 'react-native';

export default function HomeScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>La Pape Móvil</Text>
      <Text style={styles.text}>
        Entorno de desarrollo configurado correctamente
      </Text>
      <Text style={styles.text}>
        React Native + Expo
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  text: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 8,
  },
});