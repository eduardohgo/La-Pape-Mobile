# Arquitectura administrativa compartida: propuesta para revisión

Fecha: 2026-10-12. Esta propuesta documenta trabajo futuro: **no implementa
autenticación, tablas de usuarios, permisos ni endpoints administrativos**. No se
ejecutó SQL, no se importaron cuentas ni inventarios y no se cambió ningún servicio.
La migración `001_catalog_schema.sql` conserva únicamente el catálogo inicial.

## Decisión y límites de confianza

React Native + Expo en `frontend/` y el futuro panel Next.js utilizarán la **misma
API Express en `backend/` y la misma base Neon PostgreSQL 18**: proyecto
`twilight-moon-02635569`, rama `development`, base `lapape_mobile_dev`. No se crea
otro backend ni otra base. `docs/` conserva decisiones y evidencias. El futuro panel
web tendrá su carpeta independiente cuando se autorice; no se crea ahora.

Los cuatro roles de negocio son `CLIENTE`, `TRABAJADOR`, `ADMIN` y `DUENO`. Estos
roles no son usuarios ni privilegios PostgreSQL. Expo y el navegador nunca reciben
la cadena PostgreSQL ni secretos del servidor. Un ADMIN de La Pape tampoco obtiene
privilegios DDL, acceso a la consola Neon, credenciales ni respaldos de la base.

El backend resolverá identidad, estado de cuenta, sesión, permisos, pertenencia
del recurso y alcance de sucursal en cada solicitud. Las vistas pueden ocultar
acciones para facilitar el uso; no autorizan operaciones. La política deniega por
defecto y combina los cuatro roles con permisos por acción y restricciones de
objeto/sucursal. Esta decisión sigue los principios de [OWASP Authorization](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).

## Revisión del backend original: evidencia, no funcionalidad transferida

Fuente confirmada: `la-pape-backend.zip` compartido por el responsable, SHA-256
`df42a240c2cbe71e76c4b4b434527657ac5102af08da40cd871623d865915d00`.
Las referencias siguientes son rutas y líneas **dentro de ese ZIP**, no archivos
incorporados al nuevo backend. La revisión fue de código, sin ejecutar el original.

| Código original | Comportamiento encontrado | Implicación para la reconstrucción |
| --- | --- | --- |
| `prisma/schema.prisma:10–16`, `src/models/User.js:27–30` | Enum con los cuatro roles; Prisma y Sequelize conviven. | Conservar los nombres, diseñar un único acceso a datos sobre `pg`; no copiar `sequelize.sync()` de `src/server.js:197`. |
| `src/middlewares/auth.middleware.js:6–33` | JWT verificado, usuario cargado de BD y hash del token buscado en `user.sessions` JSON. | Reutilizar el principio de verificar sesión en servidor; sustituir el JSON por sesiones consultables/revocables y comprobar cuenta activa y expiración del registro. |
| `src/middlewares/role.middleware.js:2–14` | Autoriza solo por inclusión de `req.user.role` o `rol` en la lista de roles. | No resuelve permisos granulares, sucursal ni propiedad del objeto. |
| `src/server.js:141–150` | Monta `/auth`, `/products`, `/categories`, `/offers`, `/branches`, `/pos`, `/sales`, `/forecast`, `/admin` y `/ai`, sin prefijo `/api`. | Referencia de módulos; esas rutas no se habilitan en el Express actual. |
| `src/routes/product.routes.js:19–30` | GET listado/detalle públicos; creación, importación, exportación, edición, desactivación y eliminación requieren ADMIN o DUENO. | CRUD de catálogo es administrativo. Importación masiva y eliminación necesitan controles propios y auditoría. |
| `src/routes/category.routes.js:14–18`, `offer.routes.js:14–18` | Lectura pública; creación, edición y cambio de estado ADMIN/DUENO. | Separar lectura publicada de borradores administrativos. |
| `src/routes/branch.routes.js:8`, `sale.routes.js:18–28`, `pos.routes.js:12–16`, `forecast.routes.js:8–10` | Sucursales, ventas/POS y reportes/pronósticos limitados a ADMIN/DUENO. | TRABAJADOR aparece en el enum, pero estas rutas no le conceden operaciones. Ventas legacy no equivalen a pedidos de Mobile. |
| `src/routes/admin.routes.js:21–34` | ADMIN/DUENO pueden consultar y generar/descargar/eliminar respaldos y consultar monitoreo. | No transferir controles de infraestructura o descarga de BD al panel de negocio. |
| `src/controllers/auth.controller.js:100,116–139`, `src/utils/validators.js:24` | El registro recibe `rol`, valida que pertenezca a los cuatro y asigna el rol solicitado. | Permite solicitar un rol privilegiado en registro público; debe sustituirse por asignación exclusiva CLIENTE en servidor. |
| `src/controllers/auth.controller.js:380–408`, `src/routes/auth.routes.js:49` | Pregunta secreta recibe email/respuesta y emite sesión sin exigir un desafío ligado a contraseña ya verificada. | Bloquear esta vía; una pregunta secreta no será factor de autenticación ni recuperación. |
| `src/controllers/auth.controller.js:331–368`, `src/routes/auth.routes.js:47–52`, `src/services/token.service.js:5–6` | Segundo factor recibe email/código sin transacción previa ligada a contraseña; rutas de verificación sin el limitador de login; códigos generados con `Math.random()`. | Diseñar desafíos ligados a propósito, usuario y sesión previa, límites por cuenta/IP, consumo atómico y aleatoriedad criptográfica. |
| `src/controllers/auth.controller.js:154–155` | Hay un fallback de correo que registra identidad y código de verificación en terminal. | No transferir logs de códigos, contraseñas, respuestas, JWT, cookies o URLs con credenciales. |
| `prisma/schema.prisma:388–459` | Existencias únicas por sucursal/producto y movimientos; también campos de origen sintético. | Reutilizar relaciones, no filas ni cantidades históricas. No incluir lotes sintéticos en inventario operativo. |
| `src/services/commercial-event.service.js:1–25`, `prisma/schema.prisma:648–660` | Algunas operaciones comerciales escriben evento y bitácora dentro de una transacción. | Buen patrón parcial; no prueba auditoría de todo el CRUD y el esquema no garantiza inmutabilidad. |

La búsqueda de rutas y fuentes `src/**/*.js` del ZIP no encontró políticas `can*`,
tablas de permisos granulares ni rutas específicas para gestionar trabajadores,
marcas o inventario administrativo. El respaldo SQL agrega campos de trabajador
a `users` que no están en el modelo Prisma revisado; no se adoptan como permisos
efectivos ni se importan sus datos. Las capacidades de UI no demuestran autorización.

## Matriz propuesta de permisos

Esta matriz es una propuesta que deberá aprobarse en las Issues futuras. “Concesión”
significa permiso explícito vigente, auditado y restringido a sucursales asignadas;
no es un permiso automático por pertenecer a TRABAJADOR. ADMIN y DUENO actuarán
desde Mobile o Web bajo la misma política. Ningún rol evita validaciones de negocio.

| Operación | CLIENTE | TRABAJADOR | ADMIN | DUENO |
| --- | --- | --- | --- | --- |
| Consultar catálogo publicado | Sí | Sí | Sí | Sí |
| Consultar/editar perfil, direcciones y sesiones propias | Propios | Propios | Propios | Propios |
| Crear y consultar pedidos de cliente | Propios; futuro PB de compras | Como cliente, propios | Como cliente, propios | Como cliente, propios |
| Consultar borradores del catálogo | No | Concesión específica | Sí | Sí |
| Registrar productos y editar descripción | No | Concesión específica | Sí | Sí |
| Modificar precios | No | Concesión específica y límites aprobados | Sí | Sí |
| Agregar/cambiar fotografías | No | Concesión específica | Sí | Sí |
| Gestionar categorías y marcas | No | Concesión específica | Sí | Sí |
| Publicar, activar o desactivar productos | No | No en política inicial | Sí | Sí |
| Consultar inventario interno | No | Concesión y sucursal | Sí | Sí |
| Registrar movimientos/ajustes/transferencias | No | Concesión y sucursal; límites de ajuste | Sí, con motivo y controles | Sí, con motivo y controles |
| Procesar pedidos de terceros | No | Concesión y sucursal | Sí | Sí |
| Gestionar promociones | No | No en política inicial | Sí | Sí |
| Consultar reportes de negocio | No | Concesión y sucursal/campos permitidos | Sí | Sí |
| Invitar/activar/desactivar trabajadores | No | No | Sí, solo CLIENTE/TRABAJADOR | Sí |
| Asignar permisos delegables a trabajadores | No | No | Dentro de catálogo delegable y permisos propios | Sí, dentro de política |
| Nombrar/desactivar ADMIN o DUENO | No | No | No | Sí, con reautenticación/MFA y protección del último DUENO |
| Consultar bitácora administrativa | No | No | Sí, campos permitidos | Sí, campos permitidos |
| Modificar o borrar bitácora | No | No | No | No mediante API |
| Administrar credenciales/DDL/respaldos PostgreSQL | No | No | No | No mediante API de negocio |

