const assert = require('node:assert/strict');
const test = require('node:test');
const { Buffer } = require('node:buffer');
const { createLocalStorage } = require('../.test-build/features/compra-local/almacenamiento.js');
const { createLocalController } = require('../.test-build/features/compra-local/controlador-local.js');
const { parseCart, addCartEntry, setCartQuantity, priceCents, formatMoney, resolveCart } = require('../.test-build/features/compra-local/carrito.js');
const id = '00000000-0000-4000-8000-000000000001';
const other = '00000000-0000-4000-8000-000000000002';
const { createCartAddAction, cartItemCount } = require('../.test-build/features/compra-local/accion-agregar.js');
const { makeCartFlight, sampleCartFlight, createCartFlightCoordinator } = require('../.test-build/features/compra-local/vuelo-carrito.js');
const product = { id, sku: 'FIXTURE', name: 'Artículo de prueba', category_id: other, category_name: 'Cuadernos',
  brand_id: other, brand_name: 'Marca de prueba', price: '59.90', currency: 'MXN', image_url: null };
function memory() {
  const data = new Map();
  return { data, get: async key => data.get(key) ?? null, set: async (key, value) => { data.set(key, value); }, remove: async key => { data.delete(key); } };
}

test('detail adds the selected units atomically and repeated adds accumulate one persisted row with exact totals', async () => {
  const store = createLocalStorage(memory(), 'detail.cart');
  const controller = createLocalController(store, [], parseCart);
  await controller.restore();
  let writes = 0;
  const write = store.write;
  store.write = async value => { writes++; await write(value); };
  await controller.update(items => addCartEntry(items,id,3));
  await controller.update(items => addCartEntry(items,id,2));
  assert.equal(writes,2);
  assert.deepEqual(controller.getSnapshot().value,[{id,quantity:5}]);
  const reopened = createLocalController(store,[],parseCart); await reopened.restore();
  assert.deepEqual(reopened.getSnapshot().value,[{id,quantity:5}]);
  assert.equal(resolveCart(reopened.getSnapshot().value,[product]).subtotal,29950);
  for(const quantity of [0,-1,1.5,NaN,Infinity]) assert.throws(()=>addCartEntry([],id,quantity));
  assert.throws(()=>addCartEntry([{id,quantity:Number.MAX_SAFE_INTEGER}],id,1));
});

test('duplicate prevention applies to the whole selected quantity and never partially adds or retries an ignored tap', async () => {
  let release, time=0; const units=[];
  const add=createCartAddAction(async(_id,quantity)=>{units.push(quantity);return new Promise(resolve=>{release=resolve;});},()=>time);
  const first=add(id,4);
  assert.equal(await add(id,4),'ignored'); release(true); assert.equal(await first,'added');
  assert.equal(await add(id,2),'ignored'); assert.deepEqual(units,[4]);
  time=700; const second=add(id,2); release(true); assert.equal(await second,'added');
  assert.deepEqual(units,[4,2]); assert.equal(await add(id,0),'error');
});

test('flight geometry selects a visible header or fixed footer, accounts for screen offsets and falls back when the hero is offscreen', () => {
  const root={x:20,y:40,width:390,height:800};
  const photo={x:40,y:200,width:150,height:140};
  const button={x:40,y:300,width:150,height:70};
  const header={x:330,y:75,width:46,height:46};
  const footer={x:200,y:780,width:32,height:28};
  const preferred=makeCartFlight(root,photo,button,[header,footer]);
  assert.equal(preferred.endX,333); assert.equal(preferred.endY,58);
  const afterScroll=makeCartFlight(root,photo,button,[{...header,y:-100},footer]);
  assert.equal(afterScroll.endY,754);
  const hiddenHero=makeCartFlight(root,{...photo,y:-400},button,[header]);
  assert.equal(hiddenHero.startY,295);
  assert.equal(makeCartFlight(null,photo,button,[header]),null);
  assert.equal(makeCartFlight(root,photo,button,[null]),null);
  assert.equal(makeCartFlight(root,{...photo,x:NaN},null,[header]),null);
  const initial=sampleCartFlight(preferred,0), final=sampleCartFlight(preferred,1);
  assert.equal(initial.x,preferred.startX); assert.equal(initial.scale,1);
  assert.equal(final.x,preferred.endX); assert.equal(final.y,preferred.endY);
  assert.ok(final.scale<0.2); assert.equal(final.opacity,0);
  for(let p=0;p<=1;p+=0.1) assert.ok(Object.values(sampleCartFlight(preferred,p)).every(Number.isFinite));
});

