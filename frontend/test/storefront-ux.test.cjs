const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { cwd } = require('node:process');
const test = require('node:test');

const files = [
  'src/pantallas/pantalla-inicio.tsx',
  'src/pantallas/pantalla-catalogo.tsx',
  'src/pantallas/pantalla-detalle-producto.tsx',
  'src/components/catalogo/componentes-catalogo.tsx',
];

const content = Object.fromEntries(files.map((file) => [
  file,
  readFileSync(join(cwd(), file), 'utf8'),
]));

test('all storefront screens exclude provisional-price and photo-review labels', () => {
  for (const [file, source] of Object.entries(content)) {
    for (const label of [
      /PRECIO DEMO|PRECIO DE DEMOSTRACIÓN|ARTÍCULO DE DEMOSTRACIÓN|DEMO · SIN VENTAS/i,
      /Ilustración · foto pendiente|Fotografía pendiente/i,
      /Comprobar API|comprobación de API|API disponible/i,
    ]) {
      assert.doesNotMatch(source, label, file);
    }
  }
});

test('internal demo protections and real product lookup stay in place', () => {
  const home = content['src/pantallas/pantalla-inicio.tsx'];
  const catalog = content['src/pantallas/pantalla-catalogo.tsx'];
  const detail = content['src/pantallas/pantalla-detalle-producto.tsx'];
  const service = readFileSync(join(cwd(), 'src/services/servicio-catalogo.ts'), 'utf8');

  assert.match(home, /useHomeProducts\(\)/);
  assert.match(catalog, /__DEV__ && process\.env\.EXPO_PUBLIC_CATALOG_MODE === 'demo'/);
  assert.match(detail, /__DEV__ && process\.env\.EXPO_PUBLIC_CATALOG_MODE === 'demo'/);
  assert.match(catalog, /service\.demoProducts/);
  assert.match(detail, /service\.demoProduct\(id,/);
  assert.match(service, /item\.is_demo === true && item\.is_for_sale === false/);
});

test('product cards navigate to actual details without purchase actions', () => {
  const catalog = content['src/pantallas/pantalla-catalogo.tsx'];
  const detail = content['src/pantallas/pantalla-detalle-producto.tsx'];

  assert.match(catalog, /Ver detalle/);
  assert.match(catalog, /router\.push\(\{ pathname: '\/products\/\[id\]'/);
  assert.doesNotMatch(catalog, /Agregar · próximamente|Agregar al carrito/);
  assert.doesNotMatch(detail, /Agregar al carrito|Comprar ahora|Selección no disponible/);
  assert.match(detail, /service\.demoProduct\(id,/);
});
