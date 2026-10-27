# Actividad 5 — Semgrep CE SAST

Integración SAST de Actividad 5, preparada el 27 de octubre de 2026.
Base develop verificada: 14a33cd5a508c263f77c15a5237ae4033dddd072.
Rama: codex/actividad5-semgrep. No contiene los avances locales sin commit de SDK 58,
Actividad 4, Cloudinary ni migración 003 del directorio principal.

## Qué se analiza

SAST inspecciona código fuente sin ejecutar la aplicación. Este workflow independiente
analiza frontend/src, backend/src y scripts de la revisión disponible. Reutiliza el
repositorio existente; no crea otro backend/base ni inicia Expo o Express.
No ejecuta npm ci, scripts de instalación ni código del proyecto analizado.

Excluye .env, dependencias, recuperaciones, fixtures, pruebas y artefactos. Las
exclusiones están declaradas en ../../.semgrepignore. El runner verifica que haya
archivos analizados en cada una de las tres raíces. El JSON conserva archivos
analizados, omisiones y errores; revisar las omisiones, no inferir cobertura completa.

La base develop todavía usa SDK 57; el SDK 58 y arquitectura local de Actividad 4 no
se copiaron. Una ejecución futura analizará el código que realmente esté en ese commit.

## Herramienta y procedencia verificadas

Semgrep CE 1.182.1, imagen oficial:

```text
semgrep/semgrep:1.182.1@sha256:451b3d875c00dac7ed5db5293e584a07de11449a409c10b3c2d2652f429630b6
```

Versión consultada en PyPI y digest del índice consultado en la API pública de
Docker Hub del namespace semgrep/semgrep. Esas comprobaciones identifican procedencia
y contenido fijado; no equivalen a verificar una firma de imagen ni a ejecutarla.
toolchain.json conserva versión, digest y fuentes. La versión observada debe coincidir.

Actions fijadas a SHA, comprobadas mediante git ls-remote contra los repositorios oficiales:

- actions/checkout v4.2.2: 11bd71901bbe5b1630ceea73d27597364c9af683.
- actions/upload-artifact v4.6.2: ea165f8d65b6e75b540449e92b4886f43607fa02.

No usa latest, reglas remotas, login, SEMGREP_APP_TOKEN ni plataforma alojada.
Métricas y comprobación automática de versión desactivadas. El runner retira el token
de Semgrep del entorno de su subproceso. GitHub descarga herramientas/acciones; no
se afirma que preparar el contenedor sea una operación sin red. El escaneo usa reglas
locales y no necesita servicios de La Pape ni valida secretos contra terceros.

## Reglas originales locales

No se copiaron packs de terceros. Las reglas originales están en rules/lapape.yml;
su licencia MIT se limita a esos archivos. No cambia la licencia de la aplicación.

| ID | Riesgo orientativo | Detección y límites |
|---|---|---|
| lapape.dynamic-code | CWE-95 | eval/new Function; señala API peligrosa, incluso si el argumento resulta constante |
| lapape.tls-validation-disabled | CWE-295 | rejectUnauthorized:false y bypass NODE_TLS_REJECT_UNAUTHORIZED; no todos los mecanismos TLS |
| lapape.request-data-in-sql | CWE-89 | Taint local de req.query/body/params.campo al primer argumento de query; no análisis completo interarchivo |
| lapape.request-data-in-shell | CWE-78 | Taint local a exec/execSync y llamadas miembro; puede requerir confirmar la identidad de la función |
| lapape.react-raw-html | CWE-79 | JSX dangerouslySetInnerHTML; revisión manual de saneamiento y procedencia, no XSS confirmado |
| lapape.weak-token-randomness | CWE-338 | Math.random asignado a nombres token/secret/otp; heurística, no todos los secretos ni usos indirectos |

ERROR y WARNING son niveles de regla, no una clasificación automática «crítico».
Todos los hallazgos de estas reglas bloquean. Revisar fuente, datos controlables,
alcance e impacto antes de clasificar una vulnerabilidad. No modificar producción
para silenciar alertas; registrar falsos positivos con justificación para revisión.
No se añadieron supresiones nosemgrep ni un baseline que esconda hallazgos existentes.

## Workflow y gates

../../.github/workflows/security-semgrep.yml se ejecuta en PR a develop/main, push a
esas ramas y workflow_dispatch. contents:read, sin credenciales persistidas por checkout,
sin pull_request_target, sin permisos de escritura ni cambios al CI original.

Primero ejecuta unit tests del gate; después fixtures reales; luego escanea las tres
raíces. Conserva artefactos incluso si un paso falla. El escaneo mantiene su resultado
fallido; no usa continue-on-error ni || true. La duración máxima del job es 15 minutos.
El resumen del CI original no se modifica: este workflow tiene resultado y resumen propios.

run.py utiliza semgrep scan --oss-only --strict --error y salidas JSON/SARIF. Bloquea
cualquier hallazgo, exit distinto de cero, errores reportados, versión incorrecta,
JSON/SARIF ausentes o inválidos y escaneo vacío/falta de una raíz. Registra SHA del
commit y hashes de reglas. No considera un fallo de instalación un análisis limpio.

