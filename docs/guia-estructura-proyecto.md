# Guía de estructura de La Pape Mobile

Esta guía te ayuda a encontrar el código y entender cómo se relacionan sus
partes. La reorganización se hizo exclusivamente en el proyecto local. Se
conservaron las pantallas, datos, navegación, dependencias y comportamiento.
No se realizaron operaciones de Git, GitHub o GitHub Projects, ni cambios en
Neon, migraciones, credenciales o precios.

## 1. Las tres carpetas principales

| Carpeta | Para qué sirve |
|---|---|
| `frontend/` | La aplicación que ves en Expo Go: pantallas, navegación, componentes y cliente HTTP. |
| `backend/` | La API Express: recibe peticiones, valida parámetros y consulta PostgreSQL. |
| `docs/` | Explicaciones y evidencia técnica. No es código que se ejecute en la app. |

Cada aplicación conserva su propio `package.json`, lock y dependencias.
La app no conoce la contraseña de Neon: solo conoce la dirección pública de
Express. Las credenciales permanecen en el entorno privado del backend.

## 2. Estructura anterior y nueva

Antes, las pantallas estaban completas dentro de las rutas y algunos módulos
tenían nombres genéricos o heredados de la plantilla:

```text
frontend/src/
  app/(tabs)/index.tsx, explore.tsx
  app/products/[id].tsx
  components/home/, shop/, ui/
  components/app-tabs.tsx, animated-icon.tsx, ...
  hooks/use-home-products.ts
  config/env.ts
  services/catalog.service.ts, health.service.ts
  services/http/client.ts, errors.ts
  utils/catalog-search.ts
  features/catalog/demo-products.ts
backend/src/
  app.js, server.js
  catalog/catalog.repository.js
  config/env.js
  controllers/health.controller.js
  routes/health.routes.js, catalog.routes.js, demo-catalog.routes.js
  services/health.service.js
  middlewares/errors.js
  db/pool.js
```

Ahora las rutas están separadas de las pantallas y los módulos son más fáciles
de identificar:

```text
La-Pape-Mobile/
  frontend/
    src/
      app/
        _layout.tsx
        (tabs)/_layout.tsx, index.tsx, explore.tsx
        products/[id].tsx
      pantallas/
        pantalla-inicio.tsx
        pantalla-catalogo.tsx
        pantalla-detalle-producto.tsx
      components/
        arranque/splash-animado.tsx, .web.tsx, .module.css
        catalogo/componentes-catalogo.tsx
        compartidos/iconos-papeleria.tsx, ilustraciones-papeleria.tsx
        diagnostico/comprobacion-api.tsx
        navegacion/pestanas-app.tsx, .web.tsx
        plantilla/enlace-externo.tsx, texto-tematico.tsx, ...
      hooks/use-productos-inicio.ts, use-theme.ts, use-color-scheme.ts, .web.ts
      config/configuracion-api.ts
      services/servicio-catalogo.ts, servicio-salud-api.ts
        http/cliente-http.ts, errores-http.ts
      utils/busqueda-catalogo.ts
      features/catalogo/productos-demo-referencia.ts
      constants/theme.ts
      global.css
    assets/
    test/
    scripts/
    package.json, package-lock.json, app.json, tsconfig.json, ...
  backend/
    src/
      app.js, server.js
      config/variables-entorno.js
      controllers/controlador-salud.js
      routes/rutas-salud.js, rutas-catalogo.js, rutas-catalogo-demo.js
      services/servicio-salud.js
      repositories/repositorio-catalogo.js
      middlewares/manejo-errores.js
      db/conexion-postgres.js
    db/queries/, migrations/, validation/
    scripts/
    test/
    package.json, package-lock.json, ...
  docs/
    guia-estructura-proyecto.md
    otros informes de las etapas anteriores
  README.md
```

Las extensiones abreviadas en el árbol representan archivos completos, por
ejemplo `splash-animado.web.tsx`. No hay carpetas de una segunda app o backend.

