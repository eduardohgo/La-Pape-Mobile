# Actividad 5 — Evidencia local publicable de Semgrep CE

Fecha: 27 de octubre de 2026. Fin del análisis: 08:40:43 UTC.
Base: develop, 14a33cd5a508c263f77c15a5237ae4033dddd072.

| Comprobación real | Resultado |
|---|---|
| Docker Client/Server | 29.2.0, motor Linux |
| Semgrep CE | 1.182.1; imagen oficial fijada por digest en toolchain.json |
| Pruebas auxiliares del gate | 9 aprobadas, 0 fallidas |
| Fixture vulnerable | Las seis reglas detectadas; exit 1 esperado |
| Fixture segura | Sin coincidencias; exit 0 |
| YAML deliberadamente inválido | Exit 7; no se presentó como éxito |
| Fuentes reales | 48 archivos examinados, 0 coincidencias con las reglas, 0 errores |
| Contenedor completo | Exit 0; verificación y análisis satisfactorios |

Las tres fixtures generaron JSON/SARIF, incluidos los casos de fallo esperado.
El contenedor funcionó sin red, con fuentes en solo lectura y escritura únicamente
en reportes. No se ejecutaron las fixtures como código, Expo, Express ni DAST.

## Alcance

35 archivos de frontend/src, 12 de backend/src y uno de scripts. Se excluyeron
explícitamente scripts/ci/fixtures/fallo-simulado.cjs y scripts/ci/test/reportes.test.mjs.
Dentro de las raíces hay además un README y dos CSS fuera del alcance JS/TS.
El inventario exacto está en [el resumen revisado](resultado-local-publicable.json).

Se analizó la base develop, sin copiar cambios locales de SDK 58, Actividad 4,
Cloudinary o migración 003. Estos avances requerirán otro análisis cuando se integren.

## Hallazgos

No se detectaron coincidencias en las fuentes reales con estas seis reglas. Esto
no demuestra ausencia total de vulnerabilidades. Las detecciones de la fixture son
sintéticas, no vulnerabilidades de producción:

| Regla | Nivel configurado | Riesgo orientativo |
|---|---|---|
| lapape.dynamic-code | ERROR | Ejecución dinámica, CWE-95 |
| lapape.tls-validation-disabled | ERROR | Validación TLS deshabilitada, CWE-295 |
| lapape.request-data-in-sql | ERROR | Datos de solicitud en texto SQL, CWE-89 |
| lapape.request-data-in-shell | ERROR | Datos de solicitud en shell, CWE-78 |
| lapape.react-raw-html | WARNING | HTML insertado sin escape automático, CWE-79 |
| lapape.weak-token-randomness | WARNING | Aleatoriedad inadecuada para secretos, CWE-338 |

ERROR/WARNING no equivalen automáticamente a «crítico». Cada hallazgo exige revisar
su contexto e impacto. Todas las severidades configuradas bloquean este workflow.

## Evidencia e integridad

El [resumen publicable](resultado-local-publicable.json) conserva fecha, versiones,
base, inventario, resultados y límites. Los JSON/SARIF y logs locales completos se
conservan fuera del commit; no se publican comandos del host ni rutas personales.
GitHub Actions generará sus propios artefactos descargables al ejecutar el PR.

El CI anterior conserva su contenido. SHA-256 de su copia local antes y después:

a67cf41f9e26fe878194db1935d76290a93cdac9e90f73fe35aa4246e9e140ae

No se modificaron fuentes de producción ni servicios. El workflow SAST es independiente
del CI existente. La ejecución local no acredita por sí sola ejecución remota: revisar
los checks y artefactos del PR. No acredita DAST ni una fecha retroactiva al 22 de octubre.