Resultados bajo reportes/ci/semgrep (ya ignorado por Git): scan.json, scan.sarif,
scanner.log, status.json, summary.md y fixtures/verification.json. Si el ejecutable
no existe, solo pueden generarse estado/resumen de fallo y verificación incompleta;
no se fabrica un JSON/SARIF de escáner con cero hallazgos. Las omisiones o errores
previos a arrancar el escáner no se presentan como un escaneo de cero archivos exitoso.
Revisar los artefactos antes de compartirlos: JSON/SARIF/logs del escáner pueden
contener fragmentos de fuentes. El resumen evita incluir fragmentos de coincidencias.

## Reproducción

Con el contenedor fijado, desde la raíz de un clon Git convencional, por ejemplo en PowerShell:

```powershell
$image = 'semgrep/semgrep:1.182.1@sha256:451b3d875c00dac7ed5db5293e584a07de11449a409c10b3c2d2652f429630b6'
docker run --pull never --rm --network none -e PYTHONDONTWRITEBYTECODE=1 -v "${PWD}:/src" -w /src $image python3 -m unittest discover -s security/semgrep/tests -p 'test_*.py' -v
docker run --pull never --rm --network none -v "${PWD}:/src" -w /src $image python3 security/semgrep/verify.py
docker run --pull never --rm --network none -v "${PWD}:/src" -w /src $image python3 security/semgrep/run.py
```

La imagen debe estar descargada previamente por un operador autorizado; network none
impide descargarla desde dentro del contenedor y bloquea conexiones del análisis.
pull never evita una descarga automática desde el host al ejecutar estos comandos.
No ejecutar escaneos contra URLs del backend. En Actions se usa la misma imagen y
los mismos scripts, sin publicar datos en servicios de La Pape.
Si GitHub no puede iniciar el contenedor o completar checkout, no se garantiza un
artefacto descargable; ese fallo de infraestructura no acredita un análisis.

Las fixtures positivas y negativas son sintéticas y nunca se ejecutan. verify.py las
copia a un temporal fuera del repositorio para que las exclusiones no las oculten:

- Positiva: espera los seis IDs, archivos inspeccionados, JSON/SARIF y exit 1.
- Negativa: espera archivos inspeccionados, cero coincidencias, JSON/SARIF y exit 0.
- YAML inválido: espera fallo de configuración, no éxito. Registra qué artefactos
  pudo emitir el escáner, además del registro persistente del verificador.

## Resultado local real y pendientes

El 27 de octubre Docker Engine respondió con versión 29.2.0. Se ejecutó realmente
Semgrep CE 1.182.1 en el contenedor fijado: nueve pruebas auxiliares aprobadas, las
tres fixtures verificadas y 48 archivos examinados con cero coincidencias y cero
errores. La fixture positiva activó las seis reglas (exit 1); la segura no produjo
coincidencias (exit 0); el YAML inválido produjo exit 7. Se generaron JSON/SARIF en
los tres casos. No equivale a afirmar «cero vulnerabilidades».

Consultar [el informe vigente](RESULTADO-REAL-2026-10-27.md) para omisiones, alcance,
aislamiento y evidencia publicable. La ejecución local necesitó un montaje Git de
solo lectura para traducir rutas del worktree Windows a Linux. Los logs completos y
comandos del host permanecen locales. Los checks del PR acreditarán la ejecución remota.

## Interpretación académica

Semgrep CE aporta SAST basado en reglas y análisis local con limitaciones de flujo.
No acredita cobertura total de JS/TS/React Native, SCA completo, escaneo de secretos,
pinning, binarios nativos ni ejecución segura en dispositivo. Cero coincidencias
solo significa ausencia de coincidencias con estas reglas en los archivos analizados.
No es DAST: no envía tráfico ni prueba una app desplegada. Si la rúbrica exige ambos,
DAST debe prepararse por separado contra un entorno desechable autorizado.

La ejecución real local ya está documentada. Para la integración académica en CI
todavía falta Actions sobre un commit autorizado y conservar su enlace y artefactos.
La fecha será la real, no retroactiva al 22 de octubre.

## Alcance de publicación

Se propone mediante una rama independiente y PR hacia develop, sin merge automático.
Solo incluye .semgrepignore, el workflow independiente y los archivos SAST seleccionados.
Los logs, reportes crudos, comandos del host y evidencias de intentos fallidos quedan
locales y fuera del commit. resultado-local-publicable.json conserva un resumen sin
rutas personales, credenciales ni fragmentos de código. Los JSON/SARIF completos de
cada ejecución remota se conservan como artefactos de Actions durante 30 días.

Fuentes oficiales:

- [CE en CI](https://docs.semgrep.dev/deployment/oss-deployment).
- [CLI](https://docs.semgrep.dev/cli-reference).
- [Metadatos PyPI](https://pypi.org/pypi/semgrep/json).
- [Tag y digest de Docker Hub](https://hub.docker.com/v2/repositories/semgrep/semgrep/tags/1.182.1).
- [Checkout oficial](https://github.com/actions/checkout/tree/v4.2.2).
- [Upload Artifact oficial](https://github.com/actions/upload-artifact/tree/v4.6.2).