Un CLIENTE no accede a otro cliente por conocer su UUID. Un trabajador no cambia
su rol, sus permisos, su sucursal ni concede permisos a otros. ADMIN no puede
nombrarse DUENO ni conceder a trabajadores acciones de gestión de roles. La
reasignación de rol o baja revoca sesiones e incrementa una versión de autorización.
Los permisos delegables se enumerarán explícitamente, por ejemplo
`catalog.product.create`, `catalog.product.content.update`, `catalog.product.price.update`,
`catalog.product.image.update`, `inventory.read`, `inventory.move`, `order.process`,
`report.read`. `identity.role.assign` y `identity.permission.grant` no son delegables
a trabajadores. La granularidad final y límites comerciales requieren aprobación.

## Tablas futuras: contratos a definir, sin SQL añadido ahora

Se proponen esquemas lógicos `identity`, `inventory`, `commerce` y `audit` en la
misma base. No hacen falta para aplicar el catálogo inicial ni implican una segunda
base. Se añadirán por migraciones numeradas una vez autorizadas, conservando los
UUID de `catalog.products`, `catalog.categories` y `catalog.brands`.

| Tabla futura | Relaciones y controles previstos |
| --- | --- |
| `identity.roles` | Cuatro códigos únicos e inmutables CLIENTE/TRABAJADOR/ADMIN/DUENO; no roles arbitrarios desde registro. |
| `identity.users` | UUID, email normalizado único, nombre mínimo necesario, `role_code` FK a roles, estado de cuenta, email verificado, versión de autorización y timestamps con zona. Un rol de negocio por cuenta. No importar personas del respaldo. |
| `identity.permissions` / `role_permissions` | Código único por acción; FK y unicidad rol/permiso. Política versionada por revisión de código. No convertir un payload del cliente en privilegios. |
| `identity.user_branch_assignments` | FK usuario/sucursal, pertenencia activa y fechas; determina alcance. No colocar una sola sucursal global en el usuario si puede trabajar en varias. |
| `identity.user_permission_grants` | Usuario, permiso delegable, alcance global o sucursal, concedente, expiración/revocación y motivo; validar alcance en servidor. Unicidad con semántica definida para NULL; las concesiones no habilitan gestión de roles. |
| `identity.password_credentials` | FK usuario única, hash de contraseña y versión de parámetros; nunca contraseña en claro. Separar del perfil público. Argon2id y parámetros revisados por rendimiento antes de implementación, según [OWASP Password Storage](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html). |
| `identity.sessions` | FK usuario; hash de token de alta entropía, expiraciones absoluta/inactiva, revocación, dispositivo, familia y rotación. No JSON de sesiones dentro de users. |
| `identity.authentication_challenges` | FK usuario, propósito, hash/HMAC, expiración, intentos máximos, consumo atómico y enlace a transacción previa autenticada; OTP corto con HMAC y clave del servidor fuera de DB/Git. |
| `identity.mfa_factors` / `recovery_codes` | Factores enrolados/verificados, claves públicas WebAuthn o secreto TOTP cifrado con clave exterior a DB; códigos de recuperación hash y un solo uso. Nada de preguntas secretas. |
| `identity.staff_invitations` | Destinatario y rol autorizado, creador, hash de invitación, propósito, expiración y consumo único; ninguna contraseña predeterminada. |
| `identity.provisioning_state` | Registro único del bootstrap, destinatario/cuenta previstos y estado consumido irreversible; bloqueo transaccional para impedir provisiones concurrentes o reapertura del primer DUENO. Sin tokens en claro. |
| `inventory.branches` | UUID, nombre y estado operativo; solo sucursales verificadas nuevas. No importar direcciones/personas del respaldo. |
| `inventory.balances` | FK producto/sucursal, UNIQUE por pareja, cantidades reales no negativas, reservas con `0 <= reserved <= on_hand`, versión para concurrencia y fecha de última validación. |
| `inventory.movements` | FK producto/sucursal/actor, delta, motivo, referencia e idempotencia, cantidades antes/después y fecha; registro inmutable. Transferencia con origen/destino en una transacción. |
| `commerce.orders` / `order_items` | FK cliente, sucursal cuando proceda; líneas con precio/moneda/descripción de la operación, cantidades positivas, transiciones de estado e idempotencia. Producto histórico no se elimina en cascada. |
| `commerce.promotions` / relaciones de alcance | Vigencia, estado, reglas y productos/categorías relacionados; cálculo y límites en servidor. No copiar ofertas sintéticas. |
| `audit.events` | UUID, actor, permiso/acción, recurso, sucursal, resultado, motivo, request ID, fecha y diff permitido; sin secretos ni cuerpos completos. Escritura append-only para el runtime. |

