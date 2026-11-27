import { Text, TextInput, View } from 'react-native';
import { addressFields, type AddressInput, type AddressField } from '@/features/compra-local/checkout';
import { purchaseStyles as ui } from './marco-compra';

export function AddressForm({ value, onChange, errors, showLabel = false }: {
  value: AddressInput; onChange: (value: AddressInput) => void; errors: Partial<Record<AddressField, string>>; showLabel?: boolean;
}) {
  return <View style={{ gap: 12 }}>
    {showLabel && <View style={{ gap: 5 }}><Text style={ui.bold}>Nombre de la dirección</Text>
      <TextInput accessibilityLabel="Nombre de la dirección" style={ui.field} maxLength={32} value={value.label}
        placeholder="Casa, trabajo…" onChangeText={label => onChange({ ...value, label })} />
      {errors.label && <Text style={ui.error}>{errors.label}</Text>}
    </View>}
    {addressFields.map(field => <View key={field.key} style={{ gap: 5 }}>
      <Text style={ui.bold}>{field.label}</Text>
      <TextInput accessibilityLabel={field.label} value={value[field.key]} maxLength={field.max}
        keyboardType={field.numeric ? 'number-pad' : 'default'} style={ui.field} placeholder={field.label}
        onChangeText={text => onChange({ ...value, [field.key]: text })} />
      {errors[field.key] && <Text accessibilityRole="alert" style={ui.error}>{errors[field.key]}</Text>}
    </View>)}
  </View>;
}
