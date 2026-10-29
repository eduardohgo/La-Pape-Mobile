# Actividad 4 — Evidencia de caja blanca del catálogo móvil

Fecha: 27 de octubre de 2026. Entrega: 29 de octubre de 2026.
Proyecto existente La Pape Mobile. Rama de trabajo: feature/pb03-migracion-identidad.

## 1. Objetivo y alcance

Evaluar la lógica interna implementada del catálogo MVVM/Clean mediante assertions,
dobles controlados y ejecución real de las capas de aplicación. No se crean reglas
comerciales, usuarios ni datos en Neon. No se modifican pantallas, hooks ni servicios
de producción en esta actividad. No hay solicitudes HTTP externas o al backend.

Se conservaron las 50 pruebas previas y se añadieron 20: diez de contratos/dominio,
siete de integración de capas, una adicional de Observer y dos de render SSR real.
Resultado final: **70 aprobadas, 0 fallidas, 0 omitidas y 0 canceladas**.
Los bucles de casos dentro de un test son assertions adicionales, no pruebas contadas
artificialmente como nuevos tests independientes.

## 2. Componentes evaluados y métodos

| Componente | Métodos/funciones | Evidencia |
|---|---|---|
| Modelos y contratos | CatalogProduct, CatalogCategory, CatalogProductDetail, DemoCatalogProduct; ProductNotFoundError | catalog-domain.test.cjs |
| Guardas de entrada en servicio | isCategoryResponse, isProductResponse, isCatalogProductDetailResponse, isDemoCatalogResponse, isDemoProductDetailResponse | catalog-domain.test.cjs y http.test.cjs |
| Casos de uso | loadCatalog, loadProduct | catalog-domain.test.cjs, catalog-architecture.test.cjs e integración |
| Repository HTTP | createHttpCatalogRepository, list, detail | catalog-architecture.test.cjs e integración |
| Factory y Singleton | createCatalogService, createHttpClient, createCatalogScope/getRepository | catalog-architecture.test.cjs y http.test.cjs |
| Control de presentación / ViewModels | createCatalogViewModel, createProductDetailViewModel, retry, cancel, getSnapshot | catalog-architecture.test.cjs e integración |
| Observer | subscribe y función de baja | catalog-architecture.test.cjs y catalog-integration.test.cjs |
| Hooks | useCatalogViewModel, useProductDetailViewModel | catalog-hooks-ssr.test.cjs: solo render inicial SSR |
| Búsqueda | filterCatalogProducts | catalog-search.test.cjs |

Los modelos TypeScript son tipos borrados al compilar: no se presentan como clases
con métodos de negocio inexistentes. Los datos válidos e inválidos se verifican en
las guardas runtime existentes del servicio, y los casos de uso se prueban con el
contrato Repository. No se afirma que el dominio revalide por sí solo todos los campos.
ProductNotFoundError sí es una clase ejecutada y comprobada.

Los ViewModels controlan la presentación en MVVM. No hay una clase Controller móvil
independiente ni se están acreditando controladores Express con estas pruebas.
Debe confirmarse que esta correspondencia satisface el término «controladores» de
la rúbrica; no se añaden clases vacías solo para coincidir con ese nombre.

## 3. Casos y resultados

| Archivo | Tests | Resultado | Casos comprobados |
|---|---:|---|---|
| http.test.cjs | 17 anteriores | 17 aprobados | Configuración, contratos, errores HTTP/red, timeout, cancelación y paginación |
| catalog-search.test.cjs | 9 anteriores | 9 aprobados | Búsqueda, normalización, filtros y ausencia de mutación |
| storefront-ux.test.cjs | 3 anteriores | 3 aprobados | Comprobaciones estáticas de texto y conexiones; no montaje ni E2E |
| catalog-architecture.test.cjs | 21 anteriores | 21 aprobados | Repository, Factory, Singleton, casos de uso, estados, Observer y cancelación |
| catalog-domain.test.cjs | 10 nuevos | 10 aprobados | Campos válidos/inválidos, UUID, imágenes NULL, MXN decimal, sobres, paginación, flags demo, errores y copias inmutables |
| catalog-integration.test.cjs | 8 nuevos | 8 aprobados | Siete integraciones entre capas y una prueba de baja durante notificación |
| catalog-hooks-ssr.test.cjs | 2 nuevos | 2 aprobados | Render inicial con React real, estado loading y ausencia de efectos/I/O |
| **Total** | **70** | **70 aprobados** | **50 conservados + 20 nuevos** |

Integración ejecutada:

