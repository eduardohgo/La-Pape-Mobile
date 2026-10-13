# Ajustes de escaparate visual de La Pape Mobile — revisión interna

**Base:** rama `codex/pb06-pb07-catalog-detail-design` (diseños Inicio, Catálogo y Detalle).  
**Rama de revisión:** `chatgpt/clean-storefront-ui`.

## Objetivo

Eliminar mensajes internos sobre la API, modo demo, revisión de precios, ausencia
de fotografías y módulos futuros de las pantallas normales de usuario. La vista
debe parecer una papelería y no una herramienta de diagnóstico.

## Interfaz

- **Inicio:** elimina la comprobación manual de API, el subtítulo de demo,
  las etiquetas de precio provisional y los mensajes técnicos de ilustración.
  Destacados continúan llegando del mismo servicio HTTP; las imágenes de
  papelería originales siguen siendo ilustraciones, no fotografías comerciales.
- **Catálogo:** elimina aviso de demo/sin ventas, etiquetas de precios
  provisionales y textos de fallo técnicos. El botón «Ver detalle» reemplaza
  «Agregar · próximamente», con navegación real por UUID. Conserva búsqueda,
  filtros, carga, vacío y reintento.
- **Detalle:** muestra categoría, nombre, SKU, precio y moneda. La descripción
  se presenta **solo si está presente en la respuesta y es válida**; no
  inventa textos. Omite las secciones futuras de variantes, cantidad y compra.
  Conserva regreso, estados de error y la consulta individual.

Se unifica la etiqueta de navegación **Acceder**. Los accesos a carrito y
favoritos permanecen como iconos visuales con aviso general al pulsarlos, sin
estado persistente. No se implementan compras ni se finge que están disponibles.

## Seguridad y restricciones — NO cambiar

- El indicador de demostración **sigue activándose únicamente en desarrollo**
  mediante `__DEV__` y `EXPO_PUBLIC_CATALOG_MODE=demo`. No se expone al usuario.
- Los datos del ZIP siguen separados en `demo.product_previews` y requieren
  los controles `is_demo=true`, `is_for_sale=false` y `image_url=null` en
  su contrato; la API sigue siendo de solo lectura.
- El frontend sigue sin carrito, pagos, reservas ni checkout.
- Los precios de las diez fichas son provisionales aunque ya no tengan
  etiqueta visible. **Esta presentación está autorizada solo para revisión
  interna con Expo Go y NO para publicación a clientes.** Antes de distribuir
  la app o hacer demostraciones como catálogo comercial, el responsable debe
  verificar y aprobar producto, marca, precio, descripción, foto e inventario,
  y publicar los registros reales a través del flujo de revisión.
- No se alteraron Neon, migraciones, Express, servicios HTTP ni sus permisos.

## Validación pendiente

Desde `frontend/` ejecutar:

```bash
npm test
npm run lint
npx tsc --noEmit
```

Después comprobar en Expo Go Inicio, Catálogo, búsqueda/filtros,
«Ver detalle», regreso y la ausencia de mensajes técnicos. Comprobar que no
puede iniciarse compra alguna. No hacer merge sin revisión en dispositivo.
