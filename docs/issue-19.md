# Issue #19 — base HTTP y separación de aplicaciones

Implementación autorizada el 8 de octubre de 2026, PB-01, Sprint 1.
La Issue no tenía cuerpo con criterios adicionales. Se utiliza el alcance
expreso del responsable y se deja la comprobación física pendiente.

## Integración y conservación

PR #120 integrado en develop mediante a93f689; contiene #102 (4ced7c0).
Rama de esta implementación: codex/issue-19-api-base, desde ese develop.
Main no se modifica. El nuevo PR hacia develop requiere autorización de fusión.

La aplicación original, configuración, assets, scripts, VS Code y lock se
trasladaron íntegros a frontend. No se reinició el proyecto ni se ejecutó
reset-project. App.json, TypeScript estricto, Expo Router, assets y dependencias
existentes conservan sus valores y referencias relativas. El lock del frontend
es idéntico al que contiene develop. Se añaden scripts de prueba, exclusión
ESLint del código generado y cliente HTTP. La única adición a Home es un
diagnóstico condicionado por __DEV__; navegación y Explore se conservan.
Cada aplicación tiene un package y lock propio; no hay workspace ni dependencias
compartidas. La raíz contiene documentación, Git, licencia y las instrucciones.

## Fuente y reutilización del backend

Referencia confirmada: la-pape-backend.zip, SHA256
DF42A240C2CBE71E76C4B4B434527657AC5102AF08DA40CD871623D865915D00.
Se revisó como datos/código, sin ejecutar su arranque, scripts, seeds ni modelos.

Se adaptan Express ESM, el contrato GET /health {ok:true,ts}, middleware
Helmet/CORS/rate limit/JSON y el cierre HTTP. Se conserva PostgreSQL con pg,
sin importar modelos ni controladores comerciales duplicados. La separación
app/server/config/routes/controllers/services/db mejora el arranque verificable
y evita importar los efectos de sequelize.sync del servidor original.
Express se actualizó del parche de referencia 4.22.2 a 4.22.3 por avisos de qs.
Npm audit --omit=dev reporta 0 vulnerabilidades en el backend nuevo.
No se copiaron ORM, autenticación, correo, Python/ML, backups, secretos,
archivos env reales, node_modules ni información de usuarios al control de versiones.

## Servicios disponibles y PostgreSQL

Únicamente GET /health: liveness HTTP, JSON mínimo y no-store. La base no ofrece
/api, /auth, /products, /sales ni /test-email. Incluye CORS explícito, límites
de solicitudes/cuerpo JSON, validación de entorno y errores públicos sanitizados.
No registra cuerpos, tokens, credenciales ni errores internos.

DATABASE_URL es opcional para esta etapa. El pool pg es una factory perezosa
sin llamadas connect/query y no se instancia en el arranque. TLS verificado
obligatorio para una futura BD remota/producción. URL sin parámetros que puedan
sobreescribir TLS. No se probó acceso real a PostgreSQL o Neon ni se acredita
que el ZIP corresponda a un despliegue vigente. Antes de módulos de datos faltan:
entorno de pruebas autorizado, credenciales fuera de Git, certificado confiable
si corresponde y decisión de ORM/esquema/migraciones con alcance autorizado.
La elección futura del ORM debe reutilizar los modelos compatibles del ZIP
tras su revisión; esta base no crea un segundo conjunto de modelos comerciales.

## Conexión móvil

Cliente fetch TypeScript, configuración EXPO_PUBLIC estática, solo URL/entorno/
timeout públicos. URL de origen validada, HTTPS obligatorio fuera de desarrollo
local, timeout 15 s configurable, AbortController, limpieza, sin reintentos
automáticos, categorías configuration/network/timeout/cancelled/http/invalid-response
y status HTTP conservado. No se reflejan mensajes internos o cuerpos de error.
Health valida en runtime ok === true y timestamp entero no negativo.

El diagnóstico funciona bajo demanda en desarrollo; falta prueba en Expo Go
del responsable. Usar IP LAN, backend HOST=0.0.0.0 y puerto 3000; no localhost
desde el teléfono. No se modificó firewall ni se desactivó ATS/TLS. Si iOS
bloquea HTTP local, registrar el error y revisar acceso a red local/HTTPS de
desarrollo, sin habilitar excepciones globales. Instrucciones en README raíz.

