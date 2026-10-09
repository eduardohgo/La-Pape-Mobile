# Base HTTP de La Pape para Issue #19

Base independiente de Node.js y Express dentro del repositorio mobile. Node.js >=22.13; mantiene JavaScript ESM del backend de referencia. Instala sus dependencias desde esta carpeta con `npm ci`. `npm start` carga una `.env` local, si existe, mediante la opción oficial de Node. `npm run dev` añade recarga del servidor. No hay despliegue ni modificación de servicios existentes.

```powershell
cd backend
npm ci
npm test
npm run check
npm start
```

La configuración predeterminada escucha en `127.0.0.1:3000`. Para probar desde un dispositivo en la misma red, configura explícitamente `HOST=0.0.0.0` en una `.env` ignorada y usa la IP LAN de la computadora. La conexión HTTP local corresponde a desarrollo; un API público deberá usar HTTPS. `.env.example` documenta nombres y valores no sensibles. Nunca publiques credenciales de BD ni claves dentro de variables `EXPO_PUBLIC_*`.

## Contrato y estructura

`GET /health` devuelve únicamente `{ "ok": true, "ts": <milisegundos> }` y `Cache-Control: no-store`. Verifica que el proceso HTTP responde; no verifica PostgreSQL ni servicios de negocio. Las demás rutas reciben 404 JSON. La base no contiene autenticación, productos, pedidos o pantallas.

- `src/app.js`: ensamblaje de middleware y rutas; no abre un puerto al importarse.
- `src/server.js`: arranque/cierre del servidor; no consulta BD.
- `src/config/env.js`: valida entorno, puerto, host, CORS y configuración opcional de PostgreSQL sin reflejar valores inválidos.
- `src/routes/health.routes.js`, `src/controllers/health.controller.js`, `src/services/health.service.js`: ruta, controlador y servicio de salud.
- `src/middlewares/errors.js`: 404, errores JSON 400/413/403 y mensaje genérico 500.
- `src/db/pool.js`: factory perezoso de `pg.Pool`, preparado para trabajo posterior.

`FRONTEND_ORIGINS` admite una lista de orígenes completos separados por comas; por defecto `http://localhost:8081,http://localhost:19006`. Solicitudes nativas sin `Origin` están admitidas. CORS no autentica ni autoriza usuarios. Se permiten encabezados `Content-Type` y `Authorization`, sin cookies de sesión. `TRUST_PROXY` vale 0 por defecto; se podrá configurar 1 al desplegar detrás de un proxy conocido. El límite global es de 100 solicitudes por IP/15 minutos; el cuerpo JSON máximo es 65536 bytes. Son valores configurables y validados.

## PostgreSQL preparado, sin operaciones

`DATABASE_URL` es opcional durante esta base. Si se proporciona, debe usar protocolo PostgreSQL, incluir una base y carecer de parámetros de URL y fragmentos. Se rechazan incluso `sslmode`, `sslcert`, `sslkey` y `sslrootcert`, porque pueden sobreescribir el objeto TLS de pg. Usa configuración TLS explícita en este módulo.

Se exige `rejectUnauthorized: true` para servidores remotos y para producción. Solo una BD de loopback fuera de producción puede usar TLS desactivado; `PG_SSL=true` también exige verificación TLS en desarrollo local. `PG_SSL=false` se rechaza en remoto/producción. No se copió el bypass `rejectUnauthorized:false` del ZIP.

El pool se construye vacío: ni la factory ni la ruta de salud llaman `connect`, `query`, sincronizaciones, migraciones o seeds. El servidor HTTP tampoco instancia ese pool por ahora. Las pruebas usan configuración ficticia sin credenciales y comprueban un pool real vacío antes de cerrarlo. No se conectan a PostgreSQL, Neon ni otros servicios.

## Reutilización del ZIP confirmado

Fuente de referencia: `la-pape-backend.zip`, confirmada por el responsable. Se adaptaron estos conceptos de `src/server.js`: Express ESM y configuración de middleware (líneas 31–80), salud (105–107) y arranque/cierre (202–213). Los errores de las líneas 155–169 se reemplazaron para no devolver URLs ni mensajes internos. Se mantuvo la elección PostgreSQL, usando el driver `pg` ya presente en el lock de referencia. No se copió el servidor completo ni se ejecutó código del ZIP.

Dependencias directas basadas en el lock del ZIP: pg 8.20.0, cors 2.8.5, Helmet 8.1.0 y express-rate-limit 8.6.2. Express se fijó en 4.22.3, parche compatible frente a los avisos de qs encontrados al instalar 4.22.2; la auditoría final del backend no reportó vulnerabilidades. No se agregan dependencias a Expo. No se incluyen Sequelize, Prisma, bcrypt/JWT, Google, Brevo, módulos comerciales, backups, monitoreo de BD o Python/ML. Quedan excluidos `sequelize.sync()` y las conexiones automáticas del arranque original (`server.js:196–200`), modelos con efectos al importarse, `/test-email`, seeds y keepalive.

## Hallazgos del backend de referencia que siguen pendientes

Estos problemas deben mapearse a las actividades técnicas existentes antes de integrar los módulos correspondientes; esta base no los presenta como corregidos:

- El registro público permite roles elevados enviados por el cliente (`auth.routes.js:44`; `auth.controller.js:100,116–139`; `validators.js:22–24`). Debe limitarse al rol de cliente y reservar cambios de rol a operaciones autorizadas.
- La pregunta secreta emite una sesión sin un challenge que pruebe el primer paso de contraseña (`auth.controller.js:380–408`). Debe ligarse al intento autenticado previo.
- El generador OTP usa `Math.random` y faltan límites por cuenta/challenge en validaciones de factores/códigos (`token.service.js:5–6`; `auth.routes.js:45,48–49,52`).
- Se imprimen códigos en fallos/fallbacks de correo sin una barrera de entorno de desarrollo (`email.service.js:19–22,32–38`; `auth.controller.js:151–155,315,488`).
- `/test-email` es público y el seed tiene una contraseña literal compartida para cuentas elevadas. Ninguno fue importado.
- La vinculación de Google y la condición `email_verified` requieren revisión (`auth.controller.js:606–655`).
- El backend original mezcla dos ORMs y sincroniza tablas al arrancar. Se debe acordar una estrategia antes de habilitar acceso a datos.

## Verificación

`npm test` ejecuta pruebas reales con `node:test`: configuración y valores inválidos, TLS de producción/remoto, rechazo de parámetros TLS ambiguos, pool vacío sin operaciones, salud sin acceso a BD, CORS/orígenes nativos/preflight, 404 sin reflejar la URL, JSON inválido, límite de cuerpo, rate limit, error interno sanitizado y cierre HTTP. Las pruebas escuchan únicamente en loopback y puertos temporales; no contactan los servicios desplegados.

La validación móvil y cualquier futura conectividad real con PostgreSQL permanecen pendientes. Esta base no equivale a completar todos los criterios de la Issue #19.

Referencias oficiales: [Node env-file](https://nodejs.org/docs/latest-v22.x/api/cli.html#--env-file-if-existsfile), [Express: seguridad](https://expressjs.com/en/advanced/best-practice-security/), [pg Pool](https://node-postgres.com/apis/pool), [pg y TLS](https://node-postgres.com/features/ssl).
