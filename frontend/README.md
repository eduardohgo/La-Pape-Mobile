# La Pape Mobile

Aplicación móvil de La Pape.

Esta carpeta contiene la aplicación móvil de La Pape. Ejecutar Expo y sus herramientas desde `frontend/`. El backend independiente está en `../backend/`.

## Objetivo

Desarrollar una aplicación móvil que permita llevar las principales funcionalidades de La Pape a dispositivos móviles, manteniendo un proceso organizado de desarrollo, control de versiones y seguimiento de actividades.

## Metodología de trabajo

El proyecto será desarrollado utilizando la metodología Scrumban, combinando elementos de Scrum y Kanban para organizar las actividades mediante iteraciones y dar seguimiento al estado de cada tarea.

## Control de versiones

Para administrar y versionar el código fuente se utiliza Git y GitHub.

El desarrollo se organizará mediante diferentes ramas para evitar trabajar directamente sobre la rama principal.

## Responsable

Carlos Eduardo Hidalgo Toledo

## Estado del proyecto

Base Expo funcional con diagnóstico de conexión GET /health solo en desarrollo. La validación en iPhone después del traslado permanece pendiente en #19.

## Análisis estático

Con las dependencias del proyecto instaladas, ejecutar:

```bash
npm run lint
npx tsc --noEmit
```

ESLint utiliza la configuración plana recomendada por Expo SDK 57 para JavaScript,
TypeScript, React y sus hooks. Analiza el código fuente, los scripts y la
configuración JavaScript; excluye las dependencias y los archivos generados por
Expo. El comando falla si encuentra errores o advertencias. TypeScript conserva
el modo estricto de `tsconfig.json`.

Para repetir el análisis sin utilizar la caché:

```bash
npm run lint -- --no-cache
```

Las versiones resueltas están registradas en `package-lock.json`. Estos comandos
realizan comprobaciones automatizadas; las pruebas en dispositivo físico se
registran por separado en las Issues correspondientes. La configuración de
GitHub Actions se realizará cuando se trabaje en el pipeline.

## Configuración pública y conexión

Copiar `.env.example` a `.env.local` (ignorada por Git) y ajustar:

- `EXPO_PUBLIC_API_URL`: origen de la API, sin `/api`, rutas, credenciales, query o fragmentos.
- `EXPO_PUBLIC_API_ENV`: development, staging o production.
- `EXPO_PUBLIC_API_TIMEOUT_MS`: entre 100 y 60000 milisegundos, 15000 por defecto.

HTTP solo se acepta en una compilación de desarrollo, entorno development y una
dirección de loopback o IPv4 privada de LAN. Staging y producción exigen HTTPS;
una compilación release no acepta entorno development. La configuración se
valida al solicitar salud, de modo que una URL ausente no impide abrir/navegar
la aplicación. Un error de configuración devuelve un mensaje genérico.

Usar la IPv4 real de la computadora para Expo Go en iPhone; localhost representa
el propio teléfono. Reiniciar Metro tras cambiar configuración y recargar la app.
Seguir la [guía de la raíz](../README.md) para LAN, permisos y restricciones iOS.
No poner secretos en variables públicas. El cliente no almacena tokens,
credenciales ni información de usuarios y no habilita autenticación o compras.

`src/config/env.ts` valida configuración, `src/services/http/` administra errores
y solicitudes GET JSON, y `src/services/health.service.ts` valida `{ok:true,ts}`.
AbortController permite cancelar desde el llamador y al vencer el timeout;
el límite abarca también la lectura de JSON. Se limpian temporizadores/listeners.
No hay reintentos automáticos ni mensajes/URL/cuerpos del servidor en logs.

El control **Comprobar API** en Home está condicionado por `__DEV__`. Conserva
las pantallas y navegación actuales y no aparece en builds de producción.

## Pruebas del cliente

```powershell
npm test
# Tras instalar también backend/:
npm run test:integration
```

Las pruebas unitarias compilan solo la capa HTTP con TypeScript y utilizan fetch
simulado; no requieren el backend. La integración abre un servidor Express
temporal en loopback, consume /health con el cliente TypeScript real y lo cierra.
No utiliza PostgreSQL. `.test-build/` está ignorada por Git y ESLint.

