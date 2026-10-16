# Preparación del catálogo para Neon PostgreSQL 18

Estado: **migración 001 aplicada y validada en Neon; catálogo todavía sin datos**.
Confirmación recibida del responsable: 2026-10-12.
Destino confirmado por el responsable: proyecto **La Pape Mobile**,
`twilight-moon-02635569`, rama **development**, base **lapape_mobile_dev**, PostgreSQL **18**.
ChatGPT realizó la ejecución y validación real, confirmadas por el responsable:
`catalog.categories`, `catalog.brands` y `catalog.products` creadas, dos FK validadas,
cero filas en las tres tablas, `image_url` nullable y ninguna tabla adicional
inesperada. El estado anterior de cero tablas es histórico. Codex registra estos
resultados sin consultar Neon, obtener credenciales ni repetir SQL.

## Alcance revisado

Se conserva una proyección del catálogo, no una restauración completa de las 26 tablas
ni un reemplazo completo del esquema Prisma del backend web. Se conservan los UUID
de los productos candidatos y las relaciones normalizadas de categoría y marca.
Las tablas ya creadas en el esquema `catalog` son:

| Tabla | Relación y protección |
| --- | --- |
| `categories` | UUID, nombre único, estado de publicación de la categoría |
| `brands` | UUID y nombre único; dependencia explícita del producto aprobado |
| `products` | UUID, SKU único general canónico, FK obligatorias a categoría y marca, precio decimal positivo, moneda MXN revisada, imagen NULL o HTTPS, publicación tras revisión |

Las FK usan `ON DELETE RESTRICT` y `ON UPDATE RESTRICT`: una categoría o marca
referenciada no puede desaparecer silenciosamente. Se evita duplicar los textos
legacy `category` y `brand` de `products`. Las columnas de sucursal/proveedor se
omiten con sus tablas: no pertenecen al catálogo público preparado y sus relaciones
deberán diseñarse en las actividades autorizadas correspondientes.

No se trasladan `stock`, inventarios por sucursal, movimientos, usuarios, direcciones,
proveedores, ventas, pedidos, sesiones, roles, códigos de recuperación o datos personales.
Los timestamps nuevos registran revisión/importación con zona horaria; no se reinterpretan
los timestamps históricos sin zona del respaldo como fechas UTC verificadas.

Esta proyección requiere consultas nuevas sobre `catalog.*`; no puede usarse con
el Prisma histórico sin adaptar sus modelos y consultas. El backend existente utiliza
`pg`; no se añaden Prisma ni Sequelize ni sincronización automática.

## Datos pendientes, sin importación

Fuente: `10 (1).zip`, SQL `02_Base_Datos/Respaldo_BD_LaPape_Sin_Datos_Sensibles.sql`.
El SHA-256 del SQL auditado es
`b03c2111ad3245c9cfee7f823cd770c6ce14d7e76883fc2e518d345674eb908f`.
El respaldo contiene 212 productos: 200 sintéticos, 10 candidatos LAP y dos registros
fuera del catálogo inicial (`tijeras jeje` e `iphone15`). Solo los 10 candidatos se
incluyen en el manifiesto de revisión, **ninguno está aprobado**.

| SKU candidato | Categoría de referencia | Precio del respaldo, sin aprobar |
| --- | --- | --- |
| LAP-CUA-001 | Cuadernos | 89.90 |
| LAP-MAR-005 | Arte | 75.00 |
| LAP-HOJ-020 | Oficina | 129.00 |
| LAP-PEG-015 | Arte | 24.90 |
| LAP-PLU-010 | Oficina | 68.50 |
| LAP-COL-011 | Arte | 94.00 |
| LAP-CAR-030 | Arte | 18.50 |
| LAP-ENG-040 | Oficina | 119.00 |
| LAP-FOM-050 | Arte | 42.50 |
| LAP-TIN-060 | Oficina | 54.00 |

