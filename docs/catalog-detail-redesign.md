# Rediseño de Catálogo y Detalle — PB-06 / PB-07

> Informe histórico de esta etapa. Las rutas locales de archivos se actualizaron durante la organización posterior; la evidencia, los commits y los estados aquí descritos conservan su significado histórico. La estructura vigente y la extracción de pantallas están en [guia-estructura-proyecto.md](guia-estructura-proyecto.md).

Fecha de revisión: 13 de octubre de 2026. Rama de trabajo
`codex/pb06-pb07-catalog-detail-design`, basada en el commit `3b055a4`
del rediseño aprobado de Inicio. Las Figuras 6 y 7 proporcionadas por el
responsable se utilizan únicamente como referencias visuales.

## Alcance implementado

Catálogo y Detalle siguen la identidad de Inicio: encabezados amarillos,
formas decorativas, acentos rosa y azul, tarjetas pastel, bordes redondeados
y tipografía clara. Inicio no se rediseña de nuevo.

Catálogo incorpora búsqueda blanca, botón de filtros, título, chips de las
categorías recibidas y tarjetas con nombre, categoría, precio y moneda reales
de la respuesta validada de API. En modo demo las categorías se derivan de
los artículos recibidos; no se escribe una lista alternativa de productos,
precios o marcas en las pantallas. La cuadrícula se adapta al ancho y al tamaño
de texto. La barra inferior propia mantiene el acceso a Inicio y muestra
avisos para las funciones futuras.

Detalle conserva la consulta individual por UUID y muestra categoría, nombre,
SKU, precio, moneda y estado de demostración cuando corresponda. La descripción
proviene de la respuesta comercial existente; cuando no existe una descripción
disponible, se indica que está pendiente de revisión. No se inventan características,
variantes, existencias, reseñas, calificaciones ni datos comerciales.

Las fotografías disponibles se presentan mediante `expo-image`. Si una imagen
falta o falla, se reutilizan las ilustraciones genéricas ya presentes en Inicio,
con la etiqueta «Ilustración · foto pendiente». No se incorporan fotografías
comerciales ficticias ni nuevos assets de productos.

Favoritos, Carrito y Perfil muestran únicamente un aviso de función pendiente.
Los botones Agregar, Agregar al carrito y Comprar ahora están deshabilitados y
rotulados como próximos. La cantidad no se puede modificar y las variantes se
identifican como futuras, sin opciones inventadas. No hay persistencia de favoritos,
carrito, reservas, pedidos, pagos o autenticación.

## Búsqueda y categorías

La búsqueda filtra exclusivamente los productos ya cargados mediante el servicio
existente. Busca por nombre, categoría y SKU, normalizando mayúsculas, acentos y
espacios. Cada palabra debe aparecer en alguno de esos tres campos; las palabras
pueden coincidir en campos distintos. La selección de categoría se combina mediante
AND con la búsqueda, sin ampliar artificialmente los resultados.

Se preservan el orden y los objetos de la API. La puntuación del usuario se trata
como texto literal, sin convertirla en expresiones regulares. No se crean endpoints
de búsqueda. «Limpiar filtros» restablece texto y categoría; una combinación sin
coincidencias muestra un estado específico y permite volver a todos los artículos.

## Funcionalidad conservada

Se reutilizan sin modificaciones el servicio de catálogo, el cliente HTTP, los
validadores de respuestas, los timeouts, la configuración por entorno y los
endpoints existentes. El modo demo continúa condicionado a `__DEV__` y
`EXPO_PUBLIC_CATALOG_MODE=demo`; las pantallas no sustituyen una API fallida por
productos locales. Las solicitudes se cancelan al desmontar o cambiar el intento.

Se conservan carga, error, respuesta vacía y reintento del catálogo; en Detalle se
conservan UUID, carga, error, producto no encontrado y reintento. Un error de
configuración de conexión se diferencia de un identificador inválido o un HTTP 404.

La navegación continúa con Expo Router: Inicio → Catálogo → Detalle por UUID.
El regreso explícito llega a Catálogo incluso si el detalle se abrió desde un
destacado de Inicio o desde un enlace directo. Detalle permanece en el Stack
existente, fuera de las pestañas.

La barra original del contenedor de pestañas se oculta en Inicio y Catálogo;
los Trigger y sus rutas se conservan. Las pantallas gestionan sus propias áreas
seguras. La validación de áreas seguras nativas en el iPhone continúa pendiente.

No se modifican Inicio, sus ilustraciones, los servicios de API, archivos de
entorno, `backend/`, Neon, migraciones, datos, dependencias ni el lock. No se crean
otro backend o app, y no se realizan merges o despliegues.

## Archivos frontend de esta tarea

