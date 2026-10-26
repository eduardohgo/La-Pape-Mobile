# Actividad 4 de La Pape Mobile

Esta carpeta contiene los scripts y evidencias del caso de integración continua y liberación. El PDF académico, su portada y la rúbrica de la docente se entregan por separado. El informe Markdown conserva el contenido técnico y enlaza las fuentes públicas; las capturas y los bundles no forman parte de este commit.

## Acceso directo

- [Informe editable](informe.md).
- [Matriz complementaria](matriz-14-criterios.md).
- [Lista completa de archivos](ARCHIVOS-PUBLICADOS.md).
- [Preparación del entorno](scripts/preparar-entorno.mjs).
- [Orquestador de verificaciones y exportaciones](scripts/verificar-local.mjs).
- [Aceptación técnica y regresión](scripts/aceptacion-regresion.test.mjs).
- [Rendimiento y esfuerzo exclusivamente locales](scripts/carga-local.mjs).
- [Preparación del manifiesto de liberación](scripts/preparar-liberacion.mjs).
- [Ejemplo YAML inactivo](config/liberacion-local.ejemplo.yml) y [perfil EAS conceptual](config/eas.ejemplo.json).
- [Workflow CI existente, sin modificar](../../.github/workflows/ci.yml).

## Reproducir el entorno y las comprobaciones

Usar Node >=22.13 y npm. Recomiendo Node 22 para paridad con el CI. Las mediciones históricas locales usaron Node 24.21.0 y Windows. Ejecutar desde la raíz del repositorio, preferentemente en una copia limpia sin archivos .env privados:

```powershell
node docs/actividad4-ci-cd/scripts/preparar-entorno.mjs --comprobar
node docs/actividad4-ci-cd/scripts/preparar-entorno.mjs --instalar
```

El primer comando solo valida runtime y locks. El segundo ejecuta npm ci --no-audit --no-fund en backend y frontend; necesita acceso al registro npm e instala únicamente los locks existentes. No copia .env, no genera credenciales ni inicia servicios. Cada aplicación conserva su package.json y lock independientes.

Para ejecutar las comprobaciones originales sin repetir carga ni exportar bundles:

```powershell
cd backend
npm run check
npm run test:ci
cd ../frontend
npm run lint -- --no-cache
npx --no-install tsc --noEmit
npm run test:ci
npm run test:integration:ci
node --test ../docs/actividad4-ci-cd/scripts/aceptacion-regresion.test.mjs
cd ..
node --test scripts/ci/test/reportes.test.mjs
```

Las pruebas de frontend compilan antes los servicios en .test-build. La aceptación A1/A2 y las regresiones R1/R2 son técnicas y locales, no E2E de interfaz. El código backend utiliza configuración ficticia o repositorios simulados en sus tests; esta entrega no conecta a Neon.

Para reproducir el ensayo completo de la actividad, incluyendo exportaciones Android/iOS y una única carga limitada:

```powershell
node docs/actividad4-ci-cd/scripts/verificar-local.mjs
node docs/actividad4-ci-cd/scripts/preparar-liberacion.mjs
```

El orquestador fija cwd según componente y conserva logs/XML. Su entorno no hereda DATABASE_URL ni tokens y configura EXPO_NO_DOTENV=1. Compila bundles Hermes; no produce APK/IPA firmado. Los artefactos generados son locales, se ignoran por Git y deben existir antes de preparar el manifiesto. No se ejecuta EAS ni se publica la aplicación.

Cada nueva ejecución reemplaza sus resultados; conservar copias fuera de la selección pública si se necesitan comparaciones. El registro histórico ejecuciones.json conserva un fallo del primer evaluador de carga; reintento-carga.json y carga-local.json acreditan la corrección y reintento. No se presenta ese primer intento como exitoso.

## Límites del ensayo de carga

```powershell
node docs/actividad4-ci-cd/scripts/carga-local.mjs
```

No acepta URL, host ni concurrencia por argumentos o variables de entorno: crea sus propios listeners en 127.0.0.1 con puerto efímero y catálogo deshabilitado. Máximo 77 solicitudes, concurrencia 2, timeout de 1 s por solicitud y plazo global de 15 s. Usa redirect: error y no carga dotenv. La fase de esfuerzo reduce el límite del listener a 10 solicitudes por segundo para observar 429 y recuperación. No mide saturación máxima, no dirige carga a Neon, Render o producción y no debe modificarse para apuntar a servicios públicos.

## Evidencia disponible

Las ejecuciones históricas locales acreditan 70 pruebas de backend, 29 de frontend, una integración HTTP, 11 de herramientas CI y cuatro nuevas de aceptación/regresión, identificadas por separado. Los JSON de carga conservan muestras y percentiles originales; no se calcularon porcentajes de cobertura o disponibilidad de producción.

- [Metadatos de Actions](evidencias/github-actions.json), [extracto literal remoto](evidencias/github-actions-extracto.log) y [procedencia](evidencias/github-actions-procedencia.json). La consulta inicial de metadatos y la posterior descarga del log son momentos diferentes.
- [Ejecución CI real 39842793140](https://github.com/eduardohgo/La-Pape-Mobile/actions/runs/39842793140): previa a esta publicación, asociada al PR 128. Los scripts nuevos de esta carpeta no se han ejecutado en Actions.
- [Carga local](evidencias/carga-local.json), [primer intento](evidencias/carga-local-intento1.json) y [comparación](evidencias/revision-final/rendimiento-comparacion.json).
- [Normalización de rutas personales](evidencias/normalizacion-publica.json): los XML y ejecuciones.json preservan nombres de casos, fechas, duraciones y resultados; solo se sustituyeron rutas del equipo y el nombre absoluto del ejecutable. Los originales permanecen fuera de Git.
- [DeepWiki](https://deepwiki.com/eduardohgo/La-Pape-Mobile) y [contraste de versión](evidencias/revision-final/deepwiki-estado.json): la wiki documenta main f197a73c y no el develop 14a33cd auditado.

## Auditoría de la selección

```powershell
node docs/actividad4-ci-cd/scripts/normalizar-evidencias.mjs
node docs/actividad4-ci-cd/scripts/auditar-entrega.mjs
node docs/actividad4-ci-cd/scripts/auditar-entrega.mjs --indice
```

La normalización sustituye únicamente rutas del equipo en los XML y ejecuciones.json; conserva originales en local-publicacion, ignorado por Git. Después, la auditoría revisa la lista explícita, patrones de secretos y datos personales, enlaces locales y límites de carga, y guarda un reporte. Con --indice comprueba además que el índice Git contenga exactamente esa selección y respete sus bytes, sin reescribir el reporte. No ejecutan carga, builds o despliegues.

.gitignore utiliza exclusión por defecto: solo admite los archivos enumerados en config/archivos-publicables.json. La carpeta local-publicacion, los PDFs, imágenes, rúbrica, respaldos, node_modules y artefactos no se publican. El YAML es un ejemplo documental fuera de .github/workflows, con permisos de lectura; el perfil EAS solo contiene preview y example.invalid. Publicar esta rama no los activa.

Quedan por implementar aceptación E2E con puerta remota, informes dedicados de análisis, una línea base estable de rendimiento, esfuerzo de capacidad y documentación DeepWiki de la misma versión. CD, staging, producción y monitoreo permanente siguen propuestos; no se acreditan como despliegues reales.

[Verificación de preparación de la entrega](evidencias/verificacion-entrega.json): distingue las comprobaciones ejecutadas para publicar de las pruebas históricas. No acredita nuevos despliegues ni ejecución remota de los scripts añadidos.
