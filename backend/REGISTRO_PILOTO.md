# Registro y verificación — Tigre10, 23/11/2026

Implementación LOCAL. No se desplegó, no se ejecutó SQL en Neon y no se envió correo real.
No representa una declaración de preparación para producción.

## Contratos (opt-in)
- POST /auth/register: name, email, password, confirmation, únicamente cuatro strings.
  202 genérico para altas y duplicados. Devuelve challengeId y verificationToken aleatorio
  de 256 bits. No es una sesión. No revela OTP, usuario existente ni activación.
- POST /auth/register/resend: challengeId, verificationToken. 202 genérico.
- POST /auth/register/verify: challengeId, verificationToken, code de seis dígitos.
  200 { verified: true } únicamente tras activación transaccional.
- Errores: 400 datos/código inválidos, 429 presupuesto agotado con Retry-After,
  503 dependencia interna fallida. Sin mensajes privados del proveedor.
- Login/me/logout y Bearer opaco permanecen. No hay JWT ni auto-login.
  Recuperación, demo, catálogo, cargas y administración siguen ausentes en auth-only.

## Política y protección
Nuevas contraseñas: mínimo 15 caracteres Unicode, máximo 1024 bytes UTF-8.
Sin normalizar ni recortar contraseña, sin imponer clases de caracteres. Login mantiene
compatibilidad con cuentas previas. La comprobación segura de contraseñas comunes o
comprometidas sigue PENDIENTE, no se simula. La aceptación legal versionada también:
la casilla actual no constituye evidencia legal persistente.

Argon2id nativo Node 24.21.0: m=19456 KiB,t=2,p=1, salt aleatoria.
PostgreSQL recibe PHC, SHA-256 de la prueba aleatoria y HMAC-SHA-256 del código
dominado por challenge/prueba. El secreto HMAC queda fuera de la base.
OTP: 15 minutos, un solo uso bajo bloqueo de filas, cinco errores como máximo.
Reenvío: pausa 60 s, máximo tres envíos/challenge, invalida código previo.
Solicitudes/reenvíos: tres/15 min por sujeto HMAC y pausa de 60 s;
verificación cinco/15 min por challenge; origen 30/15 min por operación.
Presupuestos compartidos en PostgreSQL, concurrencia de derivación/entrega dos/proceso.
No es protección absoluta frente a abuso distribuido.

Cuenta nueva PENDING_VERIFICATION, credencial PROVISIONAL, rol CLIENTE fijado en SQL.
Solo el challenge vigente puede activarla. El login deniega no verificadas.
Duplicado activo: no cambia credencial/usuario ni envía correo, mismo formato genérico.
La prueba permanece en memoria del móvil; no en rutas, logs, AsyncStorage ni SecureStore.
Al cerrar la aplicación hay que reiniciar el registro. No se guarda contraseña/OTP.

## Correo real pendiente
Adaptador preparado para POST HTTPS api.brevo.com/v3/smtp/email, sin SMTP/fallback.
Timeout 5 s, redirecciones rechazadas, exige 201 y messageId. 202 del registro significa
solicitud aceptada, NO entrega confirmada. El estado SENT acredita aceptación del
proveedor, no recepción. FAILED impide verificar hasta reenvío exitoso.
Entrega asíncrona acotada en memoria; caída del proceso puede perder el envío.
El usuario debe solicitar otro. Para fiabilidad mayor, autorizar una outbox/cola durable.
Cierre ordenado drena trabajos antes de pools. Verificar remitente/dominio Brevo y
hacer después una prueba autorizada a correo controlado; no cuentas ajenas.

## SQL que requiere autorización separada
Destino PROPUESTO: proyecto twilight-moon-02635569, rama auth-login-tigre10
(br-green-rice-b7lt3v8b), base lapape_mobile_dev, PostgreSQL 18.
Verificar conexión directa/hostname/branch mediante conector antes de ejecutar.
El nombre de base por sí solo NO distingue ramas. No se leyó ni escribió Neon aquí.

003/004 son copias byte a byte del proyecto principal para reproducibilidad.
No volver a ejecutarlas donde ya existan. 005 recuperación no es requisito.
Revisar 006_mobile_registration.sql contra el esquema REAL y ensayar ROLLBACK
en destino confirmado antes del COMMIT autorizado. No se ejecuta al arrancar.

006 agrega attempts/delivery_state/last_issued_at/send_count a email_verifications.
Crea lapape_registration_executor NOLOGIN, sin administración ni membresía runtime,
con permisos delimitados de identidad/rate limits/auditoría. UPDATE users excluye role_code.
Cinco funciones SECURITY DEFINER, search_path fijo, revocación PUBLIC y revisión de ACL
en misma transacción. Runtime recibe solo EXECUTE, nunca lectura/DML directo.
No altera catalog/demo, inventarios, cuentas previas ni sesiones existentes.
Aborta si el rol/objetos ya existen: inspeccionar historial, no sobrescribir.
Requiere migrador autorizado con CREATE ROLE, propiedad de tablas y permisos de grants;
Express no recibe esa conexión. Runtime preflight comprueba las cinco funciones adicionales.

## Variables (sin configurar valores reales)
Por defecto AUTH_ENABLED=false, AUTH_REGISTRATION_ENABLED=false.
Registro exige API_PROFILE=auth-only y AUTH_ENABLED=true autorizado.
AUTH_REGISTRATION_HMAC_KEY: 32 bytes aleatorios Base64URL, distinta de AUTH_RATE_LIMIT_KEY.
AUTH_MAIL_PROVIDER=brevo, BREVO_API_KEY, AUTH_MAIL_FROM (remitente verificado).
Mantener AUTH_DATABASE_URL con lapape_auth_runtime, endpoint de identidad separado,
AUTH_DATABASE_HOST coincidente, TLS verificado, AUTH_MODE=hosted en Render.
No DATABASE_URL en auth-only. Ningún secreto con prefijo EXPO_PUBLIC_.

