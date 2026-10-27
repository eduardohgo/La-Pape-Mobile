# Publicación e integración de Actividad 4 móvil

Rama: codex/actividad4-movil. Destino: develop. Fecha: 27 de octubre de 2026.

## Estado actual preparado para SDK 58

El PR #131 incorpora los commits del PR #130 en su rama, incluida la documentación de riesgo en security/dependencies/EXPO-ZOD-2026-10-27.md. Esto prepara la integración secuencial; no significa que ninguno de los PR se haya fusionado a develop.

Se conservan las dependencias y el lockfile de SDK 58: Expo 58.0.20, React 19.3.0, React Native 0.88.0 y Expo Router 58.0.27. package.json conserva los scripts de las 70 pruebas de Actividad 4. El único conflicto de contenido estuvo en el import de pantalla-catalogo.tsx: se conserva el archivo del refactor MVVM con ComponentRef y useCatalogViewModel, sin el import useEffect que esa pantalla ya no necesita. No se alteran sus estilos ni diseño.

MVVM/Clean, Repository, casos de uso, Singleton, Factory, Observer y las pruebas permanecen en código. No se publican node_modules, archivos .env, snapshots, carpetas local, coverage ni reportes locales completos. Backend, Neon, Cloudinary, autenticación, migraciones y datos comerciales quedan fuera.

## Cómo integrar posteriormente

Revisar primero #130 y después #131, sin cambiar protecciones. Se recomienda merge commit para conservar los ancestros comunes preparados. Tras integrar #130, verificar de nuevo el diff y los checks efectivos de #131: no debe revertir dependencias ni volver a incluir código previo al refactor. Si se elige squash/rebase o develop recibe otros cambios, recalcular la combinación y repetir verificaciones. No fusionar automáticamente ni dar por aprobada una revisión nueva por checks de otro SHA.

El riesgo transitivo de Zod permanece abierto; la decisión de conservar SDK 58 no equivale a que npm audit apruebe. Revisar y aceptar explícitamente ese riesgo al autorizar los merges o esperar una corrección compatible. Los hooks montados, E2E y la cobertura global siguen pendientes.

## Antecedentes y evidencia histórica

El commit inicial de este PR, 6011b68fdddbe84e64e0f4ce5fced8403a55497e, separó arquitectura/pruebas conservando temporalmente SDK 57 de develop. En esa revisión independiente se verificaron 70 pruebas, TypeScript y ESLint. Esa separación ya no describe las dependencias de la revisión actual preparada para SDK 58.

El expediente original y su manifiesto de hashes corresponden al conjunto local original con SDK 58; no son un manifiesto actualizado de esta rama. Las versiones, resultados y cifras históricos no se atribuyen a una ejecución nueva. ARCHIVOS-PARA-REVISION.md mantiene el antecedente de selección; el diff actual del PR define lo que se publica.

Las siete comprobaciones en iPhone fueron declaradas por el usuario para el conjunto original con SDK 58, el 27 de octubre de 2026. No se afirma que se haya repetido una prueba física con la revisión actual ni con sus parches nuevos. La cobertura histórica es del módulo/subconjunto seleccionado, no de toda la aplicación. Mantener intactas esas evidencias y documentar por separado cada nueva verificación.
## Verificación repetida de la integración SDK 58

El 27 de octubre de 2026 se ejecutaron en esta rama combinada npm test (70 aprobadas, 0 fallidas), TypeScript, ESLint, test:integration (1 aprobada con Express local efímero, sin base de datos), expo install --check y Expo Doctor (20/20), todos con exit 0. La exportación del bundle iOS terminó con exit 0. Las pruebas del backend aislado (70) y su comprobación de sintaxis también aprobaron. No se conectó Neon ni se ejecutaron pruebas contra productos reales.

Las verificaciones se ejecutaron con Node v24.21.0. Los resultados remotos de CI/SAST deben consultarse para el último commit del PR; el workflow CI mantiene su entorno Node 22 existente. No se alteraron workflows ni se ocultó el exit 1 de npm audit. No se volvió a medir cobertura y estas cifras no deben sumarse a pruebas previas como casos únicos. Hooks montados y validación física del nuevo conjunto siguen pendientes.