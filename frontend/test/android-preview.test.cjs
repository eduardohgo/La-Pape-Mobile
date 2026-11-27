const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join, relative, resolve } = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawnSync } = require('node:child_process');
const { cwd } = require('node:process');
const vm = require('node:vm');
const test = require('node:test');
const { ApiError } = require('../.test-build/services/http/errores-http.js');
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const ts = require('typescript');
const config = require('../.test-build/config/configuracion-api.js');
const { getCatalogService } = require('../.test-build/services/servicio-catalogo.js');

const frontend = cwd();
const catalogOrigin = 'https://la-pape-mobile-catalogo-tigre10.onrender.com';
const buildScript = join(frontend, 'scripts/check-android-build.mjs');
const check = import(pathToFileURL(buildScript).href);
const profile = (name = 'preview') => ({
  EAS_BUILD_PLATFORM: 'android', EAS_BUILD_PROFILE: name, EXPO_NO_DOTENV: '1',
  EXPO_PUBLIC_API_ENV: name === 'preview' ? 'staging' : 'production',
  EXPO_PUBLIC_CATALOG_MODE: 'commercial', EXPO_PUBLIC_CATALOG_API_URL: catalogOrigin,
});
function runtime(t, development = false, auth) {
  const values = { EXPO_PUBLIC_API_URL: auth, EXPO_PUBLIC_CATALOG_API_URL: catalogOrigin,
    EXPO_PUBLIC_API_ENV: development ? 'development' : 'staging', EXPO_PUBLIC_API_TIMEOUT_MS: undefined };
  const previous = Object.fromEntries(Object.keys(values).map(key => [key, process.env[key]]));
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__DEV__');
  Object.defineProperty(globalThis, '__DEV__', { value: development, configurable: true, writable: true });
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete process.env[key]; else process.env[key] = value;
  }
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
    if (descriptor) Object.defineProperty(globalThis, '__DEV__', descriptor); else delete globalThis.__DEV__;
  });
}

test('Android preview accepts the authorized catalog with auth absent or configured publicly', async () => {
  const { checkAndroidBuild } = await check;
  assert.match(checkAndroidBuild(profile()), /acceso a cuentas todavía no está disponible/);
  assert.match(checkAndroidBuild({ ...profile(), EXPO_PUBLIC_CATALOG_API_URL: catalogOrigin + '/' }), /catálogo público/);
  assert.equal(checkAndroidBuild({ ...profile(), EXPO_PUBLIC_API_URL: 'https://auth.lapape.mx' }), undefined);
  for (const empty of ['', ' ']) assert.throws(() =>
    checkAndroidBuild({ ...profile(), EXPO_PUBLIC_API_URL: empty }), /EXPO_PUBLIC_API_URL/);
});

test('JWT preview requires an explicit public authentication origin', async () => {
  const { checkAndroidBuild } = await check;
  assert.throws(() => checkAndroidBuild({ ...profile(), EXPO_PUBLIC_AUTH_TOKEN_FORMAT: 'jwt' }), /JWT requiere/);
  assert.throws(() => checkAndroidBuild({ ...profile(), EXPO_PUBLIC_API_URL: 'https://auth.example.com',
    EXPO_PUBLIC_AUTH_TOKEN_FORMAT: 'opaque' }), /EXPO_PUBLIC_AUTH_TOKEN_FORMAT/);
  assert.equal(checkAndroidBuild({ ...profile(), EXPO_PUBLIC_API_URL: 'https://auth.example.com',
    EXPO_PUBLIC_AUTH_TOKEN_FORMAT: 'jwt' }), undefined);
});

