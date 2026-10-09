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
Copy-Item .env.example .env.local
# Editar únicamente la dirección pública y el entorno en .env.local.
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
   el iPhone y abrir Expo Go. En Home, usar el control de diagnóstico
   **Comprobar API** (solo disponible en desarrollo); verificar el resultado y
   la navegación Home → Explore → Home. Recargar y repetir.

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
No hay despliegue, migración, sincronización automática, autenticación ni compras
habilitadas en esta base. La Issue #19 permanece en Testing hasta la validación
manual del responsable; PB-01 permanece abierto.
