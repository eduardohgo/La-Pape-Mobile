# Candidato de autenticación pública de Tigre10

Worktree: render/auth-tigre10.
Base verificada: d119fc1baa467011d2c48ea6adb342b3cc07908f.
Este documento no autoriza crear servicios, activar autenticación ni migrar Neon.

## Perfil exclusivo

API_PROFILE=shared conserva el comportamiento anterior.
API_PROFILE=auth-only restringe el servicio a salud y, solo si se autoriza después
AUTH_ENABLED=true, las tres operaciones existentes:

- GET /health (también HEAD de salud).
- POST /auth/login.
- GET /auth/me.
- POST /auth/logout.

El perfil no activa autenticación. Con AUTH_ENABLED=false solo funciona salud;
las rutas de autenticación devuelven 404 sin procesar sus cuerpos.

El arranque en perfil exclusivo rechaza:

- CATALOG_API_ENABLED=true y CATALOG_DEMO_API_ENABLED=true.
- DATABASE_URL no vacía: este servicio no necesita credenciales del catálogo.
- CLOUDINARY_ENABLED=true y AUTH_RECOVERY_ENABLED=true.

Registro continúa apagado por defecto. Desde el 23/11/2026 existe un opt-in local
AUTH_REGISTRATION_ENABLED que exige auth-only, AUTH_ENABLED=true, migración 006
y configuración Brevo validada; incorpora POST /auth/register, /auth/register/resend
y /auth/register/verify. No se activó en ningún servicio. Ver REGISTRO_PILOTO.md.
Recuperación, demo, cargas, catálogo y administración no se montan.
003/004 se incluyeron sin cambios para pruebas reproducibles locales; no se copió 005,
cuentas reales/sintéticas persistentes, certificados ni recursos DPAPI.

El router de autenticación permite solo las rutas y métodos expresamente habilitados.
Otros métodos devuelven 405 con Allow; otras rutas devuelven 404. CORS puede
resolver OPTIONS sin ejecutar operaciones de autenticación.

Configuración no sensible prevista para una primera comprobación futura:

~~~dotenv
NODE_ENV=production
APP_RUNTIME=render
API_PROFILE=auth-only
HOST=0.0.0.0
AUTH_ENABLED=false
AUTH_MODE=hosted
AUTH_ALLOW_LOOPBACK_HTTP=false
TRUST_PROXY=0
CATALOG_API_ENABLED=false
CATALOG_DEMO_API_ENABLED=false
CLOUDINARY_ENABLED=false
~~~

PORT lo asignará Render. No crear ni modificar un .env real para esta revisión.
AUTH_DATABASE_URL, AUTH_DATABASE_HOST y AUTH_RATE_LIMIT_KEY se proporcionarán
privadamente solo en una fase autorizada de activación. No configurar
DATABASE_URL ni sustituir conexiones silenciosamente.

## Encabezados y orden de validación

Helmet y la comprobación de encabezados originales se ejecutan antes de confiar
en metadatos de proxy o interpretar JSON. Se cuentan los pares de rawHeaders sin
distinguir mayúsculas: Node puede descartar duplicados de Authorization y Host
al construir req.headers.

Se rechazan con 400 los duplicados de Authorization, Host, CF-Connecting-IP,
X-Forwarded-Proto, Content-Type, Content-Length y Transfer-Encoding, incluso
idénticos. También sus valores vacíos o con listas separadas por comas, Host
malformado y ausencia de Host en HTTP/1.1. Las respuestas no reflejan valores.
Los límites y el parser estricto de Node siguen activos: framing inválido o
encabezados excesivos pueden ser rechazados antes de Express.

La autenticación verifica HTTPS antes del limitador HTTP y del parser del cuerpo.
No consulta sesiones ni deriva contraseñas ante un ingreso inválido. Una petición
válida consume el limitador HTTP una sola vez. /health queda fuera del limitador
y no accede a PostgreSQL.

## Frontera de confianza pendiente

Express mantiene trust proxy=false. El ingreso alojado exige simultáneamente:

