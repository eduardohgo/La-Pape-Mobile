# Actividad 4 — Desarrollo Móvil Integral

Entrega académica: **29 de octubre de 2026**. Expediente preparado el **27 de octubre de 2026**.
Aplicación: La Pape Mobile, React Native con Expo SDK 58. Repositorio existente La-Pape-Mobile.

**Nota de publicación:** la revisión actual del PR #131 incorpora SDK 58 del PR #130
conservando la arquitectura y las pruebas de Actividad 4. Ninguno se ha fusionado a develop.
Ver [alcance e integración de la rama](PUBLICACION-INDEPENDIENTE.md) y la
[revisión del riesgo de Zod](../../security/dependencies/EXPO-ZOD-2026-10-27.md).
Las evidencias físicas y manifiestos originales siguen siendo históricos, no una validación nueva.

## Lectura para el profesor

1. [Matriz de los cuatro criterios, 7 puntos](MATRIZ-RUBRICA.md).
2. [Arquitectura y cuatro patrones, con ejemplos reales](ARQUITECTURA-Y-PATRONES.md).
3. [Guía de demostración funcional](GUIA-DEMOSTRACION.md).
4. [Acta de validación manual declarada por el usuario](VALIDACION-IPHONE.md).
5. [Resultados automáticos conservados](evidencias/resultados-automaticos.json) y [salida del runner](evidencias/ejecucion-frontend.txt).
6. [Archivos específicos propuestos para revisión/publicación posterior](ARCHIVOS-PARA-REVISION.md).

Fuentes técnicas del proyecto: [README de arquitectura](../../frontend/src/features/catalogo/README.md)
y [informe de caja blanca](../../frontend/test/INFORME-CAJA-BLANCA-2026-10-27.md).
Esos documentos permanecen intactos como antecedentes. Sus menciones de prueba manual
pendiente quedan complementadas por el acta nueva; no implican montaje automatizado.

## Qué está acreditado y qué se declara

- **Automático, ejecución previa comprobada en archivos:** 70 pruebas frontend aprobadas,
  cero fallidas, omitidas o canceladas; TypeScript y ESLint aprobados según el registro
  de caja blanca. El expediente conserva la procedencia y huella de la evidencia.
- **Manual, declarado por el usuario:** siete comprobaciones satisfactorias en iPhone
  el 27 de octubre, sin errores. No fue una ejecución física observada por el agente.
- **No acreditado:** hooks montados en cliente, E2E automatizado, cobertura global,
  métricas de rendimiento/memoria y una calificación automática de 7 puntos.

Versiones instaladas verificadas al preparar este expediente: Expo 58.0.19, React 19.3.0,
React Native 0.88.0 y Expo Router 58.0.26. La ejecución de cobertura usó Node v24.21.0.

## Reproducir las pruebas

En una copia del proyecto con las dependencias del lockfile ya instaladas, abrir una
terminal en frontend y ejecutar:

```powershell
cd frontend
npm test
npm run test:coverage
node node_modules/typescript/bin/tsc --noEmit --incremental false
node node_modules/eslint/bin/eslint.js . --max-warnings=0 --no-cache
```

No necesitan backend, Neon, credenciales ni .env privado: utilizan fixtures sintéticas
y transporte inyectado. npm test ejecuta siete archivos .test.cjs. No ejecutar por
confusión test:integration, que inicia Express y es otra comprobación histórica.
Si la copia no tiene node_modules, la instalación desde el lockfile es una preparación
independiente (npm ci desde frontend), no una acción ejecutada para este expediente.

test:coverage recompila las fuentes seleccionadas en .test-build y genera
frontend/coverage/caja-blanca/ejecucion.txt, eventos.jsonl y resultado.json. Esos directorios
son artefactos locales ignorados. La copia bajo evidencias de este expediente conserva
la ejecución anterior y no es sobrescrita al reproducirla. Revisar código de salida,
fecha y límites de la medición, no solo un porcentaje.

Las pruebas están en **frontend/test**, junto al package.json de la aplicación; no
en /test de la raíz del monorepositorio. Debe confirmarse si la rúbrica exige esa ruta
literal o acepta la raíz del proyecto móvil.

## Cobertura conservada: dos alcances, ninguna cifra global

| Alcance | Líneas | Ramas | Funciones |
|---|---:|---:|---:|
| features/catalogo ejecutado, incluidos hooks SSR | 178/182 = 97.80 % | 68/69 = 98.55 % | 29/32 = 90.63 % |
| Conjunto compilado ejecutado: catálogo, servicios, HTTP, configuración y búsqueda | 457/477 = 95.81 % | 263/270 = 97.41 % | 64/71 = 90.14 % |
| Aplicación global y pantallas nativas | No medida | No medida | No medida |

La cobertura V8 corresponde a JavaScript compilado, sin remapeo de source maps a TS.
Los tests SSR ejecutan React real, pero no efectos ni montaje/desmontaje cliente.
Tres pruebas históricas de UX son estáticas, no interacción ni E2E.

## Estado de la entrega

El catálogo tiene interfaces y navegación implementadas, arquitectura/patrones con
pruebas reales y un reporte manual satisfactorio. Para cerrar la evidencia académica
conviene adjuntar capturas o video auténticos si el profesor los exige y confirmar la
equivalencia ViewModels/controladores y la ubicación de /test. No se inventa una
calificación ni se considera la validación manual sustituto del montaje automatizado.

No se modificaron producción, pantallas, backend, datos, migraciones, dependencias,
configuración privada o servicios. No se publicaron archivos ni se generó PDF.
