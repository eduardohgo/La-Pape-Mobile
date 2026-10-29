# Archivos propuestos para revisión y publicación posterior

Esta es una lista explícita, no una orden de publicación. No se ha hecho commit, push, PR ni merge.

## Cambios frontend respecto de la base local 14a33cd

Para reproducir desde el repositorio existente se necesita tanto la migración SDK 58 pendiente de commit como la arquitectura y sus pruebas. No basta con publicar solamente documentos o tests: el lockfile y las fuentes correspondientes deben coincidir. Revisar estos 26 archivos uno por uno:

- [frontend/package-lock.json](../../frontend/package-lock.json)
- [frontend/package.json](../../frontend/package.json)
- [frontend/scripts/test-coverage.cjs](../../frontend/scripts/test-coverage.cjs)
- [frontend/src/components/navegacion/pestanas-app.tsx](../../frontend/src/components/navegacion/pestanas-app.tsx)
- [frontend/src/components/navegacion/pestanas-app.web.tsx](../../frontend/src/components/navegacion/pestanas-app.web.tsx)
- [frontend/src/features/catalogo/README.md](../../frontend/src/features/catalogo/README.md)
- [frontend/src/features/catalogo/composicion.ts](../../frontend/src/features/catalogo/composicion.ts)
- [frontend/src/features/catalogo/datos/repositorio-http.ts](../../frontend/src/features/catalogo/datos/repositorio-http.ts)
- [frontend/src/features/catalogo/dominio/casos-uso.ts](../../frontend/src/features/catalogo/dominio/casos-uso.ts)
- [frontend/src/features/catalogo/dominio/modelos.ts](../../frontend/src/features/catalogo/dominio/modelos.ts)
- [frontend/src/features/catalogo/dominio/repositorio-catalogo.ts](../../frontend/src/features/catalogo/dominio/repositorio-catalogo.ts)
- [frontend/src/features/catalogo/presentacion/hooks.ts](../../frontend/src/features/catalogo/presentacion/hooks.ts)
- [frontend/src/features/catalogo/presentacion/viewmodels.ts](../../frontend/src/features/catalogo/presentacion/viewmodels.ts)
- [frontend/src/hooks/use-theme.ts](../../frontend/src/hooks/use-theme.ts)
- [frontend/src/pantallas/pantalla-catalogo.tsx](../../frontend/src/pantallas/pantalla-catalogo.tsx)
- [frontend/src/pantallas/pantalla-detalle-producto.tsx](../../frontend/src/pantallas/pantalla-detalle-producto.tsx)
- [frontend/src/pantallas/pantalla-inicio.tsx](../../frontend/src/pantallas/pantalla-inicio.tsx)
- [frontend/src/services/servicio-catalogo.ts](../../frontend/src/services/servicio-catalogo.ts)
- [frontend/test/INFORME-CAJA-BLANCA-2026-10-27.md](../../frontend/test/INFORME-CAJA-BLANCA-2026-10-27.md)
- [frontend/test/catalog-architecture.test.cjs](../../frontend/test/catalog-architecture.test.cjs)
- [frontend/test/catalog-domain.test.cjs](../../frontend/test/catalog-domain.test.cjs)
- [frontend/test/catalog-hooks-ssr.test.cjs](../../frontend/test/catalog-hooks-ssr.test.cjs)
- [frontend/test/catalog-integration.test.cjs](../../frontend/test/catalog-integration.test.cjs)
- [frontend/test/storefront-ux.test.cjs](../../frontend/test/storefront-ux.test.cjs)
- [frontend/test/support/coverage-reporter.cjs](../../frontend/test/support/coverage-reporter.cjs)
- [frontend/tsconfig.test.json](../../frontend/tsconfig.test.json)

## Expediente académico nuevo

- [docs/actividad4-desarrollo-movil-2026-10-29/ARCHIVOS-PARA-REVISION.md](../../docs/actividad4-desarrollo-movil-2026-10-29/ARCHIVOS-PARA-REVISION.md)
- [docs/actividad4-desarrollo-movil-2026-10-29/ARQUITECTURA-Y-PATRONES.md](../../docs/actividad4-desarrollo-movil-2026-10-29/ARQUITECTURA-Y-PATRONES.md)
- [docs/actividad4-desarrollo-movil-2026-10-29/GUIA-DEMOSTRACION.md](../../docs/actividad4-desarrollo-movil-2026-10-29/GUIA-DEMOSTRACION.md)
- [docs/actividad4-desarrollo-movil-2026-10-29/MANIFIESTO-ARCHIVOS.json](../../docs/actividad4-desarrollo-movil-2026-10-29/MANIFIESTO-ARCHIVOS.json)
- [docs/actividad4-desarrollo-movil-2026-10-29/MATRIZ-RUBRICA.md](../../docs/actividad4-desarrollo-movil-2026-10-29/MATRIZ-RUBRICA.md)
- [docs/actividad4-desarrollo-movil-2026-10-29/README.md](../../docs/actividad4-desarrollo-movil-2026-10-29/README.md)
- [docs/actividad4-desarrollo-movil-2026-10-29/VALIDACION-IPHONE.md](../../docs/actividad4-desarrollo-movil-2026-10-29/VALIDACION-IPHONE.md)
- [docs/actividad4-desarrollo-movil-2026-10-29/evidencias/ejecucion-frontend.txt](../../docs/actividad4-desarrollo-movil-2026-10-29/evidencias/ejecucion-frontend.txt)
- [docs/actividad4-desarrollo-movil-2026-10-29/evidencias/resultados-automaticos.json](../../docs/actividad4-desarrollo-movil-2026-10-29/evidencias/resultados-automaticos.json)

## Código de apoyo ya presente en la base

No necesita duplicarse: rutas bajo frontend/src/app, componentes compartidos, assets, cliente HTTP, configuración pública de API, búsqueda, app.json, tsconfig.json y eslint.config.js. Los enlaces del README y la matriz llevan a esas fuentes. Una copia aislada del expediente permite leer evidencia, pero para ejecutar pruebas hace falta el repositorio y los cambios frontend listados.

## Exclusiones de la propuesta

No publicar backend ni su .env.example, migración 003, documentos de identidad, catálogos comerciales, frontend/local, recuperaciones, node_modules, .test-build, coverage, archivos .env, credenciales o configuraciones privadas. Las dos evidencias bajo este expediente son copias explícitas revisadas, no una inclusión masiva de carpetas locales. No usar git add . sobre el trabajo mezclado.

Esta selección no altera la rama actividad4-ci-cd de otra asignatura. Antes de un commit futuro, revisar el diff y el contenido de cada archivo y resolver el destino Git contigo; esta actividad no crea ni cambia ramas.