test('distributed Android rejects missing, foreign, private or non-canonical catalog origins', async () => {
  const { checkAndroidBuild } = await check;
  const invalid = [undefined, '', ' ', 'not-a-url', 'https://otro.onrender.com', 'http://localhost:3000',
    'http://192.168.1.99:3000', 'https://172.20.10.2:3443', 'https://localhost', 'http://' + new URL(catalogOrigin).host,
    catalogOrigin + ':3443', catalogOrigin + ':443', catalogOrigin + '/products', catalogOrigin + '/.',
    catalogOrigin + '/api/..', catalogOrigin + '/?', catalogOrigin + '?limit=5', catalogOrigin + '#',
    catalogOrigin + '#fragment', catalogOrigin.replace('https://', 'https://user:synthetic@'),
    catalogOrigin + '.malicioso.mx', catalogOrigin + '\\products'];
  for (const name of ['preview', 'production']) for (const input of invalid) {
    assert.throws(() => checkAndroidBuild({ ...profile(name), EXPO_PUBLIC_API_URL: 'https://auth.lapape.mx',
      EXPO_PUBLIC_CATALOG_API_URL: input }), /EXPO_PUBLIC_CATALOG_API_URL/);
  }
});

test('optional preview auth still rejects unsafe origins and does not echo supplied values', async () => {
  const { checkAndroidBuild } = await check;
  for (const input of ['invalid-private-value', 'http://auth.lapape.mx', 'https://localhost',
    'https://127.0.0.1', 'https://[::1]', 'https://192.168.1.137:3443', 'https://172.20.10.2:3443',
    'https://auth.local', 'https://auth.internal', 'https://auth.test', 'https://auth.lapape.mx:3443',
    'https://synthetic:private-value@auth.lapape.mx', 'https://@auth.lapape.mx',
    'https://auth.lapape.mx/auth', 'https://auth.lapape.mx/.', 'https://auth.lapape.mx?',
    'https://auth.lapape.mx#', 'https://auth.lapape.mx?private=value', 'https://-bad.lapape.mx']) {
    assert.throws(() => checkAndroidBuild({ ...profile(), EXPO_PUBLIC_API_URL: input }),
      error => /EXPO_PUBLIC_API_URL/.test(error.message) && !error.message.includes(input));
  }
});

test('production continues requiring public authentication and profile protections cannot be bypassed', async () => {
  const { checkAndroidBuild } = await check;
  for (const absent of [undefined, '', ' ']) assert.throws(() =>
    checkAndroidBuild({ ...profile('production'), EXPO_PUBLIC_API_URL: absent }), /producción/);
  assert.equal(checkAndroidBuild({ ...profile('production'), EXPO_PUBLIC_API_URL: 'https://auth.lapape.mx' }), undefined);
  for (const override of [{ EXPO_NO_DOTENV: '0' }, { EXPO_PUBLIC_API_ENV: 'development' },
    { EXPO_PUBLIC_CATALOG_MODE: 'demo' }]) assert.throws(() =>
    checkAndroidBuild({ ...profile(), ...override }), /configuración de distribución/);
  assert.equal(checkAndroidBuild({ EAS_BUILD_PLATFORM: 'ios', EAS_BUILD_PROFILE: 'preview' }), undefined);
  assert.equal(checkAndroidBuild({ EAS_BUILD_PLATFORM: 'android', EAS_BUILD_PROFILE: 'development' }), undefined);
});

test('the real pre-install command exits unsuccessfully on invalid configuration, without exposing it', () => {
  const safe = { ...process.env, ...profile() };
  delete safe.EXPO_PUBLIC_API_URL;
  const accepted = spawnSync(process.execPath, [buildScript], { env: safe, encoding: 'utf8' });
  assert.equal(accepted.status, 0);
  assert.match(accepted.stdout, /catálogo público/);
  const rejected = spawnSync(process.execPath, [buildScript], {
    env: { ...safe, EXPO_PUBLIC_CATALOG_API_URL: 'https://synthetic:private-value@wrong.mx' }, encoding: 'utf8',
  });
  assert.equal(rejected.status, 1);
  assert.match(rejected.stderr, /EXPO_PUBLIC_CATALOG_API_URL/);
  assert.doesNotMatch(rejected.stdout + rejected.stderr, /synthetic|private-value|wrong\.mx/);
});

