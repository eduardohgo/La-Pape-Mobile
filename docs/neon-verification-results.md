# Resultados de preparación de Neon — 2026-10-12

Destino informado por el responsable: `twilight-moon-02635569` / `development` /
`lapape_mobile_dev`, PostgreSQL 18, cero tablas iniciales. No se realizó una consulta
ni una ejecución SQL por Codex en ese proyecto durante las verificaciones locales
de preparación descritas abajo. El estado inicial de cero tablas es histórico.

## Validación real de 001 confirmada por el responsable

Confirmación recibida el 2026-10-12: ChatGPT aplicó exitosamente
`001_catalog_schema.sql` y realizó verificaciones reales en Neon. Codex registra
el resultado comunicado; no afirma haber repetido la ejecución o una consulta independiente.

| Comprobación real confirmada | Resultado |
| --- | --- |
| PostgreSQL / rama / base | 18 / development / lapape_mobile_dev |
| Tablas creadas | catalog.categories, catalog.brands, catalog.products |
| Claves foráneas validadas | 2 |
| Filas | 0 categorías, 0 marcas, 0 productos |
| image_url | Permite NULL |
| Tablas adicionales inesperadas | Ninguna |

001 queda aplicada y su archivo se conserva sin modificar ni volver a ejecutar.
Los diez candidatos siguen sin aprobar y sin importar. Esta validación del esquema
no equivale a validar los endpoints del catálogo ni la conexión desde el iPhone.

## Verificaciones locales históricas de preparación

| Comprobación local | Resultado | Alcance |
| --- | --- | --- |
| `backend: npm test` | 37/37 correctas | 20 de catálogo, 10 de configuración/TLS, 7 HTTP locales |
| `backend: npm run check` | Correcto | Sintaxis del punto de entrada |
| `backend: npm run catalog:validate` | Correcto | 10 pendientes, 0 aprobados, 10 fotografías pendientes, 3 categorías, 6 marcas |
| Generar importación sin aprobados | Bloqueo esperado, exit 1 | No se creó archivo de importación |
| `python backend/tools/check_sql.py` | 7/7 archivos correctos | Gramática SQL y PL/pgSQL PostgreSQL 18.6, pglast 8.5 |
| Dos generaciones ficticias en memoria + parser | Correcto | Con fotos HTTPS y con fotos NULL; 19 INSERT por caso, cero DROP; no escribe archivos |
| `frontend: npm run lint -- --no-cache` | Correcto | ESLint, cero avisos admitidos |
| `frontend: npx --no-install tsc --noEmit` | Correcto | TypeScript estricto |
| `frontend: npm test` | 8/8 correctas | Cliente HTTP con respuestas, errores, timeout y cancelación simulados |
| `git diff --check` | Correcto | Sin errores de whitespace |
| Diff de `frontend/` y del lock del backend | Vacío | Pantallas, navegación y dependencias conservadas |
| Exclusiones Git | Correctas | SQL revisado permitido; respaldos, `.env` y salida generada excluidos |

El parser verificó tres SELECT parametrizados, tres scripts de validación de lectura
y la migración inicial. También verificó los cuerpos PL/pgSQL de sus guardias.
Comprobó que 001 crea solo tres tablas, no contiene importación/borrado y permite
NULL en `image_url`. En el fixture sin fotos, cada valor generado es un NULL SQL real,
no la cadena `'NULL'`. Las consultas preservan NULL sin filtrar esos productos.
Una descripción ficticia con `'); DROP TABLE ...` permaneció como literal SQL dentro
de un INSERT; no produjo una sentencia DROP en el árbol de sintaxis.
El informe por archivo y sus SHA-256 está en `neon-sql-check.json`.

Las pruebas de catálogo comprueban lista cerrada de UUID/SKU, integridad de referencias,
precios decimales sin redondeo, rechazo de campos personales/inventario/sintéticos,
aprobaciones independientes, imágenes públicas HTTPS sin credenciales/parámetros,
salida reproducible y escape de literales. Las aprobaciones ficticias de las pruebas
se crean solo en memoria. El manifiesto real sigue con diez `approved=false`.
El formato v2 añade aceptación explícita de ausencia de fotografía, actualmente false
para todos. NULL por sí solo no aprueba ni publica. La tabla admite SKU ASCII reales
fuera del formato LAP, con UNIQUE y comparación C, mientras el importador conserva
la lista cerrada de diez UUID/SKU del respaldo. Los marcadores sintéticos se bloquean
sin confundir materiales reales como papel sintético con registros de prueba.

Las pruebas TLS construyen configuración/clientes sin `connect`. Comprueban el objeto
TLS efectivo de pg, rechazo de modos débiles y parámetros que podrían reemplazarlo,
redacción de errores y separación de la URL administrativa. No validan un certificado
real de Neon ni una autenticación real con channel binding.

La aplicación Express conserva únicamente `/health`, que no accede a PostgreSQL.
Las pruebas HTTP locales escucharon en puertos temporales de loopback y cerraron sus
listeners. Codex no ejecutó restauraciones, migraciones, seeds, `db push`, `sync`,
operaciones comerciales ni despliegues.

La revisión SQL local **no valida ejecución, resolución de tipos, permisos ni FK en un
servidor real**. La ejecución y las dos FK del esquema inicial fueron confirmadas
separadamente por el responsable mediante ChatGPT. Permisos del runtime, consultas,
importación de datos y conectividad del backend aún requieren validación posterior.
La validación del iPhone también permanece pendiente.

GitHub leído sin cambios de estado: #19 Testing; #102 Done/completed; PB-01 In Progress;
PB-02, PB-06 y PB-07 Product Backlog. PR #121 abierto, no fusionado, mergeable, head
`ce3870705d101eb4f477ad015f6472276f213d40`. Se conservaron los campos de planeación.

La revisión de roles del ZIP original y la arquitectura administrativa futura se
documentan en `admin-architecture.md`: son propuestas y evidencias de lectura de
código, no pruebas de autenticación, permisos o inventario implementados. Las
dependencias se relacionan con las Issues existentes y se identifican explícitamente
los módulos administrativos sin una Issue de alcance suficiente. No se crean nuevas
Issues, tablas de identidad ni endpoints en esta intervención.