```text
ViewModel -> caso de uso -> Repository HTTP -> servicio -> cliente HTTP
         <- datos/error <- Response JSON de transporte inyectado, sin red
Observer -> assertions de secuencia loading/loaded/error/not-found
```

Se comprueban páginas con cursor, resultado vacío, JSON inválido, UUID, respuesta
404, error 503 y recuperación, cancelación del AbortSignal real y supresión de una
respuesta tardía. Las pruebas previas incluyen respuestas fuera de orden, aislamiento
entre pantallas, doble suscripción, bajas idempotentes y 30 ciclos de suscripción/baja.
La prueba nueva retira otro listener durante una notificación y comprueba que no se
invoca después de su baja.

Estas son integraciones de componentes del frontend con transporte simulado, no
integraciones contra Neon ni una prueba móvil E2E. health.integration.cjs permanece
intacta, fuera de esta ejecución: inicia Express y no forma parte de npm test.

## 4. Hooks montados: evaluación honesta

Instalados: React 19.3.0 y react-dom 19.3.0. No se encontraron react-test-renderer,
Testing Library React Native/React, jsdom, happy-dom, linkedom ni react-reconciler.
React DOM cliente necesita un entorno DOM; Node por sí solo no lo proporciona.

Se usó renderToString de React DOM con los hooks reales, sin simular useEffect o
useSyncExternalStore. SSR ejecuta el render y getServerSnapshot, pero **no monta en
cliente, no ejecuta useEffect y no acredita unsubscribe al desmontar**. No se presenta
como montaje. Tampoco las pruebas estáticas de storefront son pruebas de montaje.

Montar hooks necesitará una herramienta/entorno de pruebas adicional compatible con
React 19.3 y SDK 58. Se propone evaluar la ruta oficial jest-expo + Testing Library
React Native, confirmar sus peer dependencies actuales y aprobar esa infraestructura
antes de instalarla. react-test-renderer está deprecado; no se instaló como atajo.
No se ha demostrado aquí la compatibilidad concreta de una combinación no instalada.

Pendientes de montaje real: efecto inicial, transición posterior al render, retry
mediante act, cambio de UUID, cleanup de efecto, baja automática de React y ciclo
Strict Mode. La máquina de estados y sus bajas sí tienen pruebas unitarias reales.

## 5. Ejecución reproducible

Desde la carpeta frontend:

```powershell
npm test
npm run test:coverage
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js . --max-warnings=0 --no-cache
git diff --check
```

No requieren instalación. El script de cobertura recompila primero con tsconfig.test.json
y usa node:test y cobertura V8 de Node v24.21.0. Si una prueba falla devuelve código
distinto de cero; no hay umbrales elegidos para maquillar el resultado ni ignores de
líneas de producción.

Artefactos generados y no versionados en coverage/caja-blanca:

- ejecucion.txt: nombres, resultados y tabla de cobertura de la ejecución.
- eventos.jsonl: eventos coverage/summary/fail emitidos por Node.
- resultado.json: comando, versiones, resultados, contadores, ramas/funciones sin
  ejecutar e inventario de archivos no medidos.

Estos tres son la evidencia vigente del comando. Los archivos lcov.info/pruebas.xml
que puedan quedar de la evaluación inicial del reporter no son salidas de la versión
final del script ni la evidencia utilizada por este informe.

TypeScript y ESLint finalizaron sin errores ni advertencias. La evidencia de consola
de esas verificaciones y la comprobación de protección se registra además en
local/caja-blanca-2026-10-27/verificacion.json. No se ejecutó el workflow remoto.

## 6. Cobertura real

| Alcance | Líneas | Ramas | Funciones |
|---|---:|---:|---:|
| Módulo features/catalogo ejecutado, incluidos hooks SSR | 178/182 = **97.80 %** | 68/69 = **98.55 %** | 29/32 = **90.63 %** |
| Conjunto compilado ejecutado: módulo + servicios, HTTP, configuración y búsqueda | 457/477 = **95.81 %** | 263/270 = **97.41 %** | 64/71 = **90.14 %** |
| Aplicación móvil global, pantallas y módulos nativos | **No medida** | **No medida** | **No medida** |

El 100 % de líneas anterior usaba otro alcance sin hooks: no es comparable
directamente con esta medición. No se promedian porcentajes por archivo: se suman
contadores cubiertos/totales de V8. Se midieron 12 archivos compilados; el inventario
contiene 42 fuentes TS/TSX (incluidas declaraciones) y enumera 30 sin medición. Esa
lista NO se transforma en un porcentaje global ni en cobertura cero inventada.

