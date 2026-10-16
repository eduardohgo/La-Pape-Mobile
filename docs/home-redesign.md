# Rediseño de Inicio — PB-02 / #21

> Informe histórico de esta etapa. Las rutas locales de archivos se actualizaron durante la organización posterior; la evidencia, los commits y los estados aquí descritos conservan su significado histórico. La estructura vigente y la extracción de pantallas están en [guia-estructura-proyecto.md](guia-estructura-proyecto.md).

Fecha de revisión: 13 de octubre de 2026. Rama `codex/pb02-home-redesign`,
creada desde la base funcional `f3d79b4` de `chatgpt/pb07-product-detail`.
La referencia es la imagen de Inicio proporcionada por el responsable.

## Alcance implementado

Solo se rediseña `frontend/src/app/(tabs)/index.tsx`: identidad textual La Pape,
encabezado amarillo con formas rosa y azul, búsqueda visual, banner escolar,
categorías con tarjetas pastel, destacados desplazables y barra inferior propia.
Los siete SVG de papelería son ilustraciones originales, sin marcas ni fotos
del respaldo. La identidad es una adaptación visual, no un nuevo archivo de
logotipo oficial.

Los destacados son los primeros cuatro artículos devueltos por el servicio
HTTP existente, no una lista de productos o precios copiada a Inicio. Se respeta
exactamente el modo de Catálogo: `/demo/products` solo con `__DEV__` y
`EXPO_PUBLIC_CATALOG_MODE=demo`; `/products` en modo comercial. No se crean
rutas HTTP, consultas SQL ni nuevas conexiones a PostgreSQL. Ante error se
muestra Reintentar; una respuesta vacía se presenta como catálogo vacío. Nunca
se sustituye una API fallida por productos locales. Las solicitudes se cancelan
al desmontar o cambiar el intento de carga y conservan los timeouts/validadores
del servicio compartido. Para un catálogo comercial grande, la selección de
destacados necesitará una consulta limitada en una actividad posterior; por
ahora se reutiliza sin modificar el método existente de Catálogo.

Cada destacado abre `/products/<uuid>` a través del Router actual. Una imagen
HTTPS disponible se presenta con `expo-image`; si falta o falla, se muestra
una ilustración genérica con la etiqueta «Ilustración · foto pendiente».
Los precios demo se identifican como provisionales y sin ventas. No se
inventan existencias, marcas verificadas, promociones, descuentos o compras.

Las categorías de Inicio son **atajos visuales estáticos** inspirados en la
referencia (Cuadernos, Marcadores, Lápices, Tijeras, Pegamento, Ver más).
Todos abren el catálogo completo. No representan una nueva taxonomía en Neon
ni aplican filtros que la ruta actual no soporte. El usuario elige allí las
categorías reales que ya devuelve la API.

Búsqueda, Carrito, Favoritos, los corazones y Acceder abren únicamente un aviso
«Muy pronto», con regreso a Inicio o acceso al catálogo. No guardan favoritos,
sesiones o carritos y no realizan operaciones comerciales. No hay cantidades
ficticias en el carrito. El botón de comprobación de `/health` se conserva dentro
de un panel desplegable visible solo en desarrollo.

## Navegación conservada

`pestanas-app.tsx` conserva `NativeTabs` y sus dos Trigger. Solo oculta la barra
del contenedor cuando la ruta activa es `/`; Inicio presenta su propia barra.
No se ocultan ni desmontan Trigger, por lo que las rutas siguen disponibles.
Se desactivan los insets automáticos únicamente para `index`, que administra
las áreas seguras superior e inferior. Catálogo mantiene su barra y propiedades.

`pestanas-app.web.tsx` conserva TabList y TabTrigger montados; su barra anterior se
oculta únicamente en `/`. Se corrige el destino de Inicio a `/`, compatible con
las rutas tipadas. Detalle sigue fuera de las pestañas, en el Stack original.
La barra de estado usa texto oscuro únicamente mientras Inicio está activo.
La nueva presentación de Inicio es clara, siguiendo la referencia, también
cuando el teléfono utiliza modo oscuro; el tema de las otras pantallas no cambia.

Los fondos decorativos están en capas separadas del contenido interactivo.
Esto evita que el enfoque de botones en web desplace el contenido dentro de
contenedores recortados. La barra propia no duplica la barra del navegador.

## Archivos de esta tarea

| Archivo | Cambio |
|---|---|
| `frontend/src/app/(tabs)/index.tsx` | Pantalla de Inicio, estilos, destacados y avisos |
| `frontend/src/components/navegacion/pestanas-app.tsx` | Visibilidad de barra solo en Inicio e insets de index |
| `frontend/src/components/navegacion/pestanas-app.web.tsx` | Visibilidad solo en Inicio y enlace raíz tipado |
| `frontend/src/components/compartidos/iconos-papeleria.tsx` | Iconos SVG originales para Inicio |
| `frontend/src/components/compartidos/ilustraciones-papeleria.tsx` | Assets locales y selección de ilustración genérica |
| `frontend/src/hooks/use-productos-inicio.ts` | Consumo del servicio existente, carga/error/reintento/cancelación |
| `frontend/assets/images/home/hero-stationery.svg` | Ilustración del banner |
| `frontend/assets/images/home/notebook.svg` | Cuaderno ilustrado |
| `frontend/assets/images/home/markers.svg` | Marcadores ilustrados |
| `frontend/assets/images/home/pencils.svg` | Lápices ilustrados |
| `frontend/assets/images/home/scissors.svg` | Tijeras ilustradas |
| `frontend/assets/images/home/glue.svg` | Pegamento ilustrado |
| `frontend/assets/images/home/paper.svg` | Papelería genérica |
| `docs/home-redesign.md` | Alcance, evidencias y revisión pendiente |

