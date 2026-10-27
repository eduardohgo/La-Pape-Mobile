# Publicación independiente de Actividad 4 móvil

Rama: codex/actividad4-movil. Destino: develop. Fecha: 27 de octubre de 2026.

Esta rama contiene la arquitectura MVVM/Clean del catálogo, sus patrones, las 70
pruebas y el expediente académico. No actualiza las dependencias de Expo/React Native:
conserva el lockfile y versiones SDK 57 de develop para separar el alcance del PR.
La migración SDK 58 se revisa en codex/expo-sdk58 mediante otro PR hacia develop.

El expediente y su manifiesto de hashes son evidencia histórica del conjunto local
original con SDK 58; no son un manifiesto de integridad de esta rama SDK 57. Las
versiones y cifras históricas no se atribuyen a una ejecución nueva. El diff del PR
define la selección efectiva publicada; ARCHIVOS-PARA-REVISION.md describe la selección
conjunta anterior, no una autorización para añadir archivos SDK a este PR.

Las siete comprobaciones en iPhone fueron declaradas por el usuario para el conjunto
original con SDK 58. No se afirma que este checkout SDK 57 abra en Expo Go SDK 58,
ni que se haya repetido una prueba física con esta rama separada.

Se recomienda revisar primero la actualización SDK 58. Hay un archivo compartido
por los dos alcances, pantalla-catalogo.tsx, y scripts distintos en package.json.
Al integrar uno, revisar de nuevo el diff y los checks del otro; puede requerirse
conciliar el refactor con los ajustes de tipos de la migración. No resolver mediante
sobrescritura de la pantalla ni revertir dependencias. Ningún PR se fusiona automáticamente.

La configuración comercial privada, backend, Neon, Cloudinary, autenticación y
migraciones quedan fuera. Tampoco se publican node_modules, .test-build, coverage,
carpetas local, snapshots o archivos .env. Los hooks montados y E2E siguen pendientes.

## Verificación de esta rama separada

Con el lockfile SDK 57 intacto: npm test terminó con 70 aprobadas y 0 fallidas;
TypeScript y ESLint terminaron con exit 0. npm run test:coverage volvió a ejecutar
las 70 pruebas y produjo 97.80 % de líneas del módulo catálogo y 95.81 % del conjunto
compilado ejecutado, sin medir la aplicación global. Esta ejecución nueva no reemplaza
las evidencias originales SDK 58 ni acredita una prueba física nueva.
