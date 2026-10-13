# Catálogo de demostración — decisiones y revisión de marcas

**Estado:** propuesta de demostración aprobada en conversación; **no implica aprobación comercial ni importación**.
**Fuente:** `backend/db/catalog-review.json` (10 candidatos, 3 categorías, 6 marcas del respaldo antiguo).
**Destino futuro:** catálogo móvil La Pape, API Express y Neon `lapape_mobile_dev`.

## Acuerdos

- Utilizar los importes del respaldo **solo como precios provisionales de demostración**, etiquetados claramente como «Precio de demostración». No presentarlos como precios comerciales reales.
- Sin compras, pagos, reservas ni indicadores de existencias hasta confirmar información real e inventario.
- Todos los `catalog.imageUrl` siguen en `null`. En Expo, representar fotos faltantes con un **componente visual genérico** (ícono/ilustración neutral local), sin asignar URLs inventadas, reutilizar fotos de otras marcas o inventar marcas.
- No insertar, aprobar, publicar ni modificar los candidatos en Neon hasta completar revisión y autorización explícita. La migración 001 ya fue aplicada y no debe reejecutarse.
- Los 200 registros sintéticos del respaldo no se importarán.
- Las seis marcas enumeradas en el manifiesto son datos **no verificados** del respaldo; no deducir que cada artículo corresponde realmente a la marca.
- El esquema del catálogo actualmente requiere marca y precio, y no incluye un indicador de precio `demo`. Antes de exponer precios en una API pública debe existir un mecanismo claro para evitar confusión con ventas reales (por ejemplo, modo de demostración separado y compras inactivas). Esta decisión no se resuelve marcando `is_published=true` indiscriminadamente.

## Candidatos del respaldo pendientes de revisión

| SKU | Producto | Categoría | Marca indicada (sin verificar) | Precio demo (MXN) | Foto |
| --- | --- | --- | --- | ---: | --- |
| LAP-CUA-001 | Cuaderno profesional cuadriculado | Cuadernos | Scribe | 89.90 | Pendiente; imagen anterior corresponde a Norma |
| LAP-MAR-005 | Marcadores permanentes 5 piezas | Arte | Maped | 75.00 | Pendiente; imagen anterior corresponde a STABILO |
| LAP-HOJ-020 | Paquete hojas blancas carta 500 | Oficina | Norma | 129.00 | Pendiente |
| LAP-PEG-015 | Pegamento escolar 125 g | Arte | Barrilito | 24.90 | Pendiente |
| LAP-PLU-010 | Plumas gel azules 10 piezas | Oficina | BIC | 68.50 | Pendiente |
| LAP-COL-011 | Colores de madera 24 piezas | Arte | Pelikan | 94.00 | Pendiente |
| LAP-CAR-030 | Cartulina iris surtida | Arte | Maped | 18.50 | Pendiente |
| LAP-ENG-040 | Engrapadora metálica mediana | Oficina | BIC | 119.00 | Pendiente |
| LAP-FOM-050 | Foami carta colores surtidos | Arte | Barrilito | 42.50 | Pendiente |
| LAP-TIN-060 | Tinta para sellos azul 30 ml | Oficina | Pelikan | 54.00 | Pendiente |

## Revisión de marcas requerida

**Incompatibilidad comprobada con la foto anterior:**
- `LAP-CUA-001`: registro Scribe, foto Norma. No utilizar esa foto para anunciar un producto Scribe.
- `LAP-MAR-005`: registro Maped, foto STABILO. No utilizar esa foto para anunciar un producto Maped.

**Los otros ocho candidatos:** no existe en la revisión actual evidencia suficiente que confirme marca y artículo; las parejas registradas son referencias históricas, no una validación de producto específico. Revisar especialmente cartulina/Maped y engrapadora/BIC, sin asumir por plausibilidad.

**Decisión aprobada:** durante el prototipo, las marcas **no se mostrarán** en las tarjetas del catálogo móvil ni se presentarán como verificadas en el detalle. Se mantienen como referencias históricas en el manifiesto para validación posterior. La tarjeta mostrará nombre, categoría, precio con etiqueta «Precio de demostración» e imagen genérica local cuando `image_url` sea NULL. El backend puede conservar sus campos de marca como datos de catálogo, pero la interfaz no debe exhibirlos hasta su validación. No se modifican ni aprueban registros en Neon.

## Próximos pasos (sin ejecución automática)

1. Aplicar la política visual acordada: no mostrar marcas pendientes de verificación en las tarjetas ni en el detalle del prototipo.
2. Crear el placeholder visual neutral para Expo sin falsear `image_url`.
3. Revisar los datos producto a producto; documentar qué es demo y qué está verificado.
4. Antes de cualquier importación, ejecutar validación del manifiesto, revisión de SQL generado y aprobación humana de los registros que se vayan a publicar.
5. Conectar el cliente Expo al backend únicamente cuando API y entorno de demostración estén validados.

**No cambia** el estado de GitHub Projects, los PR #121/#122, ni ninguna tabla o fila en Neon.

## Carga técnica preparada (NO ejecutada)

Se preparó `backend/db/migrations/002_demo_previews.sql` con los **mismos diez UUID,
SKU, nombres, categorías y precios del manifiesto derivado de `10 (1).zip`**.
Se excluyeron los 200 productos sintéticos y los dos registros descartados. Las marcas
históricas permanecen en `catalog-review.json`, pero **no forman parte de la
representación visual ni de los datos de ejemplo**.

La propuesta crea un esquema independiente `demo` con una tabla
`demo.product_previews`. Tiene límites explícitos `is_demo=true`, `is_for_sale=false`,
`image_url IS NULL` y permisos de solo lectura para el rol técnico. No inserta
nada en `catalog.products`, no altera el SQL de migración 001 y no habilita compras.

**Estado:** archivo únicamente preparado en GitHub. NO ha sido ejecutado en Neon.
La base existente mantiene cero filas de catálogo. Antes de ejecutar se necesita
revisión técnica del SQL y **nueva autorización explícita del responsable**.

Para mostrar estas diez fichas **desde Neon y no desde fixtures locales** falta crear
un endpoint específico de demo, habilitado exclusivamente en desarrollo y desactivado
por defecto. La API pública normal seguirá leyendo productos comerciales revisados
solo desde `catalog.products`; no deberá consultar automáticamente `demo`.
Expo mostrará de forma visible «Datos de demostración» y continuará sin funciones
de venta. Se requieren pruebas de seguridad, API y dispositivo antes de considerar
la integración terminada.