| Archivo | Cambio |
|---|---|
| `frontend/src/app/(tabs)/explore.tsx` | Rediseño de Catálogo, búsqueda local, filtros y tarjetas |
| `frontend/src/app/products/[id].tsx` | Rediseño de Detalle, regreso explícito y estados conservados |
| `frontend/src/components/catalogo/componentes-catalogo.tsx` | Encabezado, presentación de producto, estados, avisos y barra de Catálogo |
| `frontend/src/utils/busqueda-catalogo.ts` | Búsqueda local combinada con categoría, sin modificar datos |
| `frontend/src/components/navegacion/pestanas-app.tsx` | Visibilidad de la barra nativa e insets de Catálogo |
| `frontend/src/components/navegacion/pestanas-app.web.tsx` | Ocultar la barra anterior también en Catálogo |
| `frontend/src/components/compartidos/iconos-papeleria.tsx` | Añadir iconos de regreso y filtros; iconos existentes conservados |
| `frontend/test/catalog-search.test.cjs` | Nueve pruebas de búsqueda y combinación de filtros |
| `frontend/tsconfig.test.json` | Incluir la utilidad de búsqueda en la compilación de pruebas |
| `frontend/package.json` | Ejecutar las nuevas pruebas junto con las existentes; sin dependencias nuevas |

Este documento registra el alcance y la evidencia. El commit de esta tarea
incluye estos diez archivos y este documento; no incorpora archivos de entorno
ni el harness temporal de validación.

## Verificaciones realizadas

| Comprobación | Resultado |
|---|---|
| `npm test` desde `frontend/` | 26/26 correctas: 17 existentes de HTTP/contratos y 9 de búsqueda |
| `npm run lint` desde `frontend/` | Correcto; se conserva `--max-warnings=0` |
| `npx tsc --noEmit` desde `frontend/` | Correcto |
| Exportación Expo para todas las plataformas | Correcta: iOS, Android y Web |
| Navegación web local a 390 px | Inicio → Catálogo → Detalle por UUID → Catálogo, correcta |
| Navegación desde destacado de Inicio | Inicio → Detalle → Catálogo, correcta |
| Búsqueda local | Consultas `cuaderno`, `oficina`, `LAP-CUA-001` y `metalica`, correctas |
| Categorías y combinación con búsqueda | Filtros, resultado sin coincidencias y restablecimiento, correctos |
| Estados del catálogo | Carga demorada, error HTTP, respuesta vacía y recuperación al reintentar, correctos |
| Estados del detalle | Carga demorada, error HTTP, HTTP 404 con reintento y recuperación tras error, correctos |
| Anchos 320, 390 y 768 px | Cuadrícula de 2/2/3 columnas, chips ajustados, CTAs apilados a 320 px; sin desbordamiento horizontal |
| Controles futuros | Aviso de favoritos sin persistencia; botones de compras y cantidad deshabilitados |
| Diferencias protegidas | Inicio, backend, servicios HTTP, lock y assets idénticos a la base `3b055a4` |

La validación web local utiliza el Express existente con un repositorio en memoria
basado en el manifiesto de demostración, inyectado mediante la interfaz de pruebas.
No conecta a PostgreSQL ni consulta Neon. Los datos del harness no se incorporan
a las pantallas o a los servicios de la aplicación. Estas comprobaciones no se
presentan como una nueva validación de la conexión real Expo Go → Express → Neon
ni como pruebas realizadas en el iPhone.

## GitHub Projects

Esta implementación corresponde a #46 (tarjetas), #47 (datos de las tarjetas),
#50/#51 (búsqueda) y #52 (detalle), dentro de PB-06 y PB-07, y se relaciona con la
definición de pantallas #21 de PB-02. Ninguna Issue se cierra ni pasa a Done.

| Actividad | Estado anterior | Estado al entregar |
|---|---|---|
| #46, #47 | Todo | Testing, después de In Progress; Sprint 6 original |
| #50, #51, #52 | Todo | Testing, después de In Progress; Sprint 7 original |
| PB-06 #7, PB-07 #8 | Product Backlog | In Progress; ambos PB siguen abiertos |
| PB-02 #3, #21 | In Progress | In Progress, sin cambio; alcance de interfaz más amplio |
| #19 | Testing | Testing, sin cambio |

Los estados se verifican en tabla y Kanban. Se conservan los Sprints,
responsables, prioridades, áreas y automatizaciones. Las otras actividades de
catálogo, navegación, inventario y aceptación conservan su estado; la revisión
local de esta tarea no completa todas las pruebas de esos PB.

## Validación pendiente en iPhone con Expo Go

1. Comprobar encabezados, notch, barra de estado y área inferior, sin barras duplicadas.
2. Revisar legibilidad, tamaño de texto aumentado, cuadrícula, scroll y teclado de búsqueda.
3. Confirmar los diez artículos recibidos desde el Express real conectado a Neon,
   con sus UUID, precios y categorías originales; sin productos de sustitución.
4. Recorrer Inicio → Catálogo → Detalle → Volver al catálogo y
   Inicio → destacado → Detalle → Volver al catálogo.
5. Buscar por nombre, categoría y SKU; combinar categoría y búsqueda, limpiar
   filtros y comprobar el mensaje sin coincidencias.
6. Comprobar carga, desconexión, reintento, catálogo vacío y producto no encontrado
   en condiciones de prueba controladas, sin modificar datos de Neon.
7. Confirmar que fotografías pendientes muestran ilustraciones identificadas,
   que los avisos no guardan favoritos y que cantidad/compras permanecen deshabilitadas.

Para esta validación se utiliza la configuración local habitual de la API y
`npx expo start` desde `frontend/`. El iPhone debe alcanzar la dirección LAN
configurada; la URL temporal del harness web no reemplaza la configuración real.
