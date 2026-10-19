import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { generateSummary } from '../generar-resumen.mjs';

const generatorPath = fileURLToPath(new URL('../generar-resumen.mjs', import.meta.url));
const checkIds = [
  'repositorio', 'node', 'dependencias_backend', 'dependencias_frontend',
  'sintaxis_backend', 'pruebas_backend', 'eslint', 'typescript',
  'pruebas_frontend', 'pruebas_integracion', 'herramientas_ci',
];
const reportNames = ['backend.xml', 'frontend.xml', 'integracion.xml', 'herramientas-ci.xml'];
const junitFixture = '<?xml version="1.0"?><testsuites><testsuite tests="1"><testcase name="caso de prueba del reporte"/></testsuite></testsuites>';

function createFixture(t) {
  const temporaryRoot = resolve(tmpdir());
  const directory = mkdtempSync(join(temporaryRoot, 'la-pape-reportes-ci-'));
  t.after(() => {
    // La limpieza solo puede afectar el directorio temporal creado por este caso.
    assert.equal(dirname(directory), temporaryRoot);
    assert.ok(basename(directory).startsWith('la-pape-reportes-ci-'));
    rmSync(directory, { recursive: true, force: true });
  });
  const steps = Object.fromEntries(checkIds.map((id) => [id, { outcome: 'success' }]));
  const options = { steps, reportDir: directory };
  return { directory, steps, options };
}

function createReports(directory, names = reportNames) {
  for (const name of names) writeFileSync(join(directory, name), junitFixture, 'utf8');
}

function runGenerator(directory, steps, extraEnv = {}) {
  return spawnSync(process.execPath, [generatorPath], {
    cwd: directory,
    encoding: 'utf8',
    env: {
      ...process.env,
      CI_STEP_RESULTS: JSON.stringify(steps),
      CI_SIMULATED: 'false',
      GITHUB_STEP_SUMMARY: join(directory, 'resumen-actions.md'),
      ...extraEnv,
    },
  });
}

test('SUCCESS conserva los XML y publica el mismo resumen en archivo y GITHUB_STEP_SUMMARY', (t) => {
  const { directory, options } = createFixture(t);
  createReports(directory);
  const stepSummary = join(directory, 'resumen-actions.md');
  writeFileSync(stepSummary, 'Resumen previo\n', 'utf8');

  const result = generateSummary({ ...options, stepSummary });

  assert.equal(result.realStatus, 'SUCCESS');
  assert.equal(result.executionStatus, 'SUCCESS');
  assert.equal(result.reportError, false);
  assert.match(result.markdown, /\| Pruebas del frontend \| SUCCESS \| Generado: frontend\.xml \|/);
  assert.match(result.markdown, /\| Integracion HTTP local \| SUCCESS \| Generado: integracion\.xml \|/);
  assert.match(result.markdown, /\| SIMULACION de fallo \| NO EJECUTADO \(no solicitada\) \| No aplica \|/);
  assert.equal(readFileSync(join(directory, 'resumen.md'), 'utf8'), result.markdown);
  assert.equal(readFileSync(stepSummary, 'utf8'), `Resumen previo\n${result.markdown}\n`);
  for (const name of reportNames) assert.equal(readFileSync(join(directory, name), 'utf8'), junitFixture);
});

test('un fallo real se muestra FAILED aunque el XML se haya generado correctamente', (t) => {
  const { directory, steps, options } = createFixture(t);
  createReports(directory);
  steps.pruebas_backend.outcome = 'failure';
  // outcome refleja el fallo original incluso si un contexto externo declara conclusion success.
  steps.pruebas_backend.conclusion = 'success';

  const result = generateSummary(options);

  assert.equal(result.realStatus, 'FAILED');
  assert.equal(result.executionStatus, 'FAILED');
  assert.equal(result.reportError, false);
  assert.match(result.markdown, /\| Pruebas del backend \| FAILED \| Generado: backend\.xml \|/);
});

test('un comando omitido y su XML ausente quedan NO EJECUTADO y no se acreditan como exitosos', (t) => {
  const { directory, steps, options } = createFixture(t);
  createReports(directory, ['backend.xml', 'frontend.xml', 'herramientas-ci.xml']);
  delete steps.pruebas_integracion;

  const result = generateSummary(options);

  assert.equal(result.realStatus, 'INCOMPLETO');
  assert.equal(result.executionStatus, 'INCOMPLETO');
  assert.equal(result.reportError, false);
  assert.match(result.markdown, /\| Integracion HTTP local \| NO EJECUTADO \| NO GENERADO: integracion\.xml/);
  assert.doesNotMatch(result.markdown, /\| Integracion HTTP local \| SUCCESS/);
});