test('release catalog requires its own origin and never falls back to authentication', t => {
  runtime(t, false, 'https://auth.lapape.mx');
  assert.equal(config.isAuthAvailable(), true);
  delete process.env.EXPO_PUBLIC_CATALOG_API_URL;
  assert.throws(config.getCatalogApiConfig, { kind: 'configuration' });
  delete process.env.EXPO_PUBLIC_API_URL;
  assert.equal(config.isAuthAvailable(), false);
  process.env.EXPO_PUBLIC_API_URL = 'not-a-url';
  assert.equal(config.isAuthAvailable(), false);
});

test('release catalog transport works without auth and sends only public GETs with no credentials', async t => {
  runtime(t);
  assert.equal(config.isAuthAvailable(), false);
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return Response.json(url.endsWith('/categories') ? { data: [] }
      : { data: [], page: { hasMore: false, nextCursor: null } });
  });
  const catalog = getCatalogService('commercial');
  assert.deepEqual(await catalog.categories(), []);
  assert.deepEqual(await catalog.products(), []);
  assert.deepEqual(calls.map(call => call.url), [catalogOrigin + '/categories', catalogOrigin + '/products?limit=50']);
  for (const { options } of calls) {
    assert.equal(options.method, 'GET');
    assert.deepEqual(options.headers, { Accept: 'application/json' });
    assert.equal(options.credentials, 'omit');
    assert.equal(options.body, undefined);
  }
});