No se modifican `explore.tsx`, `products/[id].tsx`, el servicio de catálogo,
el cliente HTTP, `backend/`, migraciones, `package.json`, lock o archivos de entorno.
No se instalan dependencias, no se ejecuta SQL ni se realizan despliegues o merges.

## Verificaciones

| Comprobación | Resultado |
|---|---|
| `npm run lint -- --no-cache` desde frontend | Correcto, sin errores ni warnings de ESLint |
| `npx --no-install tsc --noEmit` desde frontend | Correcto |
| `npm test` desde frontend | 17/17 pruebas del cliente HTTP y contratos de catálogo/detalle correctas |
| `npx --no-install expo export --platform all --output-dir .expo/home-redesign-export --max-workers 2` | Correcto: bundles Hermes iOS/Android y exportación web con 7 rutas |
| Arranque de Metro / Expo Web | Correcto en servidor local de revisión |
| Revisión visual web | Anchos 320, 390 y 768 px; barra inferior fija, contenido desplazable y sin desbordamiento de página a 320 px |
| Inicio → Catálogo → Detalle → Catálogo → Inicio | Correcto en navegador con API simulada |
| Destacado de Inicio → Detalle → regresar a Inicio | Correcto en navegador con API simulada |
| Estado de carga y respuesta vacía | Correctos con el servicio simulado |
| HTTP 503 y Reintentar | Mensaje de error y reintento correctos, sin sustituir el fallo por datos locales |
| Aviso de búsqueda y regresar a Inicio | Correcto; no implementa búsqueda |
| Comparación con `f3d79b4` de archivos protegidos | Catálogo/Detalle/backend/servicios/dependencias sin diferencias |

La revisión web usó temporalmente **el mismo Express**, con un repositorio en
memoria inyectado mediante su interfaz de pruebas existente. El harness está
fuera del repositorio; no se carga `.env` del backend, no se instancia el pool y
no se consulta Neon. La URL de revisión se sobrescribe solo en el proceso de
Metro; los archivos de entorno reales permanecen intactos. Esta prueba no se
presenta como una validación nueva de conectividad Expo Go → Express → Neon.

La primera exportación falló por permisos de escritura de Hermes en el temporal
del aislamiento Windows. Se repitió fuera del aislamiento y pasó, sin desactivar
Hermes ni cambiar dependencias. TypeScript detectó el enlace web previo
`/(tabs)/index` y una utilidad de StyleSheet retirada en RN 0.86; se corrigieron
a `/` y límites explícitos de posicionamiento. No se desactivaron reglas para
obtener resultados exitosos.

## GitHub Projects y revisión pendiente

PB-02 (#3) pasa de Product Backlog a In Progress y #21 de Todo a In Progress,
conservando Sprint 2, responsable, área Interfaz y prioridad Alta. Inicio está
listo para revisión, pero #21 abarca más pantallas y no se declara terminado
todo PB-02. #23/#24/#25/#103 son dependencias de encabezados, adaptación y pruebas;
no se cambian sus estados ni se cierran actividades. No se altera ningún otro PB,
las automatizaciones o los campos de planeación. #19 sigue Testing.

Para revisar en el teléfono, iniciar la app normalmente desde `frontend/` con
`npx expo start`, usando la configuración de API local ya validada por el dueño.
No utilizar la URL del harness de pruebas en el iPhone.

Pendiente de confirmación del responsable en Expo Go:

1. Legibilidad, áreas seguras y barra de estado con el tamaño de texto del iPhone.
2. SVG visibles, scroll vertical y desplazamiento de destacados.
3. Inicio → Catálogo → Detalle → regresar, sin barra duplicada y restaurando la barra nativa.
4. Destacados reales recibidos desde el Express conectado a Neon.
5. Avisos visuales sin activar búsqueda, carrito, favoritos o autenticación.

Referencias consultadas para las versiones instaladas: [Expo SDK 57](https://docs.expo.dev/versions/v57.0.0/),
[NativeTabs](https://docs.expo.dev/versions/v57.0.0/sdk/router/native-tabs/),
[ocultar la barra del contenedor](https://docs.expo.dev/router/advanced/native-tabs/#hiding-the-tab-bar),
[Expo Image](https://docs.expo.dev/versions/v57.0.0/sdk/image/),
[StatusBar](https://docs.expo.dev/versions/v57.0.0/sdk/status-bar/),
[RN 0.86 StyleSheet](https://reactnative.dev/docs/0.86/stylesheet).
