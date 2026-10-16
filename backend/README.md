# Backend Express de La Pape Mobile

Base independiente de Node.js y Express dentro del repositorio mobile. Node.js >=22.13; mantiene JavaScript ESM del backend de referencia. Instala sus dependencias desde esta carpeta con `npm ci`. `npm start` carga una `.env` local, si existe, mediante la opción oficial de Node. `npm run dev` añade recarga del servidor. No hay despliegue ni modificación de servicios existentes.

```powershell
cd backend
npm ci
npm test
npm run check
npm start
```

La configuración predeterminada escucha en `127.0.0.1:3000`. Para probar desde un dispositivo en la misma red, configura explícitamente `HOST=0.0.0.0` en una `.env` ignorada y usa la IP LAN de la computadora. La conexión HTTP local corresponde a desarrollo; un API público deberá usar HTTPS. `.env.example` documenta nombres y valores no sensibles. Nunca publiques credenciales de BD ni claves dentro de variables `EXPO_PUBLIC_*`.

## Contratos y estructura actual

`GET /health` devuelve únicamente `{ "ok": true, "ts": <milisegundos> }` y
`Cache-Control: no-store`. Verifica que el proceso HTTP responde; no verifica
PostgreSQL ni servicios de negocio. El catálogo actual dispone además de las
lecturas siguientes, si `CATALOG_API_ENABLED=true`:

- `GET /categories`.
- `GET /products`, con filtros/paginación validados.
- `GET /products/:id`, con UUID validado.
- En desarrollo y con `CATALOG_DEMO_API_ENABLED=true`: `GET /demo/products` y
  `GET /demo/products/:id`, sin ventas ni escrituras.

Las rutas no existentes devuelven 404 JSON. No hay autenticación, compras,
carrito, pedidos ni endpoints administrativos habilitados.

- `src/app.js`: ensamblaje de middleware y rutas; no abre un puerto al importarse.
- `src/server.js`: arranque/cierre del servidor; no consulta BD.
- `src/config/variables-entorno.js`: valida entorno, puerto, host, CORS y configuración de PostgreSQL sin reflejar valores inválidos.
- `src/routes/rutas-salud.js`, `src/controllers/controlador-salud.js`, `src/services/servicio-salud.js`: ruta, controlador y servicio de salud.
- `src/routes/rutas-catalogo.js`, `src/routes/rutas-catalogo-demo.js`: endpoints comerciales de lectura y de demostración.
- `src/repositories/repositorio-catalogo.js`: carga las consultas SQL y usa un pool para ejecutar transacciones `READ ONLY`.
- `src/middlewares/manejo-errores.js`: 404, errores JSON 400/413/403 y mensaje genérico 500.
- `src/db/conexion-postgres.js`: factory independiente de `pg.Pool`, sin conectar al construirse; conservada y probada, pero el catálogo utiliza su propio pool dentro del repositorio.
- `db/queries/`: consultas SQL existentes; `db/migrations/`: historial de migraciones, nunca ejecutadas al arrancar Express.

La [guía de estructura](../docs/guia-estructura-proyecto.md) explica cómo localizar
estos módulos y los renombrados locales. `app.js`, `server.js`, los endpoints,
los contratos y las consultas conservan su comportamiento.

`FRONTEND_ORIGINS` admite una lista de orígenes completos separados por comas; por defecto `http://localhost:8081,http://localhost:19006`. Solicitudes nativas sin `Origin` están admitidas. CORS no autentica ni autoriza usuarios. Se permiten encabezados `Content-Type` y `Authorization`, sin cookies de sesión. `TRUST_PROXY` vale 0 por defecto; se podrá configurar 1 al desplegar detrás de un proxy conocido. El límite global es de 100 solicitudes por IP/15 minutos; el cuerpo JSON máximo es 65536 bytes. Son valores configurables y validados.

## PostgreSQL: esquema aplicado y catálogo de lectura

El responsable confirmó la aplicación y validación real de `001_catalog_schema.sql`
por ChatGPT en Neon PostgreSQL 18, rama development, base lapape_mobile_dev:
tres tablas de catálogo, dos FK validadas, cero filas y `image_url` nullable, sin
tablas inesperadas. Esta evidencia está en [el registro de validación](../docs/neon-verification-results.md).
No repetir 001. Posteriormente se autorizó y aplicó 002 para los diez artículos
de `demo.product_previews`, separados del catálogo comercial y sin aprobación
para venta; ver [el registro de demostración](../docs/catalog-demo-review.md).
No repetir 002. La organización local no ejecuta estas migraciones ni consulta
o modifica la base real.