test('a cancelled measurement preserves the accepted add but duplicate flights cannot start another write', async () => {
  const coordinator=createCartFlightCoordinator(); let release, commits=0, shown=0;
  const first=coordinator.run(()=>new Promise(resolve=>{release=resolve;}),async()=>{commits++;return 'added';},async()=>{shown++;});
  assert.equal(coordinator.isBusy(),true);
  assert.equal(await coordinator.run(async()=>null,async()=>{commits++;return 'added';},async()=>{}),'ignored');
  coordinator.cancel(); release({}); assert.equal(await first,'added');
  assert.equal(commits,1); assert.equal(shown,0); assert.equal(coordinator.isBusy(),false);
});

test('navigation after persistence keeps the successful cart change but suppresses the old screen flight', async () => {
  const coordinator=createCartFlightCoordinator(); let release, entered, shown=0;
  const started=new Promise(resolve=>{entered=resolve;});
  const first=coordinator.run(async()=>({}),async()=>{entered();return new Promise(resolve=>{release=resolve;});},async()=>{shown++;});
  await started; coordinator.cancel(); release('added');
  assert.equal(await first,'added'); assert.equal(shown,0);
  assert.equal(await coordinator.run(async()=>null,async()=>'added',async()=>{shown++;}),'added');
  assert.equal(shown,1);
});

test('missing measurements or a failed visual never turn a committed add into an error, while failed persistence never flies', async () => {
  const coordinator=createCartFlightCoordinator(); let shown=0;
  assert.equal(await coordinator.run(async()=>{throw new Error('native measurement');},async()=>'added',async path=>{assert.equal(path,null);shown++;}),'added');
  assert.equal(await coordinator.run(async()=>({}),async()=>'error',async()=>{shown++;}),'error');
  assert.equal(shown,1);
  assert.equal(await coordinator.run(async()=>({}),async()=>'added',async()=>{throw new Error('native animation');}),'added');
  assert.equal(coordinator.isBusy(),false);
});

test('catalog action uses the existing persisted cart and increments one commercial UUID instead of duplicating rows', async () => {
  let time = 0;
  const storage = createLocalStorage(memory(), 'catalog.cart');
  const controller = createLocalController(storage, [], parseCart);
  await controller.restore();
  const action = createCartAddAction(id => controller.update(items => addCartEntry(items, id)), () => time);
  assert.equal(await action(id), 'added');
  time = 700;
  assert.equal(await action(id), 'added');
  assert.deepEqual(controller.getSnapshot().value, [{ id, quantity: 2 }]);
  assert.equal(cartItemCount(controller.getSnapshot().value), 2);
  const restored = createLocalController(storage, [], parseCart);
  await restored.restore();
  assert.deepEqual(restored.getSnapshot().value, [{ id, quantity: 2 }]);
  assert.equal(resolveCart(restored.getSnapshot().value, [product]).subtotal, 11980);
});

test('catalog action rejects rapid duplicates, permits a deliberate later add and safely retries persistence failures', async () => {
  let release, calls = 0, time = 0;
  const action = createCartAddAction(async () => { calls++; return new Promise(resolve => { release = resolve; }); }, () => time);
  const first = action(id);
  assert.equal(await action(id), 'ignored');
  release(true);
  assert.equal(await first, 'added');
  assert.equal(await action(id), 'ignored');
  assert.equal(calls, 1);
  time = 700;
  const later = action(id);
  release(false);
  assert.equal(await later, 'error');
  const retry = action(id);
  release(true);
  assert.equal(await retry, 'added');
  assert.equal(await action('invalid-id'), 'error');
  assert.equal(await createCartAddAction(async () => { throw new Error('private native error'); })(other), 'error');
});

test('cart validates UUID quantities and duplicates without changing input', () => {
  const source = [{ id, quantity: 2 }];
  const entries = parseCart(source);
  assert.notEqual(entries, source);
  assert.ok(Object.isFrozen(entries) && Object.isFrozen(entries[0]));
  for (const bad of [null, {}, [{ id: 'bad', quantity: 1 }], [{ id, quantity: 0 }], [{ id, quantity: 1.1 }],
    [{ id, quantity: Infinity }], [{ id, quantity: 1 }, { id, quantity: 2 }]]) assert.throws(() => parseCart(bad));
  assert.deepEqual(addCartEntry(entries, id), [{ id, quantity: 3 }]);
  assert.deepEqual(addCartEntry(entries, other), [{ id, quantity: 2 }, { id: other, quantity: 1 }]);
  assert.deepEqual(setCartQuantity(entries, id, 5), [{ id, quantity: 5 }]);
  assert.deepEqual(source, [{ id, quantity: 2 }]);
});

