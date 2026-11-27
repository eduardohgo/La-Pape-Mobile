const assert = require('node:assert/strict');
const { Buffer } = require('node:buffer');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { cwd } = require('node:process');
const vm = require('node:vm');
const test = require('node:test');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const { cartItemCount } = require('../.test-build/features/compra-local/accion-agregar.js');

const prefix = 'data:image/svg+xml;base64,';
const names = ['search', 'cart', 'heart', 'user', 'home', 'grid', 'arrow', 'close', 'back', 'filter',
  'mail', 'lock', 'eye', 'eye-off', 'check', 'pin', 'bag', 'card', 'settings'];
const colors = ['#252334', '#EDB800', '#F92D81', '#726D7D', '#FFFFFF'];

function load(relativeFile, mocks) {
  const file = join(cwd(), 'src', relativeFile);
  const module = { exports: {} };
  const source = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file,
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX },
  }).outputText + (relativeFile.endsWith('iconos-papeleria.tsx') ? '\nexports.testEncode = svgDataUri;' : '');
  function localRequire(name) {
    if (Object.hasOwn(mocks, name)) return mocks[name];
    if (name === 'react') return React;
    if (name === 'react/jsx-runtime') return require('react/jsx-runtime');
    throw Error('Unmocked icon dependency: ' + name);
  }
  // No Buffer, btoa, fonts, network or device APIs are supplied to the icon code.
  vm.runInNewContext(source, { require: localRequire, module, exports: module.exports }, { filename: file });
  return module.exports;
}
const ImageDouble = () => null;
const icons = load('components/compartidos/iconos-papeleria.tsx', { 'expo-image': { Image: ImageDouble } });
function svgFrom(image) {
  assert.equal(image.type, ImageDouble);
  assert.ok(image.props.source.uri.startsWith(prefix));
  const encoded = image.props.source.uri.slice(prefix.length);
  assert.match(encoded, /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/);
  const svg = Buffer.from(encoded, 'base64').toString('utf8');
  assert.equal(encoded, Buffer.from(svg, 'utf8').toString('base64'));
  return svg;
}

test('all 19 original icons emit Android-compatible Base64 SVGs with their requested size and palette', () => {
  for (const name of names) for (const color of colors) for (const filled of [false, true]) {
    const image = icons.HomeIcon({ name, color, filled, size: 25 });
    const svg = svgFrom(image);
    assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 24 24"/);
    assert.match(svg, /<(?:path|circle|rect)\b/);
    assert.match(svg, /<\/svg>$/);
    assert.ok(svg.includes('fill="' + (filled ? color : 'none') + '"'));
    assert.ok(svg.includes('stroke="' + color + '"'));
    assert.ok(svg.includes('stroke-width="1.7"'));
    assert.doesNotMatch(svg, /undefined|\uFFFD|<text|font-family/);
    assert.equal(image.props.style.width, 25);
    assert.equal(image.props.style.height, 25);
    assert.equal(image.props.accessible, false);
  }
});

test('the UTF-8 encoder matches the Node oracle for every padding case without relying on browser or Node globals', () => {
  for (const input of ['', 'a', 'ab', 'abc', 'abcd', 'abcde', 'La Pape', 'ñ', '🎨', '漢字',
    '\u0000\u00FF', '<svg fill="#F92D81"><path d="M0 0h24v24H0Z"/></svg>']) {
    assert.equal(icons.testEncode(input), prefix + Buffer.from(input, 'utf8').toString('base64'));
  }
});

test('cart geometry and active/inactive heart colors remain the approved original vectors', () => {
  const cart = svgFrom(icons.HomeIcon({ name: 'cart' }));
  assert.ok(cart.includes('<path d="M2 3h3l2.2 12h12l2.1-9H6"/>'));
  assert.ok(cart.includes('<circle cx="9" cy="20" r="1"/>'));
  assert.equal(icons.HomeIcon({ name: 'cart' }).props.style.width, 24);
  const inactive = svgFrom(icons.HomeIcon({ name: 'heart', color: '#726D7D' }));
  const active = svgFrom(icons.HomeIcon({ name: 'heart', color: '#F92D81', filled: true }));
  assert.ok(inactive.includes('fill="none" stroke="#726D7D"'));
  assert.ok(active.includes('fill="#F92D81" stroke="#F92D81"'));
});

test('the former percent-encoded SVG cannot be decoded as SVG by Android data-URL semantics', () => {
  const svg = svgFrom(icons.HomeIcon({ name: 'search' }));
  const legacy = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
  // Base64DataFetcher decodes everything after the comma as Base64.
  const legacyBytes = Buffer.from(legacy.slice(legacy.indexOf(',') + 1), 'base64');
  assert.notEqual(legacyBytes.toString('utf8'), svg);
  assert.ok(!legacyBytes.toString('utf8').startsWith('<svg'));
});

// Real React SSR with native/animation doubles; does not mount native views or run effects.
test('cart badge retains zero, singular, accumulated, 99+ and in-flight counts next to a valid SVG', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  for (const fixture of [
    { quantity: 0, count: 0, badge: null },
    { quantity: 1, count: 1, badge: '1' },
    { quantity: 3, count: 3, badge: '3' },
    { quantity: 105, count: 105, badge: '99+' },
    { quantity: 5, count: 2, badge: '2', flight: { displayCount: 2, reduced: true } },
  ]) {
    let captured;
    function ViewDouble(props) {
      return React.createElement('div', { 'aria-label': props.accessibilityLabel }, props.children);
    }
    function TextDouble({ children }) { return React.createElement('span', null, children); }
    function ImageProbe(props) { captured = props; return null; }
    const actualIcons = load('components/compartidos/iconos-papeleria.tsx', { 'expo-image': { Image: ImageProbe } });
    const mocks = {
      'expo-router': { router: {}, useFocusEffect() {} },
      'react-native': { View: ViewDouble, Text: TextDouble, StyleSheet: { create: value => value } },
      'react-native-reanimated': {
        __esModule: true,
        default: { View: ViewDouble },
        useSharedValue: value => ({ get: () => value, set() {} }),
        useAnimatedStyle: compute => compute(),
      },
      '../compartidos/iconos-papeleria': actualIcons,
      '@/features/compra-local/proveedor-carrito': { useCart: () => ({
        value: fixture.quantity ? [{ id, quantity: fixture.quantity }] : [],
      }) },
      '@/features/compra-local/accion-agregar': { cartItemCount },
      './vuelo-carrito': { useCartFlight: () => fixture.flight, useMotionPreference: () => true },
    };
    const { CartCounterIcon } = load('components/compra/carrito-animado.tsx', mocks);
    const html = renderToStaticMarkup(React.createElement(CartCounterIcon, { color: '#EDB800' }));
    assert.ok(html.includes('Carrito, ' + fixture.count + (fixture.count === 1 ? ' artículo' : ' artículos')));
    if (fixture.badge === null) assert.doesNotMatch(html, /<span>/);
    else assert.ok(html.includes('<span>' + fixture.badge + '</span>'));
    assert.ok(captured.source.uri.startsWith(prefix));
    assert.ok(Buffer.from(captured.source.uri.slice(prefix.length), 'base64').toString('utf8').includes('stroke="#EDB800"'));
  }
});