Las tres categorías y seis marcas del manifiesto son dependencias candidatas, no
datos aprobados para importar ahora. Se insertarán únicamente las que referencien
productos aprobados. Las siete categorías restantes quedan fuera de este catálogo
inicial: contienen pruebas, productos sintéticos o no tienen candidatos aprobables.

Dos imágenes locales presentan diferencias de marca: `cuaderno.jpg` muestra Norma
frente a Scribe en el SQL; `marcadores.webp` muestra STABILO frente a Maped.
Las ocho URLs remotas de los candidatos tampoco acreditan vigencia, correspondencia
o derechos de uso. Las rutas relativas del frontend web no funcionarán por sí solas
como imágenes públicas de Mobile. El responsable debe revisar precio, moneda, nombre,
descripción, categoría y marca antes de aprobar cada producto. Una fotografía
proporcionada debe verificarse y usar HTTPS; la ausencia puede quedar explícitamente
aceptada para publicar sin foto, mediante una decisión independiente de revisión.
No se inventan fotografías ni existencias. Un stock desconocido no equivale a cero.

Los diez `catalog.imageUrl` se mantienen NULL hasta verificar una fotografía.
El manifiesto **v2** añade `review.imagePendingAccepted`, actualmente false en todos.
Una futura aprobación sin foto requiere tanto `review.image=true` como
`imagePendingAccepted=true`, además de todos los otros criterios, revisor, fecha y
`approved=true`. Con foto HTTPS, la aceptación de ausencia debe ser false. NULL por
sí solo nunca aprueba un producto. Las URLs de origen siguen disponibles solo como
referencia en `source`.

La tabla admite SKU ASCII canónicos de 1–60 caracteres, inicio alfanumérico, resto
alfanumérico/punto/guion/guion bajo, en mayúsculas y con UNIQUE y collation C.
Ejemplos: `ABC123`, `SKU-2026`, `AB.CD`, `AB_CD` y códigos numéricos como texto.
Los marcadores auditados y prefijos reservados sintéticos se rechazan; no se bloquea
una descripción legítima de materiales como papel sintético. El importador de este
respaldo conserva la lista cerrada de diez UUID/SKU; los futuros productos reales se
registrarán mediante una funcionalidad administrativa autorizada, no ampliando
silenciosamente este importador.

## Archivos y ejecución posterior

- `backend/db/migrations/001_catalog_schema.sql`: migración aplicada, transaccional, sin datos,
  con guardias de base, PostgreSQL 18 y estado inicial vacío. No contiene `DROP`,
  sincronización, credenciales ni importación del dump.
- `backend/db/catalog-review.json`: lista cerrada de candidatos y decisiones pendientes.
- `backend/scripts/catalog-validate.js`: valida el manifiesto localmente.
- `backend/scripts/catalog-generate.js`: genera SQL revisable solo de aprobados;
  no abre conexiones. Con cero aprobados se bloquea la generación.
- `backend/db/queries/`: tres consultas parametrizadas de solo lectura.
- `backend/db/validation/`: preflight, revisión de esquema e integridad, preparados
  para ejecución manual posterior autorizada, en transacciones de solo lectura.
- `backend/tools/check_sql.py`: análisis local con gramática PostgreSQL 18;
  no interpreta el SQL mediante un servidor ni conecta a bases.

La migración inicial **ya se aplicó; no se debe repetir ni modificar su archivo**.
Su comentario inicial de preparación se conserva como contenido histórico del
archivo aplicado, no como declaración del estado actual. Una segunda ejecución
se detendría ante el esquema existente; no debe usarse como verificación.
Una migración posterior deberá tener un número nuevo, conservando las anteriores.
La generación determinista y la versión Git permiten comparar exactamente el SQL
aprobado. El directorio de salida `backend/db/generated/` está ignorado: el futuro
archivo aprobado se incorporará explícitamente como una nueva migración revisada.

