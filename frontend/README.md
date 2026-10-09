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
