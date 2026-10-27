const assert = require('node:assert/strict');
const test = require('node:test');
const React = require('react');
const { renderToString } = require('react-dom/server');
const { useCatalogViewModel, useProductDetailViewModel } = require('../.test-build/features/catalogo/presentacion/hooks.js');

// Real React server render only. Effects, client subscriptions and mount/unmount
// do NOT run here; this is explicitly not a mounted-hook test.
test('React SSR: catalog hook exposes its stable initial snapshot without reading configuration or fetching', () => {
  function Probe() {
    const { state, retry } = useCatalogViewModel();
    assert.equal(typeof retry, 'function');
    return React.createElement('span', null, state.status);
  }
  assert.equal(renderToString(React.createElement(Probe)), '<span>loading</span>');
});

test('React SSR: detail hook renders loading for each UUID without starting effects or repository I/O', () => {
  function Probe({ id }) {
    const { state } = useProductDetailViewModel(id);
    return React.createElement('span', null, state.status);
  }
  for (const id of ['e9096108-10c1-4483-9a3c-f61283d3c24f', 'invalid']) {
    assert.equal(renderToString(React.createElement(Probe, { id })), '<span>loading</span>');
  }
});