## 3. Dónde estudiar cada pantalla

| Pantalla | Implementación | Archivo de ruta conservado | Dirección |
|---|---|---|---|
| Inicio | `frontend/src/pantallas/pantalla-inicio.tsx` | `frontend/src/app/(tabs)/index.tsx` | `/` |
| Catálogo | `frontend/src/pantallas/pantalla-catalogo.tsx` | `frontend/src/app/(tabs)/explore.tsx` | `/explore` |
| Detalle | `frontend/src/pantallas/pantalla-detalle-producto.tsx` | `frontend/src/app/products/[id].tsx` | `/products/<uuid>` |

Los tres archivos de ruta siguen existiendo: ahora importan y exportan la
pantalla correspondiente. Expo Router sigue reconociendo las mismas URL.
`[id]` significa que el UUID recibido en la dirección identifica el producto.

En **Inicio** encontrarás el encabezado, banner, atajos de categorías y
destacados. `use-productos-inicio.ts` consulta el servicio compartido y entrega
sus primeros cuatro artículos, con estados de carga, error y reintento.

En **Catálogo** encontrarás las tarjetas, texto de búsqueda, categoría
seleccionada, modal de filtros y estados de carga/error/vacío. Las tarjetas
abren Detalle por UUID. El botón «Ver detalle» no realiza una compra.

En **Detalle** encontrarás la consulta individual, imagen o ilustración,
nombre, categoría, SKU, precio, moneda y descripción cuando la respuesta la
incluye. Conserva carga, error, producto no encontrado, reintento y regreso
explícito a Catálogo. No se añadieron compras ni variantes inventadas.

## 4. Componentes, búsqueda y conexión HTTP

`components/` contiene partes visuales que las pantallas utilizan. No es una
carpeta de rutas:

- **`arranque/`**: animación de inicio conservada de Expo, con una implementación
  nativa y otra web. La versión web conserva su archivo CSS asociado.
- **`catalogo/`**: `componentes-catalogo.tsx` reúne encabezado, presentación de
  productos, estados, modales y barra inferior de Catálogo. Las tarjetas propias
  de Catálogo siguen dentro de `pantalla-catalogo.tsx`; no se cambiaron solo para
  dividir archivos. Inicio conserva sus componentes internos ya funcionales.
- **`compartidos/`**: iconos y selección de ilustraciones originales de papelería.
  Los SVG y fotografías se conservan en `frontend/assets/`; las imágenes no
  fueron movidas ni reemplazadas por fotografías falsas.
- **`navegacion/`**: configuración de pestañas nativas y web. Las barras propias
  de Inicio y Catálogo siguen gestionadas por sus componentes existentes.
- **`diagnostico/`**: comprobación manual de salud de API, conservada aunque ya
  no aparece en la pantalla normal de Inicio.
- **`plantilla/`**: piezas heredadas de Expo, identificadas y conservadas.

La búsqueda está en `utils/busqueda-catalogo.ts`. Filtra los productos ya
cargados por nombre, categoría y SKU, ignora mayúsculas y acentos y combina
las palabras con la categoría seleccionada. No consulta un endpoint nuevo ni
modifica los artículos originales. El estado de filtros y los chips están en
`pantalla-catalogo.tsx`.

Los servicios se organizan de esta manera:

| Archivo | Responsabilidad |
|---|---|
| `config/configuracion-api.ts` | Validar origen, entorno y timeout públicos. El alias `@/` continúa apuntando a `src/`. |
| `services/http/cliente-http.ts` | Ejecutar `fetch` GET JSON, timeout y cancelación mediante `AbortController`. |
| `services/http/errores-http.ts` | Representar errores de configuración, red, timeout, cancelación, HTTP y respuesta inválida. |
| `services/servicio-catalogo.ts` | Consultar categorías, listado y detalle; validar respuestas y manejar la paginación comercial. |
| `services/servicio-salud-api.ts` | Consumir y validar el contrato `GET /health`. |
| `hooks/use-productos-inicio.ts` | Organizar la carga y reintento de destacados en Inicio. |