Las FK del catálogo seguirán `RESTRICT`. Los registros operativos y de auditoría
no se borrarán en cascada al desactivar usuario, sucursal o producto. Se definirán
retención y minimización de datos personales antes de implementar. Los reportes
serán consultas agregadas del backend con permiso y alcance; no descargas libres
de tablas ni una réplica de la base para cada cliente.

Inventario desconocido no equivale a cero. Hasta validar saldos físicos no se
publicará disponibilidad comercial ni se permitirá vender. Las cantidades no se
editarán directamente mediante PATCH del producto: una operación transaccional
validará permiso, sucursal, idempotencia, saldo y movimiento, con bloqueos de filas
o comparación de versión para impedir pérdidas de actualización y sobreventa.

En una migración futura del catálogo se agregará `products.is_active` separado de
`is_published`: revisión/publicación y baja operativa tienen significados distintos.
La lectura pública futura exigirá ambos estados y categoría activa. Una fotografía
pendiente permanecerá NULL; no se reemplazará por una URL no verificada. La subida
de imágenes validará contenido, tamaño y dimensiones, eliminará metadatos privados
y almacenará solo identificadores/HTTPS aprobados. El backend no descargará URLs
arbitrarias del usuario; eso requiere controles de SSRF y proveedores permitidos.

Las propuestas anteriores no asignan números de migración reservados: después de
001 habrá aprobación/importación del catálogo y, por Issues autorizadas, cambios
aditivos de publicación, identidad/sesiones/RBAC, sucursales/inventario y operaciones
comerciales. Cada migración tendrá pruebas y revisión de FK, rollback operativo y
compatibilidad del contrato; no habrá sync, db push ni DDL al arrancar Express.

## Registro, sesiones y creación del primer DUENO

El registro público utilizará un DTO permitido explícitamente y asignará CLIENTE
en servidor. Solicitudes con `rol`, `role`, `permissions` o campos de sucursal
privilegiados se rechazarán; no se propagan mediante un spread a la base. Un default
de BD CLIENTE es defensa adicional, no reemplazo de esta validación. Tampoco un
login social podrá solicitar un rol privilegiado.

Para el primer DUENO se propone un **procedimiento de provisión fuera de HTTP**,
implementado y aprobado posteriormente, ejecutado una vez por el operador autorizado:

1. Confirmar en consola proyecto/rama/base exactos y la identidad/email del dueño;
   seleccionar una conexión administrativa directa TLS por un canal secreto fuera
   de Git. No pedir ni registrar esos valores durante esta preparación.
2. La utilidad futura tomará un bloqueo transaccional sobre un registro de provisión
   único y verificará que no exista DUENO activo ni provisión ya consumida. Evitar
   que dos ejecuciones concurrentes puedan crear dos primeros dueños o reabrir el
   bootstrap. Detenerse ante estado inesperado; no degradar cuentas existentes.
3. Crear cuenta DUENO en estado invitado, sin contraseña inicial, y una invitación
   aleatoria criptográfica de un solo uso, corta vigencia y hash en DB. Entregarla
   por canal seguro al destinatario verificado, nunca en logs, commits o parámetros
   de comandos que queden en historial. No se envía ninguna invitación ahora.
4. El dueño elige su contraseña y enrola/verifica MFA; consumir invitación y activar
   cuenta de forma atómica. Un segundo token o enlace vencido no puede funcionar.
5. Auditar provisión y activación con datos mínimos. Deshabilitar el mecanismo de
   primer dueño definitivamente; invitaciones posteriores solo por DUENO existente.

Para baja/democión de dueños, una transacción y bloqueo compartido entre operaciones
concurrentes contará DUENO activos y rechazará dejar cero; también habrá
reautenticación, MFA y auditoría. No se permite autoescalamiento desde perfil, cambio
de contraseña o tokens. El caso inicial con DUENO invitado es exclusivamente el
bootstrap; no equivale a autorizar bajas que dejen el negocio sin dueño activo.