Versiones Expo, React Native y dependencias existentes se conservaron. Referencias:
[Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/),
[ubicación en subcarpetas](https://docs.expo.dev/guides/monorepos/),
[variables públicas](https://docs.expo.dev/guides/environment-variables/),
[red en React Native 0.86](https://reactnative.dev/docs/0.86/network).


## Catálogo conectado a la API (PB-06)

La pestaña **Catálogo** reutiliza temporalmente la ruta `explore` mientras se
termina la navegación PB-02. En modo normal consume la API Express a través de
`src/services/catalog.service.ts`: `GET /categories` y `GET /products?limit=50`,
con validación de tipos en tiempo de ejecución, paginación por cursor,
cancelación, error de conexión, reintento y estado vacío.

- **No hay fallback silencioso al catálogo estático.** Las diez fichas de
  `demo-products.ts` son material histórico de prototipo y ya no se importan
  en la pantalla. Cuando Neon tenga cero productos publicados, se muestra
  «Todavía no hay productos publicados».
- Las fotos NULL muestran un ícono genérico; las marcas no verificadas no se
  muestran en la UI. No hay botones de compra ni datos de inventario.
- En desarrollo, el precio se identifica visualmente como demostración. Antes
  de habilitar venta pública deben verificarse precios, inventario y estados.
- No hay endpoint de escritura ni autenticación nueva. Las rutas de Express
  están detrás de `CATALOG_API_ENABLED=true` y deben verificarse en LAN
  desde Expo Go, nunca con secretos dentro de `EXPO_PUBLIC_*`.

### Prueba de integración en dispositivo

1. En `backend/.env`, establecer `HOST=0.0.0.0`,
   `CATALOG_API_ENABLED=true` y la conexión privada `DATABASE_URL` de
   `lapape_catalog_api`. **No publicar ese archivo.** Mantener la PC en una
   red Wi-Fi privada (no pública).
2. En `frontend/.env.local`, usar `EXPO_PUBLIC_API_URL=http://<IPV4_PC>:3000`
   con la IP LAN local real (no 127.0.0.1, que desde iPhone apunta al iPhone).
3. Iniciar `npm start` en backend y `npx expo start --lan --clear` en frontend.
   iPhone y computadora deben compartir Wi-Fi. Autorizar Node solo en la red
   privada en el firewall cuando sea necesario.
4. Abrir `http://<IPV4_PC>:3000/products` desde Safari en iPhone y luego
   la pestaña Catálogo en Expo Go. Actualmente ambas deben mostrar
   **cero productos**. Una respuesta `503` es fallo de API, no catálogo vacío.
5. Ejecutar `npm test`, `npm run lint`, `npx tsc --noEmit` y revisar
   disposición visual en Expo Go. Los resultados aún no han sido informados
   después de estos cambios.

No se crea ni publica ningún producto en esta implementación. La importación de
las diez fichas candidatas requiere una revisión y autorización específica,
además de separación explícita entre datos de demostración y mercancía real.

### Demostración separada de los diez productos del ZIP

Los diez artículos de `10 (1).zip` **no están aprobados comercialmente**.
La migración `backend/db/migrations/002_demo_previews.sql` fue **autorizada y aplicada**
el 13 de octubre de 2026 exclusivamente en Neon `development` / `lapape_mobile_dev`.
La tabla `demo.product_previews` contiene exactamente diez filas verificadas,
separadas de `catalog.products` (que continúa vacía). **No volver a ejecutar 002.**

La ruta `GET /demo/products` devuelve `{mode:'demo',purchasable:false,data:[]}`
con productos `is_demo=true` y `is_for_sale=false`, sin marcas, fotos ni
inventarios. **No es el endpoint público comercial.** Solo se monta con
`NODE_ENV=development`, `CATALOG_API_ENABLED=true` y
`CATALOG_DEMO_API_ENABLED=true`, sobre una red privada controlada.

Para visualizar exclusivamente esa ruta desde Expo Go, configura en
`frontend/.env.local`:

```dotenv
EXPO_PUBLIC_API_URL=http://192.168.1.82:3000
EXPO_PUBLIC_API_ENV=development
EXPO_PUBLIC_CATALOG_MODE=demo
```

La dirección de ejemplo es la IPv4 observada en esta prueba y puede cambiar.
**No uses `localhost` en iPhone; jamás incluyas credenciales en variables públicas.**
Recarga Metro después del cambio. Sin modo demo, `EXPO_PUBLIC_CATALOG_MODE=live`
(por defecto) consume `GET /categories` y `GET /products`, que siguen mostrando
únicamente publicaciones revisadas. No hay fallback a diez datos locales.
En builds de producción, el modo demo se ignora incluso si la variable quedó
configurada, y el backend niega esa ruta fuera de desarrollo.

Pruebas requeridas: `npm test`, `npm run lint`, `npx tsc --noEmit` en
`frontend/` y `npm test` y `npm run check` en `backend/`. Verificar las rutas
reales desde Safari y Expo Go después de autorizar la carga en Neon. El
resultado todavía NO está validado en dispositivo después de estos cambios.