Los estados visuales no reemplazan una respuesta fallida con productos escritos
a mano. `features/catalogo/productos-demo-referencia.ts` es un prototipo antiguo
sin consumidores en las pantallas, conservado para estudiar su evolución.

## 5. Dónde estudiar el backend

| Carpeta o archivo | Responsabilidad |
|---|---|
| `src/server.js` | Punto de entrada: carga configuración, abre el puerto y controla el cierre del servidor. |
| `src/app.js` | Construye Express, aplica Helmet, CORS, límites y JSON; monta las rutas y el manejo de errores. Importarlo no abre un puerto. |
| `src/config/variables-entorno.js` | Valida entorno, host, puerto, flags, CORS y configuración PostgreSQL/TLS. |
| `src/routes/` | Define las URL HTTP y valida UUID, filtros, cursor y límite. |
| `src/controllers/controlador-salud.js` | Prepara la respuesta HTTP de salud usando el servicio. |
| `src/services/servicio-salud.js` | Construye el resultado de salud, sin acceso a PostgreSQL. |
| `src/repositories/repositorio-catalogo.js` | Carga consultas SQL y obtiene filas mediante un pool `pg` y transacciones de solo lectura. |
| `src/db/conexion-postgres.js` | Factory independiente de pool, sin conexión al construirse. Se conserva y prueba; el repositorio del catálogo utiliza su propio pool. |
| `src/middlewares/manejo-errores.js` | Responde 404 y errores públicos sin mostrar credenciales ni detalles internos. |
| `db/queries/` | Consultas existentes de categorías, listado, detalle y demostración. |
| `db/migrations/` | Historial SQL de esquema/demostración; no se ejecuta al iniciar Express. |
| `db/validation/` | SQL de comprobación de esquema e integridad; tampoco se ejecuta al arrancar. |
| `db/catalog-review.json` | Manifiesto de candidatos y decisiones pendientes de revisión comercial. |
| `scripts/` | Validación local del manifiesto y generación de SQL revisable. |
| `test/` | Pruebas con configuración ficticia, repositorios simulados y HTTP local. |

La ruta de salud tiene controlador y servicio propios. Las rutas de catálogo
actuales llaman directamente al repositorio; no se crearon controladores o
servicios duplicados para forzar una arquitectura distinta.

Los endpoints conservados son `GET /health`, `GET /categories`,
`GET /products` y `GET /products/:id`. Las rutas demo son
`GET /demo/products` y `GET /demo/products/:id`, disponibles únicamente con los
flags existentes en desarrollo. No se añadió el prefijo `/api` ni escritura.

La configuración del backend usa las variables privadas existentes; esta guía
no imprime sus valores. TLS conserva verificación de certificado. El SQL sigue
en su ubicación original y el repositorio lo localiza mediante
`new URL('../../db/queries/...', import.meta.url)`; moverlo a `repositories/`
conserva la misma profundidad y no cambia esa referencia relativa.

## 6. El recorrido de una petición

1. El usuario abre Catálogo en Expo Go.
2. `pantalla-catalogo.tsx` pide artículos a `servicio-catalogo.ts`. El modo
   existente decide entre el catálogo comercial y la demostración de desarrollo.
3. El servicio usa `cliente-http.ts`, que obtiene la URL pública validada en
   `configuracion-api.ts` y envía una petición a Express.
4. `app.js` aplica los middleware y la ruta correspondiente valida los parámetros.
5. `repositorio-catalogo.js` lee la consulta SQL existente y usa la configuración
   privada de PostgreSQL para solicitar únicamente lecturas a Neon.
6. Express devuelve JSON. El servicio frontend valida sus campos antes de
   entregar los artículos a la pantalla.
7. La pantalla muestra datos reales recibidos, o un estado de error/vacío;
   búsqueda y filtros se aplican localmente a la lista cargada.
8. Al abrir una tarjeta, el UUID llega a `/products/<uuid>` y Detalle solicita
   ese producto a la API. El botón de regreso conserva `/explore`.

