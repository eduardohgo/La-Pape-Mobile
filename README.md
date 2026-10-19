# La Pape Mobile

API compartible por Mobile y Web; la prioridad es la aplicación móvil.
Responsable: Carlos Eduardo Hidalgo Toledo (@eduardohgo). Metodología: Scrumban.
La planeación y la evidencia se mantienen en el [GitHub Project](https://github.com/users/eduardohgo/projects/1).

```text
La-Pape-Mobile/
├── frontend/    React Native, Expo SDK 57, Expo Router y TypeScript estricto
├── backend/     Node.js, Express y preparación PostgreSQL
├── docs/        alcance, seguridad y comprobaciones
└── README.md
```

Cada aplicación tiene su propio package.json y package-lock.json. No comparten
dependencias ni requieren iniciar la otra para funcionar. Node.js 22.13 o superior.

La organización actual del código se explica en
[docs/guia-estructura-proyecto.md](docs/guia-estructura-proyecto.md), con el mapa
de nombres anteriores y actuales. Esta reorganización se realizó exclusivamente
en la computadora local: no incluyó operaciones de Git, GitHub o GitHub Projects.

## Ejecutar desde VS Code

Abrir la raíz y usar dos terminales PowerShell independientes.

Terminal del backend:

```powershell
cd backend
npm ci
npm start
```

Sin credenciales, el servidor escucha por defecto en `127.0.0.1:3000`.
`GET /health` no accede a PostgreSQL ni modifica registros:

```powershell
Invoke-RestMethod http://127.0.0.1:3000/health
```

Terminal del frontend:

```powershell
cd frontend
npm ci
# Conservar .env.local si ya existe. .env.example es una referencia sin secretos.
npm start -- --clear
```

Si las dependencias ya están instaladas, no es necesario repetir `npm ci`.
Después del traslado, Metro debe iniciarse desde `frontend/`, no desde la raíz.
No ejecutar el script de reinicio del proyecto para esta integración.

## Prueba desde iPhone con Expo Go

1. Computadora y iPhone conectados a la misma red local, sin aislamiento entre clientes.
2. Identificar la IPv4 del adaptador conectado con `ipconfig`.
3. En la terminal de `backend/`, iniciar para LAN:
   `$env:HOST='0.0.0.0'; npm start`.
4. En `frontend/.env.local`, usar `EXPO_PUBLIC_API_URL=http://IP_DE_LA_PC:3000`
   y `EXPO_PUBLIC_API_ENV=development`. Sustituir el marcador por la IPv4 real.
   `localhost` desde el iPhone representa el propio teléfono.
5. Abrir `http://IP_DE_LA_PC:3000/health` en Safari y verificar `ok: true`.
6. En `frontend/`, ejecutar `npm start -- --lan --clear`, escanear el QR con
   el iPhone y abrir Expo Go. Verificar Inicio → Catálogo → Detalle → Catálogo,
   búsqueda por nombre/SKU/categoría, filtros y reintento. Recargar y repetir.
   El componente de diagnóstico histórico se conserva en el código, pero ya
   no se muestra en Inicio.

Si Windows solicita acceso de red, permitir Node solo en la red privada de
confianza. No se cambian reglas de firewall automáticamente. Si Expo Go/iOS
rechaza HTTP local o el acceso a la red local, registrar el mensaje; no desactivar
globalmente ATS/TLS. Revisar el permiso local de Expo Go o preparar HTTPS local
de confianza/desarrollo en una actividad posterior. Esta intervención no acredita
que la conexión ya funcione en el iPhone del responsable.

Solo la URL pública, el entorno y el timeout pueden exponerse a Expo.
Nunca poner DATABASE_URL, contraseñas, claves JWT, tokens o claves de correo en
variables `EXPO_PUBLIC_*`. Staging/producción requieren HTTPS.

## Verificaciones repetibles

Desde `frontend/`:

```powershell
npm run lint -- --no-cache
npx --no-install tsc --noEmit
npm test
```

Desde `backend/`:

```powershell
npm test
npm run check
```

Ver [frontend/README.md](frontend/README.md), [backend/README.md](backend/README.md)
y [docs/issue-19.md](docs/issue-19.md) para configuración, límites y evidencia.
No hay despliegue, migraciones automáticas, sincronización, autenticación ni
compras habilitadas en esta base. Esta revisión local no modifica las Issues
ni los estados del Project. Los resultados de sus etapas anteriores se conservan
en sus respectivos informes.

## Reportes de pruebas en GitHub Actions

El workflow `.github/workflows/ci.yml` usa Node.js 22. Los comandos `test:ci`
ejecutan las mismas pruebas existentes una sola vez con dos reporteros nativos
de Node Test Runner: `spec` conserva los logs legibles y `junit` genera XML.
`npm test` y `npm run test:integration` mantienen su comportamiento anterior.
No se necesitan paquetes nuevos ni credenciales de Neon.

Después de publicar estos cambios mediante el flujo de revisión autorizado:

1. Abrir **Actions → CI - Pruebas La Pape Mobile** y seleccionar la ejecución
   del commit que contiene estos archivos. Los eventos push/PR conservan sus
   ramas de destino actuales; este cambio local no publica ni integra nada.
2. Leer el **Summary**: muestra SUCCESS, FAILED, NO EJECUTADO o CANCELADO por
   comando, incluida sintaxis del backend, ESLint y TypeScript. Si falta un XML,
   indica `NO GENERADO`; un comando exitoso sin su XML también falla el resumen.
3. Abrir el job y sus pasos para consultar casos y errores en los logs.
4. En **Artifacts**, descargar `reportes-ci-<ejecucion>-<intento>`; contiene
   `backend.xml`, `frontend.xml`, `integracion.xml`, `herramientas-ci.xml`
   y `resumen.md`, según los pasos que pudieron ejecutarse. Se conservan 14 días.

El resumen se escribe en `$GITHUB_STEP_SUMMARY`. El resumen y la publicación
usan `if: always()` para intentarse después de un fallo; no utilizan
`continue-on-error`. Las verificaciones independientes continúan si sus
dependencias se instalaron correctamente. El estado definitivo de Actions
también incluye posibles errores al publicar los artefactos. Una interrupción
del runner puede impedir generar o subir archivos.

Actualmente la aplicación tiene 82 casos (52 backend, 29 frontend y 1 HTTP).
Las pruebas del generador de reportes se identifican por separado. SUCCESS
describe el resultado del comando: los casos individuales omitidos o pendientes
se consultan en el XML y en los logs y no se consideran aprobados. La integración
HTTP usa Express local y `/health`; no consulta Neon ni valida la interfaz nativa.

Para comprobar el resultado exitoso, ejecutar manualmente el workflow con
**simular_fallo desmarcado**. Para comprobar el reporte de error, repetir con
**simular_fallo marcado**: la ejecución y el artefacto se identifican como
**SIMULACION**, se ejecuta un caso intencional separado y el workflow debe quedar
**Failed**. Las pruebas reales no se alteran; se añade `simulacion-fallo.xml`.
GitHub exige que `workflow_dispatch` esté publicado en la **rama predeterminada**
para habilitar **Run workflow**; subirlo solo a otra rama puede no mostrar el
botón. Esa publicación/integración queda a cargo del responsable y requiere su
flujo de revisión habitual; no se realiza automáticamente.

Para reproducir los XML localmente con Node.js 22, desde la raíz:

```powershell
cd backend
npm run test:ci
cd ../frontend
npm run test:ci
npm run test:integration:ci
cd ..
node --test scripts/ci/test/reportes.test.mjs
```

Los XML quedan en `reportes/ci/`, excluido de los archivos fuente mediante
`.gitignore`. Cada comando elimina solo su XML anterior antes de empezar, para
no reutilizar reportes viejos si falla la compilación. `resumen.md` se genera
en Actions con los estados reales de sus pasos; no se inventan resultados locales.
Referencias: [reporteros de Node.js 22](https://nodejs.org/download/release/latest-v22.x/docs/api/test.html#multiple-reporters),
[Step Summary](https://docs.github.com/en/actions/reference/workflows-and-actions/workflow-commands#adding-a-job-summary)
y [upload-artifact v4](https://github.com/actions/upload-artifact/tree/v4).

## Preparación de Neon y catálogo

El destino de desarrollo confirmado es Neon PostgreSQL 18, proyecto
`twilight-moon-02635569`, rama `development`, base `lapape_mobile_dev`.
El responsable confirmó que ChatGPT aplicó y validó 001: tres tablas de catálogo,
dos FK validadas, imagen nullable y ninguna tabla inesperada. Posteriormente se
aplicó 002 con autorización: diez fichas separadas en `demo.product_previews`,
sin habilitar ventas; las tablas comerciales permanecen vacías según la evidencia
registrada. No repetir estas migraciones. Sus archivos se conservan sin cambios
y esta reorganización no ejecuta SQL ni verifica nuevamente Neon.
Los scripts de esquema, consultas de lectura y revisión de candidatos están en
`backend/db/`. No se ejecutan al iniciar Express ni desde Expo.
Los diez artículos demo siguen pendientes de aprobación comercial; se excluyen
productos e inventarios sintéticos y datos personales. Ver el
[plan revisable y sus límites](docs/neon-catalog-preparation.md).