1. Interlocutor TCP en RENDER_TRUSTED_PROXY_IPS.
2. Un único X-Forwarded-Proto: https.
3. Un único CF-Connecting-IP válido, sin puerto, lista o zona IPv6.

No se agregaron IPs confiables. Loopback y RFC 5737 en las pruebas son sintéticos
y no deben copiarse a Render. Los rangos de salida del servicio y los rangos
públicos de Cloudflare no equivalen al interlocutor TCP.

Forwarded y X-Forwarded-* no son alternativas de identificación y se descartan
del mapa de encabezados. No se consulta X-Real-IP para esta decisión.
La agrupación IPv6 y la normalización IPv4 mapeada del limitador se conservan.

Antes de activar AUTH_ENABLED falta acreditar el camino público real, el
tratamiento de encabezados y los interlocutores de Render, su estabilidad y
posibles caminos privados. Si no puede acreditarse esa frontera, detener la
activación; no ampliar confianza para hacerla funcionar. La comprobación futura
será privada y no requiere rutas públicas de diagnóstico.

## Seguridad conservada

No se modifican Argon2id, tokens opacos, hash SHA-256 de tokens, consultas
parametrizadas, funciones PostgreSQL, expiración, usuarios activos y verificados,
revocación ni restricciones de roles. /auth/me y /auth/logout requieren Bearer
válido y el mismo control de ingreso que login.

Los límites HTTP siguen siendo por proceso. Los límites PostgreSQL de login
siguen compartidos; su clave HMAC debe ser estable entre instancias. No equivalen
a un límite independiente por cuenta ante ataques desde muchas IP ni acreditan
protección completa contra abuso distribuido.

## Verificación local reproducible

Desde backend con Node 24.21.0 y el lock existente:

~~~powershell
npm ci
node --test test/auth-ingress.test.js test/render.test.js
npm test
npm run check
~~~

Las nuevas pruebas usan sockets loopback efímeros, servicio simulado y credenciales
sintéticas. Cubren duplicados transmitidos por HTTP, contradicciones, framing,
origen TCP no confiable, HTTPS ausente, evasión por encabezados, normalización
de IP, límites, expiración, logout, errores sanitizados y rutas deshabilitadas.

La integración de catálogo con PostgreSQL local se omite si faltan
AUTH_TEST_POSTGRES_BIN y CATALOG_TEST_OPENSSL. No se conectan estas pruebas a
Neon ni Render. No acreditan ingreso real de Render ni funcionamiento en Android.

El lock conserva body-parser 1.20.9, ip-address 10.7.6 y qs 6.16.2; también se
conservan las correcciones de parámetros de catálogo y controles de permisos.
No se modifican el worktree de catálogo, el repositorio principal ni su APK.

## Fuentes

