# Preparación del catálogo para Neon PostgreSQL 18

Estos archivos son una propuesta revisable. No se ejecutó SQL, no se abrió una conexión a Neon y no se activaron endpoints de catálogo. El servidor conserva únicamente `GET /health`.

## Destino confirmado por el responsable

| Campo | Valor |
|---|---|
| Proyecto | La Pape Mobile |
| Project ID | `twilight-moon-02635569` |
| Rama | `development` |
| Base | `lapape_mobile_dev` |
| PostgreSQL | 18 |
| Estado informado | 0 tablas |

No se necesita crear otro proyecto. Los identificadores anteriores no son credenciales. Las cadenas de conexión se obtendrán para este destino mediante el proceso autorizado y permanecerán fuera de Git y de Expo.

## Archivos y orden de revisión

1. `migrations/001_catalog_schema.sql`: crea el esquema `catalog` con tres tablas vacías y sus restricciones. Usa una transacción y exige PostgreSQL 18, el nombre de base correcto y ausencia de tablas, vistas y secuencias de usuario. Si ya existe `catalog`, se detiene; no contiene `DROP`, sincronización automática ni `IF NOT EXISTS` que oculte diferencias.
2. `catalog-review.json`: diez candidatos pendientes, las tres categorías y seis marcas que relacionan esos candidatos. Es un manifiesto de revisión, no un seed ni datos aprobados.
3. `../scripts/catalog-validate.js`: valida el manifiesto sin red ni base de datos.
4. `../scripts/catalog-generate.js`: genera una futura importación SQL exclusivamente a partir de aprobaciones explícitas. Con el manifiesto actual se detiene porque hay cero productos aprobados y no crea archivos.
5. `queries/` y `validation/`: consultas de lectura y comprobaciones previstas para una revisión/aplicación posterior. No se ejecutan al iniciar Express.

La primera importación será un archivo independiente, generado después de aprobar el catálogo. Se revisará su diff y se solicitará autorización antes de aplicarlo. No se ofrece un comando de restauración automática.

## Proyección revisada del respaldo

Fuente: `10 (1).zip`, entrada `10/02_Base_Datos/Respaldo_BD_LaPape_Sin_Datos_Sensibles.sql`.

SHA-256 del SQL: `b03c2111ad3245c9cfee7f823cd770c6ce14d7e76883fc2e518d345674eb908f`.

El respaldo contiene 26 tablas; esta preparación conserva solo la proyección necesaria para el catálogo:

| Tabla nueva | Relaciones conservadas | Cambios deliberados frente al original |
|---|---|---|
| `catalog.categories` | UUID originales referenciados por productos | Solo Cuadernos, Arte y Oficina en el manifiesto; activación mediante importación aprobada |
| `catalog.brands` | UUID originales referenciados por productos | Solo las seis marcas candidatas; sus asignaciones todavía necesitan revisión |
| `catalog.products` | UUID y SKU originales; FK obligatorias a categoría y marca, con `ON DELETE/UPDATE RESTRICT` | Omite stock, sucursal, proveedor, descuentos mayoristas y campos duplicados de texto; exige precio positivo, moneda MXN, imagen HTTPS y revisión para publicar |

Las FK de sucursales y proveedores se excluyen junto con sus columnas. No se insertan registros ficticios para satisfacerlas. Esta proyección no es un reemplazo íntegro del esquema Prisma antiguo; el backend actual utiliza `pg`, por lo que sus futuras consultas nombrarán `catalog` explícitamente. Los demás módulos se diseñarán bajo las Issues correspondientes.

Las nuevas fechas son `timestamptz`. No se inventa una zona horaria para los `timestamp` antiguos; las fechas de creación/actualización del catálogo se registrarán al importarlo y `reviewed_at` provendrá de la aprobación UTC explícita. No se requiere extensión, secuencia ni generador de UUID: se preservan los UUID de origen.

Se excluyen los 200 productos identificados como sintéticos y los dos registros ajenos al catálogo candidato (`tijeras jeje` e `iphone 15`). También se excluyen íntegramente inventarios y movimientos, incluso el stock asociado a los diez candidatos: ese inventario está identificado como sintético. No se importan usuarios, sesiones, direcciones, ventas, compras ni otros datos personales o comerciales.

## Aprobación pendiente

Los diez productos tienen `review.approved=false`. No se aprobaron sus precios, marcas, imágenes, categorías ni contenido. Sus valores de origen permiten revisar cambios sin perder trazabilidad; `catalog` contiene la propuesta editable y `source` conserva la referencia al respaldo.

Para aprobar un producto deben confirmarse `price`, `brand`, `image`, `category` y `content`, además de registrar el identificador del revisor y una fecha UTC explícita. La imagen propuesta debe ser HTTPS y no incluir credenciales, parámetros de consulta ni fragmentos; así se evita incorporar URLs firmadas o tokens al catálogo. El generador conserva exclusivamente las categorías y marcas necesarias para los productos aprobados. Si una marca se corrige, se elige una marca revisada existente en el manifiesto; ampliar el conjunto de referencias requiere un cambio revisado en el validador.

Las fotografías locales presentan dos discrepancias: cuaderno con foto Norma/registro Scribe y marcadores con foto STABILO/registro Maped. Las ocho URLs externas tampoco demuestran disponibilidad ni correspondencia visual. Ninguna se publica por existir en el respaldo.

El manifiesto y el validador permiten únicamente los diez UUID/SKU auditados. Rechazan referencias huérfanas, precios fuera de `numeric(10,2)`, aprobación incompleta, marcadores sintéticos y campos no previstos, incluyendo campos de inventario o personales. El generador escapa literales SQL, ordena la salida y rechaza la sustitución silenciosa de archivos revisados.

## Comprobaciones locales permitidas

Desde `backend/`:

```powershell
node scripts/catalog-validate.js
node --test test/catalog-review.test.js
```

Estas comprobaciones son exclusivamente locales. Las pruebas crean aprobaciones simuladas en memoria con dominios `.invalid`; no alteran el manifiesto ni generan una importación aprobada real.

Después de la validación humana y de revisar el manifiesto, el generador podrá preparar un archivo, sin ejecutarlo:

```powershell
node scripts/catalog-generate.js --output db/migrations/002_approved_catalog.sql
```

Actualmente ese comando debe fallar con `No approved products` y no crear el archivo. Una futura importación exige tablas de catálogo vacías, conserva las FK y ejecuta todo dentro de una transacción. No utiliza `ON CONFLICT`, truncados ni actualizaciones que oculten datos preexistentes. Nuevos productos posteriores requerirán otra migración revisada.

## Antes de cualquier ejecución futura

- Revisar con ChatGPT el SQL y las aprobaciones, y obtener autorización explícita.
- Confirmar que la conexión directa corresponde al proyecto y a la rama indicados; `current_database()` verifica la base, pero SQL no acredita por sí solo el Project ID de Neon.
- Usar conexión directa para migraciones y un rol de aplicación separado con permisos de lectura. La URL agrupada se reserva para el backend; nunca se entrega a Expo.
- Verificar la base vacía, el comportamiento transaccional y las restricciones en el destino aprobado. La sintaxis y las pruebas offline no sustituyen esta validación en PostgreSQL.
- Mantener #19 en Testing y PR #121 abierto; esta preparación no valida el iPhone ni completa PB-02, PB-06 o PB-07.
