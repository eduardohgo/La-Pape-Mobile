# Matriz de trazabilidad — 7 puntos oficiales

Las puntuaciones indican el peso de la rúbrica, no puntos autoasignados. Las rutas
enlazadas son archivos existentes, revisados al preparar el expediente.

| Criterio y peso | Implementación real | Pruebas y evidencia | Estado / límite |
|---|---|---|---|
| Interfaces funcionales React Native — **2 pts** | [Inicio](../../frontend/src/pantallas/pantalla-inicio.tsx), [Catálogo](../../frontend/src/pantallas/pantalla-catalogo.tsx), [Detalle](../../frontend/src/pantallas/pantalla-detalle-producto.tsx), [componentes](../../frontend/src/components/catalogo/componentes-catalogo.tsx), [servicio API](../../frontend/src/services/servicio-catalogo.ts) | Contratos/HTTP, búsqueda e integración entre capas; [resultados automáticos](evidencias/resultados-automaticos.json); [validación manual declarada](VALIDACION-IPHONE.md) | Implementadas carga, vacío, error, reintento, búsqueda, filtros y detalle. Carrito, acceso y favoritos persistentes no están implementados: sus accesos no acreditan esos módulos. Capturas/video no proporcionados. |
| MVVM/Clean y Singleton, Factory, Repository, Observer — **2 pts** | [Composición](../../frontend/src/features/catalogo/composicion.ts), [puerto Repository](../../frontend/src/features/catalogo/dominio/repositorio-catalogo.ts), [adaptador](../../frontend/src/features/catalogo/datos/repositorio-http.ts), [casos de uso](../../frontend/src/features/catalogo/dominio/casos-uso.ts), [ViewModels](../../frontend/src/features/catalogo/presentacion/viewmodels.ts), [hooks](../../frontend/src/features/catalogo/presentacion/hooks.ts) | [21 pruebas de arquitectura](../../frontend/test/catalog-architecture.test.cjs), integración y Observer; [patrones y ejemplos](ARQUITECTURA-Y-PATRONES.md) | Aplicado a Catálogo/Detalle, sin declarar toda la aplicación Clean. Singleton comparte transporte, no datos de pantalla. Los hooks conectan Observer a React; montaje automatizado pendiente. |
| Pruebas de caja blanca — **1.5 pts** | Casos de uso, control de presentación MVVM, modelos/guardas y Repository | [Dominio: 10](../../frontend/test/catalog-domain.test.cjs), [integración/Observer: 8](../../frontend/test/catalog-integration.test.cjs), [SSR: 2](../../frontend/test/catalog-hooks-ssr.test.cjs), 50 previas conservadas; [informe completo](../../frontend/test/INFORME-CAJA-BLANCA-2026-10-27.md) | 70 aprobadas y 0 fallidas. ViewModels ejercen el control de presentación; no se inventan Controllers independientes ni modelos con métodos inexistentes. Confirmar equivalencia académica y frontend/test frente a /test. Sin cobertura global ni hooks montados. |
| Navegabilidad y UX/UI en dispositivo — **1.5 pts** | [Layout raíz](../../frontend/src/app/_layout.tsx), [rutas Inicio/Catálogo](../../frontend/src/app/(tabs)/_layout.tsx), [ruta UUID](../../frontend/src/app/products/[id].tsx), [navegación](../../frontend/src/components/navegacion/pestanas-app.tsx), [presentación accesible e imágenes nulas](../../frontend/src/components/catalogo/componentes-catalogo.tsx) | Navegación por UUID preservada y pruebas lógicas de detalle; [siete comprobaciones satisfactorias declaradas en iPhone](VALIDACION-IPHONE.md) | Validación física reportada por el usuario el 27/10/2026. No hay capturas/video ni medición de tiempo, FPS o memoria. Las pruebas estáticas no se presentan como navegación automatizada. |

## Evidencias completas dentro del alcance

- Archivos reales y separación de responsabilidades localizados.
- Cuatro patrones con llamadas usadas por la aplicación y pruebas con assertions.
- 70 resultados automáticos conservados, comando reproducible y contadores de cobertura.
- Registro fechado y atribuido de la validación manual satisfactoria en iPhone.

## Evidencia adicional o acuerdos pendientes

- Capturas auténticas de Inicio, Catálogo y Detalle, o video del recorrido si se solicita.
  No existen archivos adjuntos de ese tipo en el expediente.
- Montaje automatizado de hooks con efectos, cleanup y Strict Mode: pendiente de
  infraestructura compatible, no reemplazado por SSR o por la declaración manual.
- Confirmar con el profesor la correspondencia MVVM/ViewModel frente al término
  controlador y el significado de /test en un repositorio con frontend independiente.
- No se acredita cobertura global ni pruebas de controladores Express; tampoco hay
  E2E Debug/Release o binario firmado acreditados por esta actividad.