test('cart uses exact API decimal cents and tracks unavailable IDs without substituting products', () => {
  const resolved = resolveCart([{ id, quantity: 3 }, { id: other, quantity: 1 }], [product]);
  assert.equal(resolved.subtotal, 17970);
  assert.equal(resolved.lines[0].product, product);
  assert.equal(resolved.lines[0].product.image_url, null);
  assert.deepEqual(resolved.missing, [other]);
  assert.equal(priceCents('0.10') * 3, 30);
  assert.equal(formatMoney(17970), '$179.70');
  assert.throws(() => priceCents('1.999'));
  assert.throws(() => formatMoney(Infinity));
  assert.throws(() => resolveCart([{ id, quantity: Number.MAX_SAFE_INTEGER }], [product]));
});

test('chunked local persistence keeps Unicode values small and reopens through its committed manifest', async () => {
  const store = memory();
  const value = [{ text: 'ñ€🎨'.repeat(1400) }];
  await createLocalStorage(store, 'test.cart').write(value);
  assert.deepEqual(await createLocalStorage(store, 'test.cart').read(), value);
  for (const text of store.data.values()) assert.ok(Buffer.byteLength(text, 'utf8') <= 1024);
});

test('failed local writes leave the previously committed cart intact', async () => {
  const store = memory();
  const storage = createLocalStorage(store, 'test.cart');
  await storage.write([{ id, quantity: 1 }]);
  const set = store.set;
  store.set = async (key, value) => { if (key.endsWith('.index')) throw new Error('private native message'); await set(key, value); };
  await assert.rejects(storage.write([{ id, quantity: 2 }]), /No se pudo guardar/);
  assert.deepEqual(await storage.read(), [{ id, quantity: 1 }]);
});

test('storage generation collisions and a zero random suffix cannot overwrite committed data', async context => {
  context.mock.method(Date, 'now', () => 1);
  context.mock.method(Math, 'random', () => 0);
  const store = memory();
  const storage = createLocalStorage(store, 'test.cart');
  await storage.write([{ id, quantity: 1 }]);
  await storage.write([{ id, quantity: 2 }]);
  assert.deepEqual(await storage.read(), [{ id, quantity: 2 }]);
  const set = store.set;
  store.set = async (key, value) => { if (key.endsWith('.index')) throw new Error('synthetic failure'); await set(key, value); };
  await assert.rejects(storage.write([{ id, quantity: 3 }]));
  assert.deepEqual(await storage.read(), [{ id, quantity: 2 }]);
});

test('corrupt or incomplete local state reports an error and explicit reset can recover', async () => {
  const store = memory();
  const storage = createLocalStorage(store, 'test.cart');
  store.data.set('test.cart.index', 'invalid');
  const controller = createLocalController(storage, [], parseCart);
  assert.equal(await controller.restore(), false);
  assert.equal(controller.getSnapshot().status, 'error');
  assert.equal(await controller.update(value => addCartEntry(value, id)), false);
  assert.equal(await controller.reset(), true);
  assert.deepEqual(await storage.read(), []);
  const manifest = JSON.parse(store.data.get('test.cart.index'));
  store.data.delete(`test.cart.${manifest.generation}.0`);
  await assert.rejects(storage.read());
});

test('local controller serializes rapid actions and persists before exposing new state', async () => {
  const storage = createLocalStorage(memory(), 'test.cart');
  const controller = createLocalController(storage, [], parseCart);
  await controller.restore();
  await Promise.all(Array.from({ length: 5 }, () => controller.update(value => addCartEntry(value, id))));
  assert.deepEqual(controller.getSnapshot().value, [{ id, quantity: 5 }]);
  const reopened = createLocalController(storage, [], parseCart);
  await reopened.restore();
  assert.deepEqual(reopened.getSnapshot().value, [{ id, quantity: 5 }]);
});

test('local errors preserve previous state and subscribers clean up without duplicate notifications', async () => {
  const storage = { read: async () => null, write: async () => { throw new Error('private secret'); } };
  const controller = createLocalController(storage, [], parseCart);
  let calls = 0;
  const listener = () => { calls++; };
  const off = controller.subscribe(listener);
  controller.subscribe(listener);
  await controller.restore();
  assert.equal(calls, 2);
  assert.equal(await controller.update(value => addCartEntry(value, id)), false);
  assert.deepEqual(controller.getSnapshot().value, []);
  assert.ok(!controller.getSnapshot().error.includes('private secret'));
  off();
  const before = calls;
  await controller.restore();
  assert.equal(calls, before);
});