- [Node: headers y duplicados](https://nodejs.org/docs/latest-v24.x/api/http.html#messageheaders).
- [Express detrás de proxies](https://expressjs.com/en/guide/behind-proxies/).
- [Render: ingreso público](https://render.com/articles/host-pocketbase-on-render).
- [Render: TLS](https://render.com/docs/web-services#connecting-from-the-public-internet).
- [Cloudflare: encabezados](https://developers.cloudflare.com/fundamentals/reference/http-headers/).

## Alcance de calidad del frontend

Este worktree conserva el frontend de la base desplegada sin cambios y no tiene
frontend/node_modules. El intento de TypeScript sin emisión no puede resolver
expo/tsconfig.base, Expo Router ni React Native; no se acredita como aprobado.
No se instalaron dependencias móviles ni se corrigió ese código fuera de alcance.
El parche de autenticación es JavaScript y se verifica con node:test, node --check
y ESLint sobre los archivos JavaScript modificados.


## PASO 71 — Observador temporal de ingreso (solo preparación local)

El observador está implementado localmente, no desplegado. No acredita una
frontera de confianza y no modifica RENDER_TRUSTED_PROXY_IPS ni trust proxy=false.
No activa autenticación, no monta endpoints y no utiliza credenciales de Neon.

### Activar y desactivar

La configuración está apagada por defecto. Para una prueba autorizada se requiere:

~~~dotenv
API_PROFILE=auth-only
AUTH_ENABLED=false
INGRESS_OBSERVER_ENABLED=true
INGRESS_OBSERVER_EXPIRES_AT=<fecha ISO UTC canónica con milisegundos>
~~~

No copiar literalmente el marcador de fecha. En PowerShell puede calcularse
una fecha no sensible, diez minutos hacia el futuro, con:

~~~powershell
([DateTime]::UtcNow.AddMinutes(10)).ToString("yyyy-MM-dd'T'HH:mm:ss.fff'Z'")
~~~

La fecha debe coincidir con el formato producido por Date.toISOString(), sin
espacios, y no estar a más de 30 minutos del arranque. Una fecha ausente,
malformada o demasiado futura impide arrancar. Si ya venció, Express puede
arrancar y /health funciona, pero el observador queda silencioso. Un reloj
monotónico evita extender la ventana si el reloj del sistema retrocede.
Los reinicios conservan el vencimiento absoluto configurado; no generan una
ventana nueva. Cada proceso puede emitir como máximo 50 observaciones.

El arranque rechaza observación con otro perfil, AUTH_ENABLED=true o incluso
AUTH_ENABLED omitido. También rechaza esa combinación si el observador venció.
La comprobación ocurre antes de leer la credencial de autenticación.
La fábrica del middleware repite la restricción contra configuraciones
inyectadas con autenticación, pools configurados u otros módulos habilitados.

Para desactivar, usar INGRESS_OBSERVER_ENABLED=false. La fecha restante se
ignora. Los cambios requieren reiniciar únicamente el proceso correspondiente;
en Render requerirán un despliegue autorizado del servicio aislado. No reiniciar
por este procedimiento el backend de desarrollo actual ni el catálogo público.
No se modificó ningún .env real durante esta implementación.

### Selección y alcance

Solo se observan GET y HEAD de la ruta exacta /health cuando existe un único
encabezado X-LaPape-Ingress-Case con una de estas categorías:

- baseline
- cf-spoof
- proto-spoof
- duplicates
- alternate
- ipv6

Sin encabezado, con categoría desconocida o con selector duplicado no se emite
observación. Esto evita llenar los registros con los health checks automáticos.
El selector es público y falsificable: sirve para clasificar pruebas, nunca
para autenticar ni acreditar su procedencia. Un tercero podría agotar el cupo
de diagnóstico; la ausencia de registros no prueba que no hubo tráfico.

No se agregaron rutas, cabeceras de respuesta ni campos a /health.
Los errores por encabezados inválidos conservan sus códigos y mensajes previos.
La observación toma categorías antes de validar o eliminar encabezados y emite
después de finalizar la respuesta. Si se aborta, limpia sus suscripciones y no
declara una respuesta completada.

### Registro permitido y datos excluidos

Cada línea de observación contiene únicamente este esquema cerrado:

| Campo | Categorías o tipo |
| --- | --- |
| level | info |
| event | ingress_observation |
| probe_case | Una de las seis categorías anteriores |
| method | get o head |
| socket_tls | booleano; describe el socket, no HTTPS externo |
| cf_ip_format | absent, ipv4, ipv6, invalid o duplicate |
| forwarded_proto | absent, https, http, invalid o duplicate |
| critical_duplicates | booleano |
| forwarded_chain_present | booleano |
| trust_assessed | Siempre false |
| response_class | success, redirect, client-error, server-error u other |

Nunca se registran IP, identificadores de usuario, hosts, URL, query strings,
contraseñas, OTP, tokens, cookies, cuerpos, encabezados completos ni sus hashes.
El middleware no lee la IP del interlocutor TCP, el cuerpo ni los valores de
Authorization o Cookie. CF-Connecting-IP se clasifica por formato, sin conservarlo
en registros. No hay historiales, comparación de IP entre solicitudes ni claves
secretas adicionales.

Una falla del emisor desactiva las siguientes observaciones de ese proceso.
Solo intenta registrar el evento fijo ingress_observer_write_failed, sin
serializar la excepción. Esa falla nunca cambia la respuesta HTTP.
No se crean archivos de diagnóstico. Un futuro proveedor podría almacenar stdout
y sus propios logs de plataforma: revisar acceso y retención antes del despliegue.

### Pruebas locales reproducibles

Desde la carpeta backend del worktree autorizado, sin cargar un .env:

~~~powershell
node --test test/ingress-observer.test.js
node --test test/auth-ingress.test.js test/render.test.js
npm test
npm run check
~~~

Las pruebas levantan únicamente listeners loopback efímeros que ellas cierran,
usan datos sintéticos y no hacen login remoto. Incluyen exclusión mutua con auth,
privacidad, cuerpos y getters sensibles que no deben leerse, duplicados,
caducidad, reloj, límites, limpieza de suscripciones, errores del emisor,
arranque health-only y ausencia de llamadas a Pool.connect, Pool.query o
Client.connect. Se conserva la limitación de la integración PostgreSQL local
omitida cuando no se proporcionan sus herramientas.

### Futuro procedimiento de validación en Render

Todo lo siguiente requiere autorización adicional; no se ejecutó:

1. Publicar manualmente el candidato revisado y crear únicamente el servicio
   aislado, con API_PROFILE=auth-only y AUTH_ENABLED=false.
2. No proporcionar DATABASE_URL, AUTH_DATABASE_URL ni credenciales de usuario.
   Mantener catálogo, demo, registro, recuperación y cargas deshabilitados.
3. Autorizar observación con fecha corta y enviar un lote pequeño a /health
   usando X-LaPape-Ingress-Case: baseline y las otras categorías.
4. Comparar categorías de protocolo/formato y rechazos al introducir solo
   valores sintéticos. Verificar que ningún endpoint de autenticación esté activo.
5. Repetir las comprobaciones después de reiniciar únicamente ese servicio.
   Revisar configuración de red, dominios y caminos alternativos con Render.
6. Apagar y retirar el observador antes de considerar la activación de auth.

Las categorías describen únicamente lo que llegó al proceso. Una IP con formato
válido podría seguir siendo falsificada: este observador no compara valores ni
demuestra que Render sobrescribió una IP enviada por el cliente. Tampoco demuestra
interlocutores TCP estables, origen confiable, exclusión de redes privadas, TLS
extremo a extremo ni resistencia a evasión distribuida de límites.
Un https recibido en un encabezado no acredita HTTPS por sí mismo.

El borde puede normalizar duplicados antes de Node. El parser de Node puede
rechazar una solicitud antes de Express, en cuyo caso no habrá observación.
Un 200 de /health tampoco acredita confianza del proxy. Las garantías oficiales,
el aislamiento y las pruebas adicionales siguen pendientes.

### Retirada completa posterior

Primero desactivar INGRESS_OBSERVER_ENABLED y reiniciar únicamente el proceso
aislado cuando esté autorizado. Para retirar el código:

1. Quitar de app.js el import de createIngressObserver, su creación, el montaje
   condicional y el parámetro opcional ingressObserverLogger.
2. Quitar de variables-entorno.js ingressObservation(), su llamada y la propiedad
   ingressObserver de la configuración.
3. Retirar las dos variables del ejemplo y de la configuración del servicio
   cuando exista autorización para modificarla.
4. Eliminar solo observador-ingreso.js e ingress-observer.test.js.
5. Conservar la validación de encabezados, ingreso-render.js, perfil auth-only,
   rutas, sesiones y el resto del trabajo previo. CRITICAL_HEADER_NAMES puede
   permanecer: la validación de seguridad lo utiliza independientemente.
6. Mantener este expediente como evidencia histórica, marcar el retiro y ejecutar
   nuevamente las pruebas del backend, sintaxis y revisión de diferencias.

No aplicar reset, clean ni restauraciones generales para retirar el diagnóstico.