test('fallar antes del runner por compilacion no inventa un XML ni resultados aprobados', (t) => {
  const { directory, steps, options } = createFixture(t);
  createReports(directory, ['backend.xml', 'herramientas-ci.xml']);
  steps.pruebas_frontend.outcome = 'failure';
  steps.pruebas_integracion.outcome = 'skipped';

  const result = generateSummary(options);

  assert.equal(result.realStatus, 'FAILED');
  assert.equal(result.reportError, false);
  assert.match(result.markdown, /\| Pruebas del frontend \| FAILED \| NO GENERADO: frontend\.xml/);
  assert.match(result.markdown, /\| Integracion HTTP local \| NO EJECUTADO \| NO GENERADO: integracion\.xml/);
  assert.equal(existsSync(join(directory, 'frontend.xml')), false);
});

test('exit cero sin XML o con XML vacio produce un error de reportes y conserva el resumen', (t) => {
  const { directory, options } = createFixture(t);
  createReports(directory, ['backend.xml', 'herramientas-ci.xml']);
  writeFileSync(join(directory, 'frontend.xml'), '', 'utf8');

  const result = generateSummary(options);

  assert.equal(result.realStatus, 'FAILED');
  assert.equal(result.reportError, true);
  assert.match(result.markdown, /NO GENERADO: frontend\.xml — ERROR de reportes/);
  assert.match(result.markdown, /NO GENERADO: integracion\.xml — ERROR de reportes/);
  assert.equal(readFileSync(join(directory, 'resumen.md'), 'utf8'), result.markdown);
});

test('una cancelacion se distingue de SUCCESS y de fallo de una prueba', (t) => {
  const { directory, steps, options } = createFixture(t);
  createReports(directory, ['backend.xml', 'herramientas-ci.xml']);
  steps.pruebas_frontend.outcome = 'cancelled';
  steps.pruebas_integracion.outcome = 'skipped';

  const result = generateSummary(options);

  assert.equal(result.realStatus, 'CANCELADO');
  assert.equal(result.executionStatus, 'CANCELADO');
  assert.equal(result.reportError, false);
  assert.match(result.markdown, /\| Pruebas del frontend \| CANCELADO \| NO GENERADO: frontend\.xml/);
});

test('la simulacion muestra su fallo por separado mientras conserva SUCCESS para las verificaciones reales', (t) => {
  const { directory, steps, options } = createFixture(t);
  createReports(directory, [...reportNames, 'simulacion-fallo.xml']);
  steps.simulacion = { outcome: 'failure' };

  const result = generateSummary({ ...options, simulated: true });

  assert.equal(result.realStatus, 'SUCCESS');
  assert.equal(result.executionStatus, 'FAILED');
  assert.equal(result.reportError, false);
  assert.match(result.markdown, /SIMULACION DE FALLO \(manual; separada de las pruebas reales\)/);
  assert.match(result.markdown, /\| SIMULACION de fallo \| FAILED \| Generado: simulacion-fallo\.xml \|/);
  assert.match(result.markdown, /No representa un defecto de la aplicacion ni se suma a sus pruebas reales/);
});

test('una simulacion solicitada sin fallo acreditado o sin XML tambien se denuncia como error', (t) => {
  const { directory, steps, options } = createFixture(t);
  createReports(directory);
  steps.simulacion = { outcome: 'success' };

  const result = generateSummary({ ...options, simulated: true });

  assert.equal(result.executionStatus, 'FAILED');
  assert.equal(result.reportError, true);
  assert.match(result.markdown, /ERROR DE SIMULACION/);
  assert.match(result.markdown, /NO GENERADO: simulacion-fallo\.xml/);
});

test('CLI exitoso termina con codigo cero y genera resumen descargable y Step Summary', (t) => {
  const { directory, steps } = createFixture(t);
  const reportDirectory = join(directory, 'reportes', 'ci');
  mkdirSync(reportDirectory, { recursive: true });
  createReports(reportDirectory);

  const result = runGenerator(directory, steps);

  assert.equal(result.error, undefined);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Resultado de las verificaciones reales:\*\* SUCCESS/);
  assert.equal(readFileSync(join(reportDirectory, 'resumen.md'), 'utf8').trim(), result.stdout.trim());
  assert.equal(readFileSync(join(directory, 'resumen-actions.md'), 'utf8').trim(), result.stdout.trim());
});

test('CLI termina con codigo uno si un comando exitoso no produjo su XML', (t) => {
  const { directory, steps } = createFixture(t);

  const result = runGenerator(directory, steps);

  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.match(result.stdout, /Resultado de las verificaciones reales:\*\* FAILED/);
  assert.match(readFileSync(join(directory, 'reportes', 'ci', 'resumen.md'), 'utf8'), /ERROR de reportes/);
});

test('CLI con JSON invalido deja un resumen FAILED y termina con codigo uno', (t) => {
  const { directory, steps } = createFixture(t);

  const result = runGenerator(directory, steps, { CI_STEP_RESULTS: '{json-invalido' });

  assert.equal(result.error, undefined);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.trim().length > 0);
  assert.match(readFileSync(join(directory, 'reportes', 'ci', 'resumen.md'), 'utf8'), /# CI - FAILED/);
  assert.match(readFileSync(join(directory, 'resumen-actions.md'), 'utf8'), /No se pudo generar el resumen/);
});