La creación y verificación del esquema ya están confirmadas. Continuación propuesta,
**todavía no autorizada ni ejecutada**:

1. Preparar la revisión individual de los diez candidatos: precios, marcas,
   categorías, contenido y fotografía o aceptación explícita de ausencia.
2. Registrar las decisiones aprobadas en el manifiesto y validar, sin importar aún.
3. Generar una importación versionada, revisar UUID, precios, categorías, marcas,
   imágenes y conteos, y obtener autorización específica para esa importación.
4. Confirmar primero el destino exacto y las tres tablas existentes sin filas;
   solo entonces aplicar exclusivamente la importación autorizada y validar ausencia
   de sintéticos e inventarios, FK e identidad de productos.
5. Preparar un rol de conexión de runtime con solo `USAGE` y `SELECT` sobre catálogo,
   sin privilegios de creación ni escritura y separado del propietario de migraciones.
6. Conectar y probar los endpoints del catálogo únicamente al autorizar las Issues
   relacionadas, reutilizando Express y las consultas existentes.

No existe un comando de migración en `npm start` ni en `/health`. La protección
`executionAuthorized:false` del archivo de destino documenta que no hay autorización
para nuevas operaciones SQL ni importaciones, aunque 001 ya esté aplicada;
no sustituye las guardias SQL ni la autorización humana.

## Conexiones del backend

