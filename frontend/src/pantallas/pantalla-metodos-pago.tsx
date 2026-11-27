import { Text, View } from 'react-native';
import { HomeIcon } from '@/components/compartidos/iconos-papeleria';
import { AccountGate } from '@/components/compra/marco-cuenta';
import { PurchaseButton, PurchaseFrame, purchaseStyles as ui } from '@/components/compra/marco-compra';

export default function PaymentMethodsScreen() {
  return <PurchaseFrame title="Métodos de pago" active="profile" back="/perfil"><AccountGate>
    <Text style={ui.text}>Todavía no hay métodos de pago guardados.</Text>
    {['Tarjeta de crédito o débito', 'PayPal', 'Pago en tienda'].map(method => <View key={method} style={[ui.card, ui.row]}>
      <HomeIcon name="card" color="#257BB1" /><View style={{ flex: 1, gap: 5 }}><Text style={ui.bold}>{method}</Text><Text style={ui.text}>Integración pendiente</Text></View>
    </View>)}
    <Text style={ui.note}>Los pagos electrónicos aún no están habilitados. Podrás agregar un método cuando exista una integración segura de pagos.</Text>
    <PurchaseButton title="Agregar método de pago" disabled />
  </AccountGate></PurchaseFrame>;
}