`GET /health` sigue un camino más corto: ruta → controlador → servicio → JSON.
No verifica ni consulta Neon. Las comprobaciones locales de esta reorganización
no cambian información de la base de datos.

## 7. Todos los movimientos y renombrados

Las rutas de esta tabla son relativas a `frontend/` o `backend/`, según el
encabezado. Los tres primeros cambios son **extracciones**: el archivo de ruta
anterior se conserva como entrada de Expo Router y su implementación se mueve
al archivo nuevo.

### Frontend

| Nombre anterior | Nombre nuevo | Función |
|---|---|---|
| `src/app/(tabs)/index.tsx` | `src/pantallas/pantalla-inicio.tsx` | Implementación de Inicio; ruta original conservada. |
| `src/app/(tabs)/explore.tsx` | `src/pantallas/pantalla-catalogo.tsx` | Implementación de Catálogo; ruta original conservada. |
| `src/app/products/[id].tsx` | `src/pantallas/pantalla-detalle-producto.tsx` | Implementación de Detalle; ruta original conservada. |
| `src/components/home/home-icon.tsx` | `src/components/compartidos/iconos-papeleria.tsx` | Iconos compartidos de papelería. |
| `src/components/home/stationery-art.tsx` | `src/components/compartidos/ilustraciones-papeleria.tsx` | Ilustraciones y selección por producto/categoría. |
| `src/components/shop/shop-ui.tsx` | `src/components/catalogo/componentes-catalogo.tsx` | Encabezado, estados, modales y componentes de Catálogo/Detalle. |
| `src/hooks/use-home-products.ts` | `src/hooks/use-productos-inicio.ts` | Carga y reintento de destacados. |
| `src/utils/catalog-search.ts` | `src/utils/busqueda-catalogo.ts` | Búsqueda y combinación de categoría. |
| `src/config/env.ts` | `src/config/configuracion-api.ts` | Validación de configuración pública. |
| `src/services/catalog.service.ts` | `src/services/servicio-catalogo.ts` | Consultas y contratos de catálogo/detalle. |
| `src/services/health.service.ts` | `src/services/servicio-salud-api.ts` | Comprobación de salud HTTP. |
| `src/services/http/client.ts` | `src/services/http/cliente-http.ts` | Cliente GET JSON, timeout y cancelación. |
| `src/services/http/errors.ts` | `src/services/http/errores-http.ts` | Tipos de error HTTP. |
| `src/components/app-tabs.tsx` | `src/components/navegacion/pestanas-app.tsx` | Pestañas nativas. |
| `src/components/app-tabs.web.tsx` | `src/components/navegacion/pestanas-app.web.tsx` | Pestañas web. |
| `src/components/animated-icon.tsx` | `src/components/arranque/splash-animado.tsx` | Animación de arranque nativa. |
| `src/components/animated-icon.web.tsx` | `src/components/arranque/splash-animado.web.tsx` | Animación de arranque web. |
| `src/components/animated-icon.module.css` | `src/components/arranque/splash-animado.module.css` | Estilos de la animación web. |
| `src/components/api-health-check.tsx` | `src/components/diagnostico/comprobacion-api.tsx` | Comprobador conservado de API, sin uso en Inicio actual. |
| `src/components/external-link.tsx` | `src/components/plantilla/enlace-externo.tsx` | Enlaces externos de la plantilla, usados por navegación web. |
| `src/components/themed-text.tsx` | `src/components/plantilla/texto-tematico.tsx` | Texto con tema, usado por navegación web y plantilla. |
| `src/components/themed-view.tsx` | `src/components/plantilla/vista-tematica.tsx` | Contenedor con tema. |
| `src/components/hint-row.tsx` | `src/components/plantilla/fila-ayuda.tsx` | Pieza de ayuda heredada, sin consumidor actual. |
| `src/components/web-badge.tsx` | `src/components/plantilla/insignia-expo.tsx` | Insignia heredada, sin consumidor actual. |
| `src/components/ui/collapsible.tsx` | `src/components/plantilla/seccion-desplegable.tsx` | Sección desplegable heredada, sin consumidor actual. |
| `src/features/catalog/demo-products.ts` | `src/features/catalogo/productos-demo-referencia.ts` | Prototipo histórico; no reemplaza la API. |

### Backend

| Nombre anterior | Nombre nuevo | Función |
|---|---|---|
| `src/config/env.js` | `src/config/variables-entorno.js` | Validación privada de entorno y TLS. |
| `src/catalog/catalog.repository.js` | `src/repositories/repositorio-catalogo.js` | Consultas parametrizadas de catálogo, solo lectura. |
| `src/controllers/health.controller.js` | `src/controllers/controlador-salud.js` | Respuesta HTTP de salud. |
| `src/routes/health.routes.js` | `src/routes/rutas-salud.js` | Endpoint de salud. |
| `src/routes/catalog.routes.js` | `src/routes/rutas-catalogo.js` | Categorías, listado y detalle comercial. |
| `src/routes/demo-catalog.routes.js` | `src/routes/rutas-catalogo-demo.js` | Listado y detalle de demostración. |
| `src/services/health.service.js` | `src/services/servicio-salud.js` | Resultado de salud, sin base de datos. |
| `src/middlewares/errors.js` | `src/middlewares/manejo-errores.js` | Manejo centralizado de errores. |
| `src/db/pool.js` | `src/db/conexion-postgres.js` | Factory independiente de pool. |

Se crearon las carpetas `frontend/src/pantallas/`,
`frontend/src/components/{arranque,catalogo,compartidos,diagnostico,navegacion,plantilla}/`,
`frontend/src/features/catalogo/` y `backend/src/repositories/`.
Son nueve carpetas nuevas. Se retiraron únicamente cinco carpetas que quedaron
vacías tras mover sus archivos: `components/home/`, `components/shop/`,
`components/ui/` y `features/catalog/` del frontend, y `src/catalog/` del backend.
No se eliminó código de plantilla por parecer innecesario.

## 8. Referencias actualizadas y nombres conservados

Se actualizaron importaciones `@/` y relativas, exportaciones de las rutas,
pares nativo/web, el CSS de splash, la compilación aislada de tests y las rutas
de módulos compilados que cargan los tests. Las pruebas del escaparate ahora
buscan la implementación en `pantallas/`. La exportación de Expo comprueba
que las entradas de ruta se resuelven.
La documentación activa también apunta a los nombres actuales.

Se conservaron estos nombres porque cumplen una función técnica o histórica:

- `src/app/`, `(tabs)/`, `_layout.tsx`, `index.tsx`, `explore.tsx` y `[id].tsx`:
  mantienen las direcciones y convenciones de Expo Router.
- `app.js` y `server.js`: mantienen la separación entre construir Express y
  arrancarlo, y no requieren modificar los scripts de inicio.
- `package.json`, `package-lock.json`, `app.json`, `tsconfig.json`,
  `tsconfig.test.json`, `eslint.config.js`, `expo-env.d.ts`, `.env.example` y los
  archivos locales `.env*`: son configuraciones o archivos estándar; sus valores
  sensibles no se exponen.
- `hooks/use-theme.ts`, `hooks/use-color-scheme.ts`, su par `.web.ts` y
  `constants/theme.ts`: son dependencias activas de la plantilla/navegación.
- `assets/`, los nombres de consultas/migraciones SQL, manifiestos y scripts de
  BD: conservarlos evita cambiar identificadores o referencias históricas.
- Nombres de funciones y tipos exportados, como `getCatalogService`,
  `createApp` y `createCatalogRepository`: no se traducen para evitar cambios
  innecesarios en interfaces internas.
- Nombres de archivos de pruebas y `scripts/reset-project.js`: conservados;
  **no ejecutar el reinicio de plantilla**.