// Render actual screen/gate code with React SSR and native doubles. Effects and
// native mounting do not run here; these checks are not physical-device tests.
function nativeHarness(react = React) {
  const actions = [], routes = [], requests = [], storageCalls = [], inputs = [], alerts = [], saved = new Map();
  const host = tag => function NativeDouble(props) {
    if (tag === 'input') inputs.push(props);
    if (props.onPress) actions.push({ label: props.accessibilityLabel, children: props.children, run: props.onPress,
      disabled: props.disabled, role: props.accessibilityRole, checked: props.accessibilityState?.checked });
    return React.createElement(tag, { 'aria-label': props.accessibilityLabel },
      tag === 'input' ? undefined : props.children);
  };
  const View = host('div'), Text = host('span'), Pressable = host('button');
  const auth = { state: { status: 'guest' }, login: async () => { throw Error('Unexpected UI login'); },
    logout: async () => { throw Error('Unexpected UI logout'); }, restore() {}, retryCleanup() {} };
  const recovery = { state: { stage: 'request', email: '', busy: false, errors: {}, resendAt: 0,
    policy: { passwordMinCodePoints: 15 } }, request: async () => { throw Error('Unexpected UI recovery'); },
    confirm: async () => { throw Error('Unexpected UI recovery'); }, cancel() {} };
  const registration = { state: { stage: 'form', busy: false }, register() {}, verify() {}, resend() {}, reset() {} };
  const user = { id: '11111111-1111-4111-8111-111111111111', name: 'Cuenta sintética', email: 'synthetic@example.test', role: 'CLIENTE' };
  const session = { user, expiresAt: new Date(Date.now() + 120000).toISOString(), idleExpiresAt: new Date(Date.now() + 60000).toISOString() };
  const native = { View, Text, Pressable, TextInput: host('input'), ScrollView: View, KeyboardAvoidingView: View,
    ActivityIndicator: () => null, Platform: { OS: 'android' }, Keyboard: { dismiss() {} }, Alert: { alert(...args) { alerts.push(args); } },
    StyleSheet: { create: value => value }, useWindowDimensions: () => ({ width: 390, height: 844 }),
    AppState: { addEventListener: () => ({ remove() {} }) } };
  const router = { dismissTo: route => routes.push(route), push: route => routes.push(route),
    replace: route => routes.push(route), canGoBack: () => false, back() {} };
  const mocks = {
    react, 'react/jsx-runtime': require('react/jsx-runtime'), 'react-native': native,
    'expo-router': { router, useFocusEffect() {} }, 'expo-image': { Image: () => null },
    'expo-status-bar': { StatusBar: () => null },
    'react-native-safe-area-context': { useSafeAreaInsets: () => ({ top: 0, bottom: 0, left: 0, right: 0 }) },
    'expo-secure-store': { WHEN_UNLOCKED_THIS_DEVICE_ONLY: 1,
      async getItemAsync(key) { storageCalls.push('read'); return saved.get(key) ?? null; },
      async setItemAsync(key, value) { storageCalls.push('save'); saved.set(key, value); },
      async deleteItemAsync(key) { storageCalls.push('clear'); saved.delete(key); } },
    'expo/fetch': { fetch: async (url, options) => {
      requests.push({ url, options });
      if (url.endsWith('/auth/login')) return Response.json({ ...session, tokenType: 'Bearer', accessToken: 'A'.repeat(43) });
      if (url.endsWith('/auth/me')) return Response.json(session);
      if (url.endsWith('/auth/logout')) return new Response(null, { status: 204 });
      throw Error('Unexpected mock endpoint');
    } },
    '@/features/auth/proveedor-registro': { useRegistration: () => registration },
    '@/features/auth/proveedor-sesion': { useAuth: () => auth },
    '@/features/auth/proveedor-recuperacion': { useRecovery: () => recovery },
    '@/features/compra-local/proveedor-carrito': { useCart: () => ({ status: 'ready', value: [] }) },
    '@/components/catalogo/componentes-catalogo': { palette: { yellow: '#FFDF57' },
      ShopHeader: ({ left, children }) => React.createElement(View, null, left, children),
      ShopModal: ({ visible, children }) => visible ? React.createElement(View, null, children) : null,
      ShopStatus: ({ title, message }) => React.createElement(Text, null, title, message) },
    '@/components/compartidos/iconos-papeleria': { HomeIcon: () => null },
    '@/components/compartidos/ilustraciones-papeleria': { StationeryArt: () => null },
    '@/components/compra/marco-compra': { PurchaseFrame: ({ children }) => React.createElement(View, null, children),
      purchaseStyles: {}, PurchaseButton: ({ title, onPress, disabled }) => React.createElement(Pressable, { onPress, disabled }, title) },
  };
  const cache = new Map();
  function load(file) {
    file = resolve(frontend, 'src', file);
    if (cache.has(file)) return cache.get(file).exports;
    const module = { exports: {} }; cache.set(file, module);
    const code = ts.transpileModule(readFileSync(file, 'utf8'), { fileName: file,
      compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } }).outputText
      + (file.endsWith('proveedor-sesion.tsx') ? '\nexports.testFactory = createMobileController;' : '');
    function mockRequire(spec) {
      if (Object.hasOwn(mocks, spec)) return mocks[spec];
      if (spec.endsWith('.png')) return 0;
      const target = spec.startsWith('@/') ? join(frontend, 'src', spec.slice(2)) : resolve(file, '..', spec);
      const sourcePath = relative(join(frontend, 'src'), target);
      if (spec.startsWith('.') || spec.startsWith('@/')) {
        const alias = '@/' + sourcePath.replaceAll('\\', '/');
        if (Object.hasOwn(mocks, alias)) return mocks[alias];
        if (require('node:fs').existsSync(target + '.tsx')) return load(sourcePath + '.tsx');
        return require(join(frontend, '.test-build', sourcePath + '.js'));
      }
      throw Error('Unmocked native import: ' + spec);
    }
    vm.runInNewContext(code, { require: mockRequire, module, exports: module.exports }, { filename: file });
    return module.exports;
  }
  return { load, auth, recovery, registration, session, actions, routes, requests, storageCalls, inputs, alerts, saved };
}
const notice = 'El acceso a cuentas todavía no está disponible en esta versión de prueba';
function render(Component, props) { return renderToStaticMarkup(React.createElement(Component, props)); }


test('SSR with native doubles exercises deletion confirmation, loading, password error and confirmed navigation', async t => {
  runtime(t, false, 'https://auth.example.com');
  const values = [], refs = [];
  let stateIndex = 0, refIndex = 0, complete;
  const h = nativeHarness({
    ...React,
    useState(initial) {
      const i = stateIndex++;
      if (!(i in values)) values[i] = initial;
      return [values[i], value => { values[i] = typeof value === 'function' ? value(values[i]) : value; }];
    },
    useRef(initial) { const i = refIndex++; return refs[i] ??= { current: initial }; },
  });
  h.auth.state = { status: 'authenticated', session: h.session };
  h.auth.deleteAccount = () => new Promise(resolve => { complete = resolve; });
  const Profile = h.load('pantallas/pantalla-perfil.tsx').default;
  const redraw = () => { stateIndex = refIndex = 0; h.actions.length = h.inputs.length = 0; return render(Profile); };
  const action = label => h.actions.find(item => item.label === label || item.children === label
    || item.children?.props?.children === label);
  assert.doesNotMatch(redraw(), /Contraseña actual/);
  action('Eliminar mi cuenta').run();
  assert.match(redraw(), /Esta acción es irreversible/);
  assert.equal(action('Eliminar definitivamente').disabled, true);
  h.inputs.find(input => input.accessibilityLabel === 'Contraseña actual').onChangeText('Synthetic only');
  redraw();
  const checkbox = h.actions.find(item => item.role === 'checkbox');
  assert.equal(checkbox.checked, false);
  checkbox.run();
  redraw();
  action('Eliminar definitivamente').run();
  assert.match(redraw(), /Eliminando…/);
  complete('busy');
  await new Promise(resolve => setImmediate(resolve));
  assert.match(redraw(), /Espera a que termine/);
  h.auth.deleteAccount = async () => { throw new ApiError('http', 422); };
  h.inputs[0].onChangeText('Wrong synthetic password');
  redraw();
  action('Eliminar definitivamente').run();
  await new Promise(resolve => setImmediate(resolve));
  assert.match(redraw(), /No se pudo verificar tu contraseña/);
  assert.equal(h.alerts.length, 0);
  h.auth.deleteAccount = async () => 'deleted';
  h.inputs[0].onChangeText('Synthetic only');
  redraw();
  action('Eliminar definitivamente').run();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.alerts[0][0], 'Cuenta eliminada');
  h.alerts[0][2][0].onPress();
  assert.deepEqual(h.routes, ['/']);
});

test('SSR: registration remains guest-safe without auth and never requests credentials', t => {
  runtime(t); const h = nativeHarness();
  const html = render(h.load('pantallas/pantalla-registro.tsx').default);
  assert.ok(html.includes(notice)); assert.doesNotMatch(html, /<input/);
  assert.equal(h.requests.length, 0);
});
test('SSR: configured registration preserves its form with the server-aligned policy', t => {
  runtime(t, true, 'https://192.168.1.137:3443'); const h = nativeHarness();
  const html = render(h.load('pantallas/pantalla-registro.tsx').default);
  for (const label of ['Nombre completo', 'Correo electrónico', 'Contraseña', 'Confirmar contraseña']) assert.ok(html.includes(label));
  assert.match(html, /8 caracteres/); assert.doesNotMatch(html, /Registro en construcción/);
});
test('SSR: verification has empty, code and confirmed result states with no premature success', t => {
  runtime(t, true, 'https://192.168.1.137:3443'); const h = nativeHarness();
  const Component = h.load('pantallas/pantalla-verificar-correo.tsx').default;
  assert.match(render(Component), /Volver a Registro/);
  h.registration.state = { stage: 'code', busy: false, email: 'synthetic@example.test', message: 'Solicitud recibida', resendAt: 0 };
  const code = render(Component); assert.match(code, /Código de seis dígitos/); assert.doesNotMatch(code, /Cuenta verificada/);
  h.registration.state = { stage: 'done', busy: false, message: 'Correo verificado por el backend' };
  assert.match(render(Component), /Cuenta verificada/);
});

test('Android session composition without auth restores a guest without HTTP or SecureStore access', async t => {
  runtime(t);
  const h = nativeHarness();
  const controller = h.load('features/auth/proveedor-sesion.tsx').testFactory();
  await controller.restore();
  assert.equal(controller.getSnapshot().status, 'guest');
  await controller.resume();
  assert.equal(h.requests.length, 0);
  assert.equal(h.storageCalls.length, 0);
});

test('SSR: Login, Profile and Checkout show the shared notice instead of forms or login gates', t => {
  runtime(t);
  const h = nativeHarness();
  for (const [file, name, props] of [
    ['pantallas/pantalla-login.tsx', 'default'],
    ['pantallas/pantalla-perfil.tsx', 'default'],
    ['components/compra/marco-checkout.tsx', 'CheckoutFrame', { step: 2, children: 'PRIVATE-CHECKOUT' }],
  ]) {
    const html = render(h.load(file)[name], props);
    assert.ok(html.includes(notice), file);
    assert.doesNotMatch(html, /<input|PRIVATE-CHECKOUT|Inicia sesión para continuar|aria-label="Recordarme"/);
  }
  assert.equal(h.requests.length, 0);
  assert.equal(h.storageCalls.length, 0);
  const explore = h.actions.filter(action => action.label !== 'Volver');
  assert.equal(explore.length, 3);
  for (const action of explore) action.run();
  assert.deepEqual(h.routes, ['/explore', '/explore', '/explore']);
});

test('SSR: all recovery routes hide email, OTP, password and success claims when auth is unavailable', t => {
  runtime(t);
  const h = nativeHarness(), screens = h.load('pantallas/pantallas-recuperacion.tsx');
  for (const stage of ['request', 'code', 'done']) {
    h.recovery.state.stage = stage;
    for (const name of ['RecoveryRequestScreen', 'RecoveryCodeScreen', 'RecoveryResultScreen']) {
      const html = render(screens[name]);
      assert.ok(html.includes(notice));
      assert.doesNotMatch(html, /<input|Contraseña actualizada|Solicitar código|Cambiar contraseña|servidor confirmó/);
    }
  }
  assert.equal(h.requests.length, 0);
});

test('Expo Go development keeps its local HTTPS login form and legacy development-only catalog fallback', t => {
  runtime(t, true, 'https://192.168.1.137:3443');
  assert.equal(config.isAuthAvailable(), true);
  const h = nativeHarness();
  const html = render(h.load('pantallas/pantalla-login.tsx').default);
  assert.doesNotMatch(html, /acceso a cuentas todavía no está disponible/);
  assert.match(html, /aria-label="Correo electrónico"/);
  assert.match(html, /aria-label="Contraseña"/);
  assert.match(html, /Recordarme/);
  delete process.env.EXPO_PUBLIC_CATALOG_API_URL;
  assert.equal(config.getCatalogApiConfig().baseUrl, 'https://192.168.1.137:3443');
});

test('local HTTPS session still supports login, remember, restoration and logout using isolated native doubles', async t => {
  runtime(t, true, 'https://192.168.1.137:3443');
  const h = nativeHarness(), factory = h.load('features/auth/proveedor-sesion.tsx').testFactory;
  const first = factory();
  await first.restore();
  assert.equal(await first.login({ email: 'synthetic@example.test', password: 'Synthetic only for testing' }, true), true);
  assert.equal(first.getSnapshot().status, 'authenticated');
  assert.equal(h.saved.size, 1);
  const reopened = factory();
  await reopened.restore();
  assert.equal(reopened.getSnapshot().status, 'authenticated');
  await reopened.logout();
  assert.equal(reopened.getSnapshot().status, 'guest');
  assert.equal(h.saved.size, 0);
  assert.deepEqual(h.requests.map(call => new URL(call.url).pathname), ['/auth/login', '/auth/me', '/auth/logout']);
  assert.ok(h.requests.every(call => new URL(call.url).origin === 'https://192.168.1.137:3443'));
});
