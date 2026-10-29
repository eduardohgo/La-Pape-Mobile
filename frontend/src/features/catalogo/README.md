# Catálogo móvil: MVVM y dependencias Clean

Actividad 4 de Desarrollo Móvil Integral, 29 de octubre de 2026.
Implementación local para revisión; no acredita todavía toda la rúbrica de pruebas.

## Recorrido real

```text
pantalla-catalogo / pantalla-detalle-producto (View, JSX y estilos conservados)
  -> presentacion/hooks.ts (ciclo de vida React)
  -> presentacion/viewmodels.ts (estado observable, retry, cancel)
  -> dominio/casos-uso.ts (cargar catálogo / consultar detalle por UUID)
  -> dominio/repositorio-catalogo.ts (puerto CatalogRepository)
  <- datos/repositorio-http.ts (adaptador HTTP)
  -> services/servicio-catalogo.ts -> services/http/cliente-http.ts
  -> API Express compartida existente

composicion.ts conecta las dependencias; no realiza I/O al importar o renderizar.
```

El dominio no importa React, fetch, Expo, configuración ni errores HTTP. Los modelos
conservan los campos actuales y los precios como texto MXN, sin recalcularlos.
El adaptador convierte HTTP 404 en ProductNotFoundError; las otras fallas llegan al
ViewModel, que publica únicamente estados genéricos, sin mensajes del servidor.
El servicio reexporta los tipos para conservar sus consumidores anteriores.

Los casos de uso ordenan una copia de las categorías y validan el UUID de detalle.
No ordenan ni alteran productos ni precios. Se crean copias inmutables de los datos
publicados por el ViewModel. La búsqueda existente sigue siendo una transformación
pura; query, filtros abiertos y modales son estado local de presentación.

## Patrones y alcance

| Patrón | Código | Aplicación comprobable |
|---|---|---|
| Repository | dominio/repositorio-catalogo.ts y datos/repositorio-http.ts | Puerto list/detail e implementación sobre el servicio existente. Permite repositorios simulados sin red. |
| Factory | createHttpClient, createCatalogService, createHttpCatalogRepository y funciones create*ViewModel | Construcción explícita con dependencias inyectadas; instancias independientes en pruebas. |
| Singleton | applicationScope.getRepository en composicion.ts | Un adaptador de lectura creado perezosamente por runtime de la aplicación. Nunca comparte productos, selección, solicitudes ni suscripciones de pantalla. |
| Observer | subscribe/getSnapshot en viewmodels.ts | Las pantallas reciben loading/loaded/error/not-found mediante useSyncExternalStore. unsubscribe retira la suscripción; cancel aborta la solicitud. |

createCatalogScope permite ámbitos aislados para pruebas sin resetear variables del
Singleton de producción. Un fallo al construir no queda cacheado. Los cambios del
entorno requieren recargar el runtime de Expo, igual que su configuración pública.
Inicio mantiene su hook existente; este refactor se limita a Catálogo y Detalle.

Cada pantalla tiene su propio ViewModel. Cambiar UUID crea otro ViewModel: no se
muestra el artículo anterior durante la nueva carga. Retry aborta la petición previa;
solo la solicitud vigente puede publicar resultados. Cancel y unsubscribe son
idempotentes. Una función suscrita varias veces recibe una notificación por cambio,
pero cada suscripción conserva su propia limpieza. Las funciones de suscripción y
lectura tienen identidad estable y el snapshot no cambia mientras no haya publicación.

El efecto React inicia la carga y cancela al desmontarse o cambiar el modelo; React
administra la baja del Observer. La secuencia setup/cleanup/setup permite reiniciar
el mismo ViewModel, compatible con la comprobación de efectos de Strict Mode.
No se inicia una solicitud desde el render ni desde el constructor del Singleton.

## Comportamiento conservado

- Comercial: GET /categories, GET /products con limit=50 y after, GET /products/:id.
- Demo: solo mediante la condición existente __DEV__ y EXPO_PUBLIC_CATALOG_MODE=demo.
  El adaptador deriva sus categorías; no mezcla ni usa demo como fallback comercial.
- UUID, SKU, marcas, descripciones, precios MXN e image_url=NULL mantienen su contrato.
- Vacío es loaded con productos vacíos; no equivale a un error. El retry sigue
  conectado a los avisos existentes y las ilustraciones continúan en ProductVisual.
- Navegación, textos, estilos, Splash, autenticación y botones futuros no se rediseñan.
- La finalización de una carga aborta solicitudes hermanas pendientes si una lectura
  paralela falla. No se cachean productos, sesiones ni datos personales en el Singleton.

## Pruebas y límites

Desde frontend:

```powershell
npm test
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js . --max-warnings=0 --no-cache
node --test --experimental-test-coverage '--test-coverage-include=.test-build/features/catalogo/**/*.js' test/catalog-architecture.test.cjs
```

catalog-architecture.test.cjs ejecuta adaptadores, fábricas, ámbitos Singleton,
casos de uso y ViewModels con assertions y dobles sin red. Incluye vacío, fallas,
not-found, reintentos, UUID inválido, cancelación, respuestas fuera de orden,
suscripciones duplicadas, bajas repetidas e independencia entre pantallas.
Los scripts test y test:ci incluyen la suite nueva sin instalar dependencias.

Las pruebas storefront-ux existentes siguen siendo comprobaciones estáticas de
código; se actualizaron sus referencias porque la selección de modo y las llamadas
HTTP salieron de las pantallas. No son pruebas de render ni E2E.

Para completar el criterio de caja blanca falta acordar evidencia/cobertura de
ramas y su umbral, pruebas de hooks montados y la correspondencia requerida entre
ViewModels/controladores/modelos y la rúbrica. Los modelos actuales son tipos y
contratos, no clases con reglas comerciales inventadas. No se probaron controladores
del backend en esta actividad ni se acredita por ello el criterio completo.

Verificación manual pendiente en iPhone: catálogo completo, búsqueda y filtros,
detalle desde Inicio y Catálogo, regreso, imagen nula, error/reintento y navegación
rápida entre artículos. Las pruebas de ViewModel no sustituyen esa ejecución física
ni una medición de memoria en dispositivo.

Referencias: [React useSyncExternalStore](https://react.dev/reference/react/useSyncExternalStore)
y [Expo SDK 58](https://docs.expo.dev/versions/v58.0.0/).
