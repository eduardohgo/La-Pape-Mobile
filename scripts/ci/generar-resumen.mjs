import { appendFileSync, existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const checks = [
  { id: 'repositorio', name: 'Descarga del repositorio' },
  { id: 'node', name: 'Configuracion de Node.js 22' },
  { id: 'dependencias_backend', name: 'Dependencias del backend' },
  { id: 'dependencias_frontend', name: 'Dependencias del frontend' },
  { id: 'sintaxis_backend', name: 'Sintaxis del backend' },
  { id: 'pruebas_backend', name: 'Pruebas del backend', xml: 'backend.xml' },
  { id: 'eslint', name: 'ESLint del frontend' },
  { id: 'typescript', name: 'TypeScript del frontend' },
  { id: 'pruebas_frontend', name: 'Pruebas del frontend', xml: 'frontend.xml' },
  { id: 'pruebas_integracion', name: 'Integracion HTTP local', xml: 'integracion.xml' },
  { id: 'herramientas_ci', name: 'Generador de reportes CI (separado de la aplicacion)', xml: 'herramientas-ci.xml' },
];
const labels = {
  success: 'SUCCESS', failure: 'FAILED', skipped: 'NO EJECUTADO', cancelled: 'CANCELADO',
};

// Se usan los outcomes reales de Actions, nunca un total fijo ni conclusion con errores tolerados.
export function generateSummary({ steps, simulated = false, reportDir, stepSummary }) {
  mkdirSync(reportDir, { recursive: true });
  const rows = checks.map((check) => {
    const outcome = steps[check.id]?.outcome ?? 'skipped';
    const hasXml = check.xml && existsSync(resolve(reportDir, check.xml))
      && statSync(resolve(reportDir, check.xml)).size > 0;
    return { ...check, outcome, hasXml, missing: Boolean(check.xml && !hasXml) };
  });
  const realFailed = rows.some((r) => r.outcome === 'failure' || (r.outcome === 'success' && r.missing));
  const realCancelled = rows.some((r) => r.outcome === 'cancelled');
  const realComplete = rows.every((r) => r.outcome === 'success' && !r.missing);
  const realStatus = realFailed ? 'FAILED' : realCancelled ? 'CANCELADO' : realComplete ? 'SUCCESS' : 'INCOMPLETO';
  const simulationOutcome = steps.simulacion?.outcome ?? 'skipped';
  const simulationXml = existsSync(resolve(reportDir, 'simulacion-fallo.xml'))
    && statSync(resolve(reportDir, 'simulacion-fallo.xml')).size > 0;
  // Una simulacion solicitada que no produjo su fallo tampoco acredita una ejecucion correcta.
  const simulationFailed = simulated && (simulationOutcome !== 'failure' || !simulationXml);
  const executionStatus = simulated || realFailed ? 'FAILED' : realStatus;
  const lines = [
    '# CI - La Pape Mobile', '',
    `**Modo:** ${simulated ? 'SIMULACION DE FALLO (manual; separada de las pruebas reales)' : 'VALIDACION REAL'}.`,
    `**Resultado de las verificaciones reales:** ${realStatus}.`,
    `**Resultado de esta ejecucion, antes de publicar artefactos:** ${executionStatus}.`, '',
    '| Verificacion | Estado del comando | Reporte JUnit |',
    '|---|---|---|',
  ];
  for (const row of rows) {
    const status = labels[row.outcome] ?? 'DESCONOCIDO';
    const report = !row.xml ? 'No aplica'
      : row.hasXml ? `Generado: ${row.xml}`
        : `NO GENERADO: ${row.xml}${row.outcome === 'success' ? ' — ERROR de reportes' : ' — revisar logs y prerrequisitos'}`;
    lines.push(`| ${row.name} | ${status} | ${report} |`);
  }
  lines.push(`| SIMULACION de fallo | ${simulated ? labels[simulationOutcome] ?? 'DESCONOCIDO' : 'NO EJECUTADO (no solicitada)'} | ${simulated ? simulationXml ? 'Generado: simulacion-fallo.xml' : 'NO GENERADO: simulacion-fallo.xml' : 'No aplica'} |`);
  lines.push('',
    'SUCCESS describe el codigo de salida del comando. Los casos aprobados, fallidos, omitidos o pendientes y sus detalles se consultan en los XML nativos y en los logs; no se contabilizan omisiones como aprobaciones.',
    'Un XML ausente no se sustituye por uno de exito. Si el comando termino correctamente pero no produjo su XML, el paso de resumen tambien falla.',
    'La integracion HTTP utiliza Express local y /health; no acredita consultas a Neon ni aceptacion de interfaz en iPhone.',
    'Descargar los XML y este resumen desde Artifacts. El resultado definitivo del workflow tambien incluye el paso de publicacion: comprobar su estado en Actions.', '');
  if (simulated) lines.push('**SIMULACION:** el fallo intencional debe dejar el workflow en rojo. No representa un defecto de la aplicacion ni se suma a sus pruebas reales.', '');
  if (simulationFailed) lines.push('**ERROR DE SIMULACION:** no se acredito el fallo intencional con su XML. Revisar el paso SIMULACION.', '');
  const markdown = lines.join('\n');
  writeFileSync(resolve(reportDir, 'resumen.md'), markdown, 'utf8');
  if (stepSummary) appendFileSync(stepSummary, `${markdown}\n`, 'utf8');
  return { markdown, realStatus, executionStatus, reportError: rows.some((r) => r.outcome === 'success' && r.missing) || simulationFailed };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    const result = generateSummary({
      steps: JSON.parse(process.env.CI_STEP_RESULTS ?? '{}'),
      simulated: process.env.CI_SIMULATED === 'true',
      reportDir: resolve('reportes/ci'),
      stepSummary: process.env.GITHUB_STEP_SUMMARY,
    });
    console.log(result.markdown);
    if (result.reportError || result.realStatus !== 'SUCCESS') process.exitCode = 1;
  } catch (error) {
    const message = '# CI - FAILED\n\nNo se pudo generar el resumen de verificaciones. Consultar los logs del generador.\n';
    mkdirSync('reportes/ci', { recursive: true });
    writeFileSync('reportes/ci/resumen.md', message);
    if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, message);
    console.error(error.message);
    process.exitCode = 1;
  }
}