const { emptyAddress, validateAddress, parseAddresses, checkoutAddressReady, checkoutReviewReady } = require('../.test-build/features/compra-local/checkout.js');
const address = { ...emptyAddress, recipient: 'Persona de prueba', phone: '5555555555', street: 'Calle de prueba', number: '10',
  neighborhood: 'Colonia de prueba', city: 'Ciudad de prueba', region: 'Estado de prueba', postalCode: '01000' };

test('checkout validates required Mexican address fields and retains optional references', () => {
  assert.deepEqual(validateAddress(address), {});
  assert.ok(Object.keys(validateAddress(emptyAddress)).length >= 7);
  assert.ok(validateAddress({ ...address, postalCode: '1234' }).postalCode);
  assert.ok(validateAddress({ ...address, phone: '123' }).phone);
  assert.ok(validateAddress({ ...address, references: 'x'.repeat(241) }).references);
});

test('checkout requires address for delivery and allows a pickup preview without manufacturing a branch address', () => {
  assert.equal(checkoutAddressReady({ delivery: 'home', address: emptyAddress, payment: null }), false);
  assert.equal(checkoutAddressReady({ delivery: 'pickup', address: emptyAddress, payment: null }), true);
  assert.equal(checkoutAddressReady({ delivery: null, address, payment: null }), false);
  assert.equal(checkoutReviewReady({ delivery: 'home', address, payment: null }), false);
  assert.equal(checkoutReviewReady({ delivery: 'home', address, payment: 'card' }), true);
  assert.equal(checkoutReviewReady({ delivery: 'pickup', address: emptyAddress, payment: 'store' }), true);
  assert.equal(checkoutReviewReady({ delivery: 'home', address, payment: 'unknown' }), false);
});

test('local addresses validate identity, normalize copies and reject duplicates or invalid fields', () => {
  const source = { ...address, id: 'local-address-1', recipient: '  Persona de prueba  ' };
  const result = parseAddresses([source]);
  assert.equal(result[0].recipient, 'Persona de prueba');
  assert.equal(source.recipient, '  Persona de prueba  ');
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result[0]));
  for (const value of [null, [null], [{ ...source, postalCode: 'bad' }], [source, source]]) assert.throws(() => parseAddresses(value));
});


const { buildDemoOrders, orderProgress, trackingSteps } = require('../.test-build/features/compra-local/pedidos-demostracion.js');
test('order demonstrations use actual supplied product identity and prices and cover three explicit states', () => {
  const orders = buildDemoOrders([product]);
  assert.deepEqual(orders.map(order => order.status), ['processing', 'shipping', 'delivered']);
  for (const order of orders) {
    assert.match(order.id, /^ejemplo-/);
    assert.equal(order.lines[0].product, product);
    assert.equal(order.subtotal, 5990);
    assert.ok(orderProgress[order.status] < trackingSteps.length);
    assert.equal(order.date, undefined);
  }
  assert.deepEqual(buildDemoOrders([]), []);
});


const { parseFavorites, toggleFavorite } = require('../.test-build/features/compra-local/favoritos.js');
test('favorites add and remove only UUIDs without mixing commercial data with local fixtures', () => {
  const initial = parseFavorites([id]);
  assert.deepEqual(toggleFavorite(initial, other), [id, other]);
  assert.deepEqual(toggleFavorite(initial, id), []);
  assert.deepEqual(initial, [id]);
  assert.ok(Object.isFrozen(initial));
  for (const value of [null, ['not-a-product'], [id, id]]) assert.throws(() => parseFavorites(value));
});

test('device namespaces isolate cart favorites and address books from different authenticated users', async () => {
  const store = memory();
  const cart = createLocalStorage(store, 'lapape.local.cart.v1');
  const favorites = createLocalStorage(store, 'lapape.local.favorites.v1');
  const addressesA = createLocalStorage(store, 'lapape.local.addresses.v1.' + id);
  const addressesB = createLocalStorage(store, 'lapape.local.addresses.v1.' + other);
  await cart.write([{ id, quantity: 2 }]);
  await favorites.write([id]);
  await addressesA.write([{ ...address, id: 'address_one' }]);
  assert.equal(await addressesB.read(), null);
  assert.deepEqual(await favorites.read(), [id]);
  assert.deepEqual(await cart.read(), [{ id, quantity: 2 }]);
  assert.deepEqual(await addressesA.read(), [{ ...address, id: 'address_one' }]);
});