Los informes de desarrollo anteriores conservan sus resultados y referencias
históricas; sus rutas locales relevantes se actualizaron y señalan esta guía.
Que un informe antiguo diga «pendiente» refleja aquella etapa, no una nueva
verificación de Neon. No se alteraron URLs de evidencia o archivos de resultados
históricos JSON.

## 9. Ejecutar desde Visual Studio Code

Abrir `C:\Users\david\Desktop\Cuatri10\la-pape-mobile` y usar dos terminales.

Frontend:

```powershell
cd frontend
npm start -- --lan --clear
```

Backend:

```powershell
cd backend
npm start
```

Mantener los archivos de entorno que ya funcionan. Desde iPhone, la dirección
de Express debe usar la IP LAN de la computadora, no `localhost`; ambos deben
compartir la misma red. Expo y Express arrancan por separado. No es necesario
ejecutar migraciones para iniciar ninguno.

## 10. Verificaciones de esta reorganización

Las pruebas automatizadas utilizan simulaciones o HTTP local sin consultas a
Neon. No acreditan una nueva prueba manual del responsable en Expo Go.

| Comprobación | Resultado de esta revisión |
|---|---|
| `npm test` en frontend | 29/29 correctas. |
| `npm run lint` en frontend | Correcto, sin errores ni advertencias. |
| `npx tsc --noEmit` en frontend | Correcto, TypeScript estricto conservado. |
| `npm test` en backend | 52/52 correctas. |
| `npm run check` en backend | Correcto; además se revisó sintaxis de los 11 módulos fuente. |
| Arranque de Express y `GET /health` | Correcto: configuración existente, puerto temporal y HTTP 200; sin consultas SQL. |
| `npm run test:integration` en frontend | 1/1 correcta: cliente TypeScript real → Express → salud, sin BD. |
| Servicio de catálogo TypeScript → Express | Correcto con repositorio en memoria: diez artículos demo, categorías, detalle UUID, búsqueda combinada con categoría y HTTP 404. |
| Exportación Expo iOS/Android/Web | Correcta; siete rutas y las URL originales conservadas. |
| Resolución de referencias | 105 importaciones, alias, `require` e imports dinámicos revisados; cero referencias rotas. |
| Preservación de archivos protegidos | 53 archivos idénticos por hash: SQL, manifiestos, entorno, locks, assets y configuración Expo. |
| Preservación de comportamiento del código | 33 fuentes frontend y 11 backend idénticas salvo rutas/importaciones; diez archivos de tests conservan sus comprobaciones salvo las referencias de ubicación. |
| Git, GitHub y Project | No se realizó ninguna operación. Todos los cambios permanecen locales. |

Los archivos compilados antiguos de `.test-build/` se retiraron después de
verificar que eran JavaScript generado; las pruebas regeneraron ese directorio
con las rutas actuales. No se borró código fuente ni dependencias.

La primera ejecución de las pruebas backend encontró `EACCES` al abrir puertos
locales en el entorno aislado. Se repitieron con permiso para HTTP en loopback
y pasaron las 52 pruebas; no se cambió código ni se ocultaron errores para
obtener ese resultado.

No hay cambios de comportamiento intencionales ni errores detectados en las
verificaciones. La organización preserva las importaciones, contratos y lógica
de conexión; no se repitieron consultas a Neon para demostrarlo.

### Revisión pendiente en el iPhone

1. Reiniciar Metro desde `frontend/`. Si conserva referencias antiguas en caché,
   utilizar `npm start -- --lan --clear` y recargar Expo Go.
2. Abrir Inicio y comprobar la misma presentación y los destacados.
3. Recorrer Inicio → Catálogo → Detalle → Volver al catálogo.
4. Buscar por nombre, SKU y categoría; combinar la búsqueda con los chips y
   limpiar filtros.
5. Comprobar los diez artículos de la conexión existente Expo Go → Express → Neon,
   las ilustraciones sin foto y los reintentos en condiciones controladas.

Esta lista es una revisión manual pendiente: no se afirma que el responsable
ya la haya realizado después de los renombrados.