## Verificación automatizada y local

- frontend: npm run lint -- --no-cache y npx --no-install tsc --noEmit.
- frontend: npm test, 8 casos de configuración, contrato, HTTP, JSON, red,
  timeout (incluido cuerpo detenido) y cancelación.
- frontend: npm run test:integration, 1 caso con Express temporal real y el
  cliente TypeScript compilado. No consume datos ni usa PostgreSQL.
- backend: npm test, 12 casos de configuración, TLS, pool sin conexiones,
  salud sin BD, CORS/preflight, 404, JSON inválido, límites, error genérico y cierre.
- backend: npm run check y npm audit --omit=dev.
- Expo config resuelve SDK57, rutas y assets desde frontend. Metro inicia desde
  frontend y reconoce src/app. Exportación iOS JavaScript/37 assets completada;
  no equivale a ejecución en iPhone o a build nativo.
- Navegador local: Home → Explore → Home, recarga y comprobación GET /health
  real exitosa. No errores JS observados; warning deprecado pointerEvents de la
  capa web existente, sin cambiar su diseño en este alcance.

La primera ejecución de pruebas HTTP dentro de la sandbox falló con EACCES de
loopback. Al permitir únicamente esas pruebas locales, 12/12 y la integración
pasaron. Se corrigieron validación numérica de configuración (rechazar 123e2)
y tipos de compilación aislada del cliente (__DEV__); no se ocultaron errores.
No se actualizaron paquetes Expo ni vulnerabilidades preexistentes del frontend.

## Validación manual pendiente — responsable

1. GET /health en Safari mediante IP LAN responde ok:true.
2. Expo Go abre la app reorganizada sin errores visibles.
3. Home → Explore → Home sigue funcionando; recarga correcta.
4. Comprobar API en Home devuelve API disponible.
5. Con backend detenido, el diagnóstico muestra fallo de red sin romper la app;
   volver a iniciarlo permite repetir y recibir éxito.
6. Confirmar ausencia de errores importantes en terminal e indicar cualquier
   bloqueo de red local/ATS o firewall para resolverlo dentro de #19.

Project: #19 In Progress durante desarrollo y Testing al quedar preparado;
Issue abierta, PB-01 In Progress, #102 Done. No cerrar #19 ni PB-01 antes de
confirmación manual y revisión de criterios. Campos de planeación conservados.

## Módulos de referencia excluidos y trabajo posterior

Estos hallazgos no se declaran corregidos: los módulos no están habilitados.
Asignación propuesta a Issues existentes, sin cambiar su planeación ni comenzar PBs:

| Alcance por revisar antes de reutilizar | PB / Issues existentes |
| --- | --- |
| Registro público/roles, sesiones, Google y salto de primer factor por pregunta secreta | PB-03: #29, #31, #104, #105; PB-04: #38 |
| OTP criptográfico, límites por challenge/cuenta, recuperación y eliminación de códigos de logs | PB-04: #34, #35, #38, #106, #107; PB-12: #86, #88 |
| Catálogo/categorías y productos inactivos/disponibilidad | PB-06: #44, #45, #48, #110 |
| Stocks: acumulación de líneas duplicadas, concurrencia, cantidades y descuentos | PB-08: #60, #112; PB-09: #67, #114, #115 |
| Pedidos de cliente (sales/POS son ventas administrativas), seguimiento | PB-09: #67; PB-10: #69, #116 |
| Perfil/direcciones de cliente, que no existen como API completa | PB-05: #41, #42, #108 |
| Notificaciones de cuenta y cambios de pedidos | PB-11: #75, #77, #78, #80, #117 |

No crear endpoints de esos módulos dentro de #19 ni copiar el registro con roles
privilegiados, pregunta secreta sin challenge, OTP Math.random, logs de códigos,
/test-email o seeds. Los controles y pruebas deben acordarse en cada actividad
antes de habilitar autenticación/recuperación o transacciones. No se ejecutaron
migraciones, seeds, schema sync, consultas de escritura ni despliegues.
