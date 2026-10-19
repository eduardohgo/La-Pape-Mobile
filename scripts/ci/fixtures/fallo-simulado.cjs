// Fuera de backend/test y frontend/test: nunca forma parte de las pruebas reales.
const assert = require('node:assert/strict');
const test = require('node:test');

test('SIMULACION DE REPORTE: fallo intencional, sin modificar la aplicacion', () => {
  assert.fail('SIMULACION: este fallo esperado demuestra el reporte FAILED y la publicacion de artefactos.');
});