Se instrumenta JavaScript en .test-build, sin remapeo de source maps a TypeScript.
Los números de línea de resultado.json pertenecen a ese JavaScript. V8 puede mostrar
100 % de líneas y a la vez funciones sin invocar cuando se declaran en una sola línea;
se informan ambas métricas para no ocultarlo. Las interfaces y tipos borrados no
tienen ramas runtime. Los porcentajes no prueban por sí mismos la calidad de assertions.

## 7. Ramas, funciones y áreas todavía pendientes

| Código compilado | Pendiente observado | Tratamiento |
|---|---|---|
| hooks.js, líneas 12–13 y 21–22 | Inicio de carga y retorno del cleanup en efectos | Requiere montaje cliente; SSR no los ejecuta |
| composicion.js, función de línea 18 | Constructor del ámbito de aplicación con entorno Expo | Ámbitos inyectados sí probados; entorno real no manipulado |
| viewmodels.js, rama línea 34 | Fallback de count cuando el listener ya no está en el Map | No se corrompen privados para forzar cobertura; documentado como rama defensiva |
| servicio-catalogo.js, líneas/ramas 39, 87, 113–120 | data con ítem no objeto, UUID inválido en el servicio comercial, límite máximo de páginas y getCatalogService | Los casos de uso sí rechazan UUID; el límite de 100 páginas no se fuerza con solicitudes repetidas en esta ejecución |
| cliente-http.js, ramas 13, 24 y 63 | Query key inválida y caminos defensivos de aborto | Cancelación/timeout normales sí están cubiertos; revisar por separado |
| configuracion-api.js, getApiConfig | Lectura de entorno real | parseApiConfig sí probado con datos públicos sintéticos |
| servicio-salud-api.js, checkApiHealth | Función de conveniencia de salud | Contrato/cliente sí probados; no se inicia backend |
| Pantallas, navegación, Splash, vistas nativas | Render cliente, interacción, rendimiento y dispositivo | Fuera de esta cobertura; prueba manual/E2E futura |

No se instaló infraestructura para perseguir porcentajes ni se modificaron funciones
comerciales para volver accesibles ramas privadas. La lista detallada se conserva en
uncovered y unmeasuredSourceFiles de resultado.json.

## 8. Relación con la rúbrica de 1.5 puntos

| Requisito | Respaldo | Límite / decisión pendiente |
|---|---|---|
| Pruebas unitarias de lógica interna | Casos de uso, ViewModels, Observer, guardas y error de dominio con assertions | No son pruebas de controladores Express |
| Pruebas de integración | Recorrido real entre capas frontend con transporte inyectado | No equivalen a integración de servicios remotos ni E2E |
| Modelos | Tipos existentes, guardas runtime y preservación/inmutabilidad de datos | No existen clases de negocio que deban inventarse |
| Controladores en arquitectura MVVM | ViewModels ejercen control de estado/presentación | Confirmar que la equivalencia satisface el término académico |
| Ubicación /test | Pruebas conservadas en frontend/test, junto al package.json de la app | No hay /test raíz; confirmar si la ruta de la rúbrica es literal |
| Assertions y resultados | 70 aprobadas, trazas reproducibles y cobertura con contadores | Tres tests anteriores son estáticos y dos nuevos solo SSR |

La lógica interna del catálogo cuenta con respaldo unitario y de integración sólido.
No se declara automáticamente acreditado el total de 1.5 puntos: faltan la aceptación
de ViewModel como controlador y de la ubicación frontend/test, además del montaje
cliente si se exige evidenciar el ciclo React completo. La calificación corresponde
al evaluador; este informe no inventa un porcentaje global ni pruebas físicas.

## 9. Protección y verificaciones manuales

Se guardaron huellas de 351 archivos previos y copias de package.json y
tsconfig.test.json en local/caja-blanca-2026-10-27. Solo esos dos archivos existentes
se editaron para incluir las pruebas y el comando de cobertura. Las 50 pruebas previas,
el código de producción, estilos, rutas, entorno privado y lockfile se conservaron.
No hubo commits, cambios de rama, instalaciones, SQL ni operaciones sobre servicios.

Pendiente en iPhone: carga, búsqueda, filtros, detalle, regreso, imágenes nulas,
error/reintento, cambio rápido de producto y observación de posibles actualizaciones
tras salir. No se realizó prueba física ni medición de fugas de memoria nativa.

Fuentes técnicas consultadas:

- [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/).
- [Pruebas unitarias con Jest/Expo](https://docs.expo.dev/develop/unit-testing/).
- [Aviso oficial sobre react-test-renderer](https://react.dev/warnings/react-test-renderer).
- [Cobertura del runner de Node](https://nodejs.org/api/test.html#collecting-code-coverage).
