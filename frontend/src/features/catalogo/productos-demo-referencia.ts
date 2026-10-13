/**
 * Solo para la vista previa local de Expo Go.
 * No son filas de Neon, datos comerciales verificados ni inventario.
 * No utilizar para compras, disponibilidad, ni solicitudes POST.
 */
export type DemoCategory = 'Cuadernos' | 'Arte' | 'Oficina';

export type DemoProduct = Readonly<{
  sku: string;
  name: string;
  category: DemoCategory;
  price: string;
  imageUrl: null;
}>;

export const DEMO_PRODUCTS: readonly DemoProduct[] = [
  { sku: 'LAP-CUA-001', name: 'Cuaderno profesional cuadriculado', category: 'Cuadernos', price: '89.90', imageUrl: null },
  { sku: 'LAP-MAR-005', name: 'Marcadores permanentes 5 piezas', category: 'Arte', price: '75.00', imageUrl: null },
  { sku: 'LAP-HOJ-020', name: 'Paquete hojas blancas carta 500', category: 'Oficina', price: '129.00', imageUrl: null },
  { sku: 'LAP-PEG-015', name: 'Pegamento escolar 125 g', category: 'Arte', price: '24.90', imageUrl: null },
  { sku: 'LAP-PLU-010', name: 'Plumas gel azules 10 piezas', category: 'Oficina', price: '68.50', imageUrl: null },
  { sku: 'LAP-COL-011', name: 'Colores de madera 24 piezas', category: 'Arte', price: '94.00', imageUrl: null },
  { sku: 'LAP-CAR-030', name: 'Cartulina iris surtida', category: 'Arte', price: '18.50', imageUrl: null },
  { sku: 'LAP-ENG-040', name: 'Engrapadora metálica mediana', category: 'Oficina', price: '119.00', imageUrl: null },
  { sku: 'LAP-FOM-050', name: 'Foami carta colores surtidos', category: 'Arte', price: '42.50', imageUrl: null },
  { sku: 'LAP-TIN-060', name: 'Tinta para sellos azul 30 ml', category: 'Oficina', price: '54.00', imageUrl: null },
];