## Reproducir pruebas locales, sin cargar .env
Desde backend:
~~~powershell
npm test
npm run check
$env:REGISTRATION_PG_TEST='1'
node --test test/registration-postgres.test.js
Remove-Item Env:REGISTRATION_PG_TEST
~~~
Requiere PostgreSQL 18 local, por defecto C:/Program Files/PostgreSQL/18/bin;
alternativa REGISTRATION_POSTGRES_BIN. Crea clúster único en node_modules/.cache,
puerto efímero, solo 127.0.0.1, contraseñas sintéticas, aplica 001/002/003/004/006.
Se conecta realmente como runtime, no usa DATABASE_URL ni secretos existentes.
Cierra/elimina solo su propio clúster, sin tocar servicios Windows existentes.
Correo simulado en memoria: no demuestra entrega real. La prueba histórica de catálogo
conserva su requisito opt-in independiente.

## Secuencia externa todavía bloqueada
1. Revisar archivos y pruebas; el usuario hace Git manualmente desde este worktree.
2. Autorizar segundo Web Service, Node 24.21.0, root backend, npm ci,
   node src/server.js, /health, HOST=0.0.0.0 y PORT asignado por Render.
   Inicialmente auth-only, AUTH_ENABLED=false, registro/observador apagados,
   sin credenciales de BD/correo. El servicio del catálogo no se modifica.
3. Observación breve de /health solo si se autoriza según SEGURIDAD_AUTH_RENDER.md.
   No inventar proxies ni usar IPs temporales como allowlist. Mantener trust proxy=false.
4. Resolver ingreso confiable ANTES de activar auth. Host o CF/X-Forwarded-* solos
   no acreditan el ingreso. La alternativa firmada NO se implementó por decisión del usuario.
   Con la política actual sin pares acreditados, auth permanece bloqueada.
5. Autorizar 006 en rama confirmada, privilegios runtime y secretos Brevo privados.
   Desactivar/retirar observador; probar TLS/permisos/ingreso y correo real.
6. Activar auth/registro solo tras lo anterior. Probar alta, no verificada, OTP, login,
   me, Recordarme/logout y revocación. Catálogo de 109 productos, solo lectura separada.
7. Usuario configura EXPO_PUBLIC_API_URL en EAS preview con origen HTTPS público validado;
   conserva EXPO_PUBLIC_CATALOG_API_URL de Render, commercial, staging y EXPO_NO_DOTENV=1.
   No claves Brevo/HMAC, contraseñas ni conexión Neon en APK.
8. Tras validación física, incrementar android.versionCode 2->3 conservando package,
   projectId y keystore. No se incrementó ni compiló durante esta ejecución.
Desde C:/Users/david/Desktop/Cuatri10/la-pape-mobile/frontend:
~~~powershell
npx eas-cli@latest build --platform android --profile preview
~~~

## Reversión sin destruir datos
Con autorización, apagar registro/auth en el servicio aislado y comprobar /health
más rutas 404. No relajar HTTPS/proxy, no borrar usuarios/tablas ni revertir 006 de forma
destructiva. Código anterior de login no depende de las columnas nuevas.
APK v2 y catálogo permanecen intactos. Una compilación preview posterior puede volver
a invitado omitiendo AUTH URL, sin reutilizar tokens de otro origen.

Pendientes reales: confianza del ingreso público, SQL autorizado, Brevo/remitente,
entrega/spam, secretos del servicio, prueba Android/iPhone y APK3.

## Archivos de esta ejecución
Modificados:
- backend/.env.example
- backend/README.md
- backend/SEGURIDAD_AUTH_RENDER.md
- backend/src/app.js
- backend/src/config/variables-entorno.js
- backend/src/db/permisos-runtime.js
- backend/src/repositories/repositorio-auth.js
- backend/src/routes/rutas-auth.js

Nuevos:
- backend/REGISTRO_PILOTO.md
- backend/db/migrations/003_identity_auth_schema.sql
- backend/db/migrations/004_mobile_auth_runtime.sql
- backend/db/migrations/006_mobile_registration.sql
- backend/src/controllers/controlador-registro.js
- backend/src/services/correo-registro.js
- backend/src/services/servicio-registro.js
- backend/src/validators/validacion-alta.js
- backend/test/registration.test.js
- backend/test/registration-postgres.test.js

Resultados finales: suite backend 165 aprobadas, 0 fallidas, 2 omitidas por opt-in.
La integración de registro omitida en npm test se ejecutó aparte: 10 aprobadas, 0 fallidas.
La otra omisión es la integración histórica de catálogo PostgreSQL. Sintaxis 44 JS, sin errores.
Semgrep no se reejecutó: Docker Linux no estaba disponible; no se inició ni se instaló nada.
Verificación hash contra 176 archivos previos: ningún archivo perdido, solo ediciones previstas.
Parches de ingreso, encabezados, observador, lock de seguridad y catálogo conservados.

Referencias oficiales: [Render Web Services](https://render.com/docs/web-services),
[red privada](https://render.com/docs/private-network),
[PocketBase/CF-Connecting-IP](https://render.com/articles/host-pocketbase-on-render),
[Brevo transactional email](https://developers.brevo.com/reference/sendtransacemail).
Estas referencias no acreditan una lista estable de pares TCP para este servicio concreto.