Los cambios sensibles exigirán autenticación reciente. MFA será obligatorio para
ADMIN/DUENO y su recuperación tendrá controles propios, sin pregunta secreta.
Las sesiones deberán expirar/revocarse en servidor y rotarse al cambiar privilegios,
según [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html)
y [OWASP MFA](https://cheatsheetseries.owasp.org/cheatsheets/Multifactor_Authentication_Cheat_Sheet.html).

## Una política administrativa para Mobile y Web

Los dos clientes consumen el mismo contrato HTTP y permisos efectivos. Controllers
validan DTO; middleware valida identidad/sesión; políticas comprueban acción y
objeto/sucursal; servicios ejecutan transacciones y auditoría; repositorios `pg`
usan parámetros. La autorización se repite en el servicio para usos internos y no
se confía en que un controller siempre esté presente. Las rutas administrativas
futuras separarán lectura de borradores y escrituras del catálogo público. No se
publican ni siquiera como stubs en este avance.

Mobile almacenará credenciales de sesión con almacenamiento seguro apropiado
cuando se autorice la autenticación. El futuro panel Next.js usará sesiones en
cookies HttpOnly, Secure y SameSite con protección CSRF para mutaciones; se
revisará el flujo web y sus orígenes antes de habilitar credenciales en CORS.
No almacenar tokens de larga duración en localStorage. CORS no es autorización.
Los mecanismos de transporte pueden diferir sin duplicar reglas de negocio.

El cliente nunca fija actor, rol, precio final, permisos o saldos confiables. El
servidor determina esos valores. Auditoría de una mutación y mutación se guardan
en la misma transacción: si la bitácora obligatoria falla, la operación revierte.
Accesos denegados e intentos de escalamiento se registran aparte con datos mínimos.
El runtime puede insertar auditoría pero no actualizarla/borrarla; se revisarán
privilegios de operador, retención y evidencia externa de manipulación. Append-only
para la aplicación no significa que un propietario PostgreSQL no pueda alterar DB.

## Relación con GitHub Projects y pruebas futuras

Mapa de dependencias verificado contra las Issues existentes; **no declara terminado
el alcance ni amplía unilateralmente criterios aprobados**:

| Trabajo | PB e Issues relacionadas | Alcance disponible / límite |
| --- | --- | --- |
| Registro/login y bloqueo de escalamiento público | PB-03 [#26](https://github.com/eduardohgo/La-Pape-Mobile/issues/26), [#28](https://github.com/eduardohgo/La-Pape-Mobile/issues/28), [#29](https://github.com/eduardohgo/La-Pape-Mobile/issues/29), [#31](https://github.com/eduardohgo/La-Pape-Mobile/issues/31), pruebas #104/#105 | Registro y autenticación de aplicación; RBAC administrativo/bootstrap requieren definir alcance adicional. |
| Recuperación segura | PB-04 #34–36/#38, pruebas #106/#107 | No reutilizar pregunta secreta ni códigos sin desafío/consumo/límites. |
| Consumo de catálogo y categorías | PB-06 #44/#45/#47/#48, pruebas #109/#110 | Lectura pública; no equivale a autorización de CRUD administrativo. |
| Detalle e inventario mostrado | PB-07 #52/#53, prueba #111 | Detalle por UUID; mostrar existencias exige inventario validado posterior. |
| Verificar existencias | PB-08 #60, prueba #112 | Dependencia de lectura para carrito; no cubre administración de sucursales ni movimientos. |
| Registro y consulta de pedidos | PB-09 #67/#68, pruebas #114/#115; PB-10 #69–74/#116 | Pedidos del cliente; procesar pedidos ajenos es un alcance administrativo distinto. |
| Controles y validación de seguridad | PB-12 #88/#89 y pruebas correspondientes | Dependencia para autorización/MFA/auditoría; no declarar implementados módulos ausentes. |

No existe una Issue específica aprobada para CRUD administrativo, asignación de
roles, primer DUENO, trabajadores, inventario por sucursal, promociones, reportes
o auditoría completa. Antes de programarlos se propondrán actividades **técnicas**
con criterios de aceptación y su PB/Sprint, para aprobación del responsable; no se
crean Issues ahora ni tareas de mantenimiento del tablero. Interfaz y navegación
permanecen relacionadas con PB-02, sin programar panel administrativo anticipadamente.

Pruebas a definir en esas actividades: registro forzado CLIENTE y rechazo de campos
privilegiados; matriz completa de acciones/roles; acceso a UUID ajeno/sucursal ajena;
sesión expirada/revocada y cuenta desactivada; concesión revocada; OTP ligado a flujo
previo y consumo único; concurrencia de movimientos y último dueño; intento de
editar roles propios; permisos delegados fuera de catálogo; auditoría transaccional
sin secretos; equivalencia de autorización al consumir API desde Mobile y Web.
Son pruebas futuras, no resultados ejecutados en este avance.

PB-01 sigue In Progress, #19 Testing a la espera de iPhone y PR #121 abierto sin
fusionar. Este documento no cambia los estados ni los campos de planeación.