El destino de desarrollo confirmado por el responsable es **La Pape Mobile**, proyecto Neon `twilight-moon-02635569`, rama `development`, base `lapape_mobile_dev`, PostgreSQL 18. Estos identificadores no contienen credenciales. Esta preparación no conecta ni modifica el proyecto y no crea otro.

`DATABASE_URL` es opcional si el catálogo está deshabilitado y se usa únicamente
salud HTTP; es necesaria cuando se habilita el catálogo. El backend utiliza la
URL **pooled** de Neon (host con `-pooler`) con un rol de lectura. La evidencia
anterior registra el rol `lapape_catalog_api`; esta reorganización no cambia
sus permisos. `DATABASE_URL_UNPOOLED` queda reservado a la conexión directa de
administración para migraciones aprobadas; `loadConfig` no lee esa variable y
el servidor no ejecuta migraciones al arrancar.

Las URLs deben usar protocolo PostgreSQL, identificar una base y no contener fragmentos. Se admite únicamente un `sslmode=require` o `sslmode=verify-full` y, opcionalmente, un `channel_binding=prefer`. Ambos modos SSL se traducen a TLS con verificación de certificado y de nombre de servidor; se eliminan esos parámetros de la URL antes de entregarla a `pg`, porque los parámetros SSL de una connection string pueden reemplazar el objeto `ssl` explícito. Los parámetros desconocidos o repetidos y los modos `disable`, `allow`, `prefer`, `no-verify` y `verify-ca` se rechazan, igual que `sslcert`, `sslkey` y `sslrootcert`.

**Límite de pg 8.20:** `enableChannelBinding: true` utiliza SCRAM-SHA-256-PLUS cuando el servidor lo ofrece, pero admite SCRAM sin PLUS cuando no se ofrece. Por eso `channel_binding=require` se rechaza con un error explícito; aceptarlo como si el driver lo garantizara ocultaría una diferencia de seguridad. La copia de la URL destinada al backend puede usar `sslmode=verify-full&channel_binding=prefer`, siempre con TLS verificado. La URL de administración usada por un cliente libpq/psql conserva sus propios parámetros seguros, incluido `channel_binding=require`; no debe sustituirse por la URL normalizada del backend. Si se exige channel binding obligatorio para el backend, falta seleccionar y revisar un driver con esa garantía antes de habilitar consultas reales.

Se exige `rejectUnauthorized: true` para servidores remotos y para producción. Solo una BD de loopback fuera de producción puede usar TLS desactivado cuando la URL no requiere TLS o channel binding; `PG_SSL=true` también exige verificación TLS en desarrollo local. `PG_SSL=false` se rechaza siempre que TLS sea obligatorio. No se copió el bypass `rejectUnauthorized:false` del ZIP. Las variables de conexión deben existir solo en el entorno del backend o una `.env` ignorada; nunca en `EXPO_PUBLIC_*` ni en logs.

Ambas construcciones de pool son perezosas. `conexion-postgres.js` no llama a
`connect` o `query` y salud no accede a la base. Si el catálogo está habilitado,
`app.js` construye el repositorio; cada solicitud de catálogo obtiene un cliente,
inicia una transacción `BEGIN READ ONLY`, ejecuta su consulta parametrizada y
libera el cliente. No se ejecutan sincronizaciones, migraciones o seeds. Los
tests utilizan configuración ficticia, pools simulados y repositorios en memoria;
no se conectan a Neon ni a otros servicios.

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

El responsable confirmó anteriormente la conexión Expo Go → Express → Neon.
Las pruebas automatizadas de esta reorganización local no sustituyen una nueva
revisión en su iPhone. No se modifican el Project ni los criterios de ninguna
Issue durante esta tarea. Los resultados actuales se registran en la guía de
estructura; los informes históricos conservan la evidencia de cada etapa.

Referencias oficiales: [Node env-file](https://nodejs.org/docs/latest-v22.x/api/cli.html#--env-file-if-existsfile), [Express: seguridad](https://expressjs.com/en/advanced/best-practice-security/), [pg Pool](https://node-postgres.com/apis/pool), [pg y TLS](https://node-postgres.com/features/ssl).
