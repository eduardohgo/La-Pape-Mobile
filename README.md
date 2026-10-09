# La Pape Mobile

Aplicación móvil de La Pape.

Este repositorio contiene el código fuente correspondiente al desarrollo de la aplicación móvil de La Pape, organizado bajo un enfoque DevOps.

## Objetivo

Desarrollar una aplicación móvil que permita llevar las principales funcionalidades de La Pape a dispositivos móviles, manteniendo un proceso organizado de desarrollo, control de versiones y seguimiento de actividades.

## Metodología de trabajo

El proyecto será desarrollado utilizando la metodología Scrumban, combinando elementos de Scrum y Kanban para organizar las actividades mediante iteraciones y dar seguimiento al estado de cada tarea.

## Control de versiones

Para administrar y versionar el código fuente se utiliza Git y GitHub.

El desarrollo se organizará mediante diferentes ramas para evitar trabajar directamente sobre la rama principal.

## Responsable

Carlos Eduardo Hidalgo Toledo

## Estado del proyecto

En configuración inicial.

## Análisis estático

Con las dependencias del proyecto instaladas, ejecutar:

```bash
npm run lint
npx tsc --noEmit
```

ESLint utiliza la configuración plana recomendada por Expo SDK 57 para JavaScript,
TypeScript, React y sus hooks. Analiza el código fuente, los scripts y la
configuración JavaScript; excluye las dependencias y los archivos generados por
Expo. El comando falla si encuentra errores o advertencias. TypeScript conserva
el modo estricto de `tsconfig.json`.

Para repetir el análisis sin utilizar la caché:

```bash
npm run lint -- --no-cache
```

Las versiones resueltas están registradas en `package-lock.json`. Estos comandos
realizan comprobaciones automatizadas; las pruebas en dispositivo físico se
registran por separado en las Issues correspondientes. La configuración de
GitHub Actions se realizará cuando se trabaje en el pipeline.
