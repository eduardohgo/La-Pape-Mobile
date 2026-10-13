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

**Decisión pendiente:** confirmar con el responsable si las marcas se mostrarán explícitamente como «por verificar» durante el prototipo, o si se ocultarán hasta validar productos reales. Mantener los valores fuente en el manifiesto sin aprobarlos por inferencia.

## Próximos pasos (sin ejecución automática)

1. Resolver política visual sobre marcas no verificadas.
2. Crear el placeholder visual neutral para Expo sin falsear `image_url`.
3. Revisar los datos producto a producto; documentar qué es demo y qué está verificado.
4. Antes de cualquier importación, ejecutar validación del manifiesto, revisión de SQL generado y aprobación humana de los registros que se vayan a publicar.
5. Conectar el cliente Expo al backend únicamente cuando API y entorno de demostración estén validados.

**No cambia** el estado de GitHub Projects, los PR #121/#122, ni ninguna tabla o fila en Neon.