`DATABASE_URL` será una conexión **pooled** del rol de lectura para Express.
`DATABASE_URL_UNPOOLED` será una conexión **directa** administrativa para ejecución
manual de migraciones; el servidor no la lee. Ambas se guardan únicamente en
configuración secreta fuera de Git. No se han solicitado ni incorporado sus valores.
Esta separación sigue la [documentación oficial de pooling de Neon](https://neon.com/docs/connect/connection-pooling).

La configuración acepta `sslmode=require` o `verify-full` y traduce ambos a TLS con
`rejectUnauthorized:true`. Se eliminan los parámetros SSL de la URL antes de entregarla
a `pg`, pues pueden reemplazar el objeto TLS explícito ([documentación de pg](https://node-postgres.com/features/ssl)).
No se admite desactivar TLS remoto ni sustituir certificados desde la URL.

**Limitación de pg 8.20:** `enableChannelBinding:true` usa SCRAM-PLUS si el servidor
lo ofrece, pero no obliga a que esté disponible. Por eso `channel_binding=require`
se rechaza explícitamente. La copia de URL del runtime puede usar
`sslmode=verify-full&channel_binding=prefer`, manteniendo la verificación de certificado
y hostname. Esto no afirma equivalencia con channel binding obligatorio. Si se exige
`require`, habrá que elegir y revisar un cliente que lo imponga antes de conectar.
La URL administrativa de psql puede conservar `channel_binding=require` con TLS
verificado y su CA configurada; no modificar esa URL para acomodar el runtime.
Ver [Neon TLS](https://neon.com/docs/connect/connect-securely).

La fábrica del pool sigue siendo perezosa y el servidor no la utiliza. Expo consume
la API HTTP de Express; nunca recibe `DATABASE_URL`, credenciales o acceso PostgreSQL.
`EXPO_PUBLIC_API_URL` contiene únicamente la dirección pública de Express.

## Contrato HTTP propuesto, todavía no habilitado

| Ruta | SQL preparado | Comportamiento futuro |
| --- | --- | --- |
| `GET /categories` | `categories.sql` | Categorías activas con productos publicados; `{data: [...]}` |
| `GET /products?categoryId=<uuid>&after=<uuid>&limit=20` | `products-list.sql` | Solo publicados, orden UUID estable, límite 1–50 y cursor; `{data, page: {hasMore, nextCursor}}` |
| `GET /products/<uuid>` | `product-detail.sql` | UUID validado; `{data: {...}}`; 404 si no existe o no está publicado |

El responsable confirmó el detalle por UUID. No se usa `/api` ni se distingue listado
y detalle exclusivamente por una barra final. Los futuros controladores rechazarán
UUID o límites inválidos con 400; el SQL usa parámetros `$1`, `$2`, `$3`, campos
explícitos y precios como texto decimal. No interpolar valores en SQL.

Listado y detalle preservan `image_url=NULL` sin eliminar esos productos. El contrato
TypeScript futuro será `imageUrl: string | null`; un marcador visual de foto pendiente
corresponde a la interfaz y no a una imagen ficticia guardada en la base.

Las operaciones futuras usarán el mismo cliente de `pg` dentro de una transacción
`READ ONLY` con timeout local, liberándolo en `finally` y haciendo rollback al fallar.
No se dependerá de `SET search_path` de sesión con PgBouncer. Un error interno
producirá un mensaje público genérico, sin URLs PostgreSQL ni mensajes del driver.
No habrá propiedad `stock` ni disponibilidad comercial hasta integrar inventario
validado en su actividad. El frontend deberá mostrar disponibilidad pendiente,
sin activar carrito, login, pagos o compras.

## Planeación conservada

| Planeación existente | Continuación técnica |
| --- | --- |
| PB-01 / #19 / Sprint 1 | Testing hasta confirmar `/health` desde el iPhone; esta preparación no lo completa |
| PB-02 / #21 / Sprint 2 | Diseño de Home, catálogo, ficha y estados vacío/error/carga |
| PB-06 / #44–#49 / Sprint 6 | API de consulta, categorías, tarjetas, datos aprobados, inventario pendiente y carga |
| PB-06 / #109–#110 | Pruebas unitarias del catálogo e integración API/PostgreSQL |
| PB-07 / #52–#53 / Sprint 7 | Ficha, descripción y precio; inventario aún bloqueado hasta validarlo |
| PB-07 / #50–#51, #55, #111 | Búsqueda y pruebas posteriores autorizadas |

PR #121 conserva su head `ce38707`, permanece abierto y no fusionado. #102 permanece
Done/completed; PB-01 In Progress. Los demás PB y actividades conservan sus estados,
Sprints, prioridades, áreas, responsables y automatizaciones. Esta preparación se
versiona en una rama independiente, dependiente de la base de PR #121.

La arquitectura administrativa decidida utiliza el mismo Express y Neon para Expo
y el futuro panel Next.js. La matriz de cuatro roles, creación segura del primer
DUENO, tablas futuras y vacíos de planeación están en [admin-architecture.md](admin-architecture.md).
No se crean esos módulos ni nuevas migraciones de autenticación en esta intervención.

## Comprobaciones locales y límites

Desde `backend/`: `npm run catalog:validate`, `npm test`, `npm run check`.
El intento de generar sin productos aprobados debe fallar, sin producir importación.
La generación en pruebas utiliza copias ficticias en memoria, nunca cambia aprobaciones reales.

El parser opcional necesita Python y `pglast==8.5`, fijado en
`backend/tools/requirements-sql-check.txt`; se puede instalar en un entorno de
herramientas separado y ejecutar `python tools/check_sql.py` desde `backend/`.
La aplicación Express no depende de Python ni de pglast.

Desde `frontend/`: `npm run lint -- --no-cache`, `npx --no-install tsc --noEmit`,
`npm test`. No se modifican pantallas, rutas Expo, dependencias ni el cliente HTTP.

Estas pruebas comprueban sintaxis SQL/PLpgSQL, estructura de consultas de lectura,
validación de datos, generación y TLS; no comprueban ejecución PostgreSQL, certificados
del endpoint real, permisos del rol, integridad en Neon ni conectividad desde iPhone.
La estructura inicial, sus dos FK, cero filas y nulabilidad de imagen ya cuentan con
validación real confirmada por el responsable mediante ChatGPT. Certificados,
permisos del runtime, consultas de catálogo, productos importados y conectividad
desde el backend/iPhone requieren sus propias comprobaciones posteriores.
