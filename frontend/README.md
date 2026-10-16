# Frontend de La Pape Mobile

Aplicación React Native con Expo SDK 57, Expo Router y TypeScript estricto.
Ejecuta sus comandos desde `frontend/`; Express se ejecuta por separado desde
`../backend/`. La organización de archivos realizada en esta revisión es local.
No cambia las pantallas, sus direcciones, los contratos HTTP ni las dependencias.

## Encontrar el código

| Qué quieres revisar | Archivo |
|---|---|
| Inicio | `src/pantallas/pantalla-inicio.tsx` |
| Catálogo, tarjetas, búsqueda y selección de categoría | `src/pantallas/pantalla-catalogo.tsx` |
| Detalle individual y regreso al catálogo | `src/pantallas/pantalla-detalle-producto.tsx` |
| Encabezado, barra de Catálogo, estados y modales compartidos | `src/components/catalogo/componentes-catalogo.tsx` |
| Iconos e ilustraciones de papelería | `src/components/compartidos/` |
| Productos destacados de Inicio | `src/hooks/use-productos-inicio.ts` |
| Búsqueda local por nombre, categoría y SKU | `src/utils/busqueda-catalogo.ts` |
| Consultas y validación de categorías, productos y detalle | `src/services/servicio-catalogo.ts` |
| Solicitudes GET, timeouts y cancelación | `src/services/http/cliente-http.ts` |
| Tipos de error HTTP, red y configuración | `src/services/http/errores-http.ts` |
| Validación de configuración pública de la API | `src/config/configuracion-api.ts` |
| Navegación nativa y su versión web | `src/components/navegacion/pestanas-app.tsx` y `.web.tsx` |

Las rutas especiales permanecen en `src/app/`: `index.tsx`, `explore.tsx` y
`products/[id].tsx` importan las pantallas correspondientes. `_layout.tsx`
conserva el Stack y las pestañas. Las direcciones siguen siendo `/`, `/explore`
y `/products/<uuid>`. El alias `@/` continúa apuntando a `src/`.

La [guía de estructura](../docs/guia-estructura-proyecto.md) explica las carpetas,
los nombres anteriores y el recorrido completo hasta PostgreSQL.

## Ejecutar y comprobar

```powershell
npm start -- --lan --clear
npm test
npm run lint
npx tsc --noEmit
```

Si las dependencias no están instaladas, se instalan desde esta carpeta con
`npm ci`. La reorganización no actualiza paquetes ni requiere reinstalarlos.
No ejecutar `npm run reset-project`: es un script conservado de la plantilla
para reiniciar un proyecto, incompatible con conservar esta aplicación.

ESLint utiliza las reglas recomendadas por Expo SDK 57 y falla ante errores o
advertencias. TypeScript conserva `strict: true`. Las pruebas unitarias compilan
la configuración, el cliente HTTP, el servicio de catálogo y la búsqueda, usan
respuestas simuladas y revisan también los controles del escaparate.

Después de tener instaladas las dependencias de `backend/`, puede ejecutarse:

```powershell
npm run test:integration
```

Esta integración usa el cliente TypeScript real y Express en loopback para
`GET /health`. No se conecta a PostgreSQL. `.test-build/` y `.expo/` son
directorios generados; no se editan como código fuente.

## API y modo demostración

La app nunca se conecta directamente a Neon. `servicio-catalogo.ts` consume:

- `GET /categories` y `GET /products` para el catálogo comercial.
- `GET /products/:id` para un producto comercial identificado por UUID.
- `GET /demo/products` y `GET /demo/products/:id` para los diez artículos de
  demostración, solo si `__DEV__` y `EXPO_PUBLIC_CATALOG_MODE=demo`.

El servicio valida las respuestas en tiempo de ejecución, pagina el catálogo
comercial y conserva cancelación y manejo de errores. Una API fallida no se
sustituye por productos locales. La búsqueda y los filtros se aplican a los
artículos ya recibidos; no crean endpoints ni modifican los datos originales.

Los diez artículos demo de Neon permanecen en `demo.product_previews`, separados
de `catalog.products`, con `is_demo=true` e `is_for_sale=false`. La migración 002
ya se aplicó con autorización anterior; no ejecutarla de nuevo. Los precios
siguen pendientes de aprobación comercial. El escaparate actual omite mensajes
internos de diagnóstico y mantiene las restricciones: no hay carrito real,
compras, pagos, autenticación ni inventarios ficticios. Ver
[la revisión del escaparate](../docs/storefront-cleanup.md).

Si una imagen falta o falla, la pantalla presenta una ilustración original.
No se inventan fotografías, marcas, existencias o descripciones. El archivo
`src/features/catalogo/productos-demo-referencia.ts` es un prototipo histórico,
sin consumidores en las pantallas; se conserva para estudiar su evolución.
El componente `src/components/diagnostico/comprobacion-api.tsx` también se
conserva, pero ya no se muestra en Inicio.

## Configuración pública y iPhone

Conservar la configuración local existente. Los ejemplos sin secretos se
encuentran en `.env.example`. Solo estos valores pueden ser públicos:

- `EXPO_PUBLIC_API_URL`: origen de Express, sin `/api`, rutas o credenciales.
- `EXPO_PUBLIC_API_ENV`: development, staging o production.
- `EXPO_PUBLIC_API_TIMEOUT_MS`: entre 100 y 60000 milisegundos; 15000 por defecto.
- `EXPO_PUBLIC_CATALOG_MODE`: demo únicamente para revisión interna en desarrollo.

En iPhone usar la IPv4 LAN real de la computadora; `localhost` señala el propio
teléfono. Reiniciar Metro y recargar Expo Go después de un cambio autorizado de
configuración. HTTP solo se admite en desarrollo con direcciones locales o LAN
privadas; staging y producción exigen HTTPS. Nunca introducir DATABASE_URL,
contraseñas, tokens o credenciales en variables `EXPO_PUBLIC_*`.

El cliente `fetch` aplica timeout también durante la lectura de JSON, admite
`AbortController`, limpia temporizadores y no reintenta automáticamente.
No expone cuerpos de error, URLs privadas ni mensajes internos del servidor.

Los resultados históricos y las comprobaciones actuales son distintos: los
informes [Inicio](../docs/home-redesign.md),
[Catálogo/Detalle](../docs/catalog-detail-redesign.md) e
[#19](../docs/issue-19.md) conservan la evidencia de sus respectivas etapas.
La reorganización local y sus verificaciones se registran en la guía de
estructura; no constituyen una nueva comprobación personal en el iPhone.
