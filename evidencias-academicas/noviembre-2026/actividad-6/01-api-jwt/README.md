# Actividad 6 — Punto 1: API Cloud y autenticación JWT Bearer (1.50 puntos)

**Estado: PARCIAL — implementación y pruebas de laboratorio aprobadas según el informe de Codex del 27/11/2026.**

## Implementación comunicada por Codex

- JWT Ed25519 solicitado por el cliente nuevo al iniciar sesión.
- Express verifica firma, algoritmo, emisor, audiencia, expiración y estado de sesión/cuenta en PostgreSQL antes de autorizar `/auth/me` y ARCO.
- `POST /auth/refresh` rota el verificador de sesión; Logout la revoca.
- Compatibilidad del login sin opción JWT para conservar tokens Bearer opacos de V4.
- React Native usa SecureStore, restaura «Recordarme», restringe el Bearer JWT al origen de autenticación y limita el reintento tras 401.

## Pruebas reportadas

| Entorno | Resultado comunicado |
|---|---|
| Backend | 168 aprobadas, 0 fallidas, 2 omitidas |
| Integración PostgreSQL 18 desechable + HTTPS verificado | 16 aprobadas |
| Frontend | 180 aprobadas |
| TypeScript, ESLint, sintaxis, git diff --check | Aprobados |
| Android Debug AVD | Login JWT, restauración de sesión, Mi perfil y consultas ARCO sobre TLS 1.3 |
| Refresh por vencimiento en Android | No se esperó vencimiento real; cubierto por pruebas automatizadas |

**APK Debug de laboratorio:** paquete `mx.lapape.mobile.jwtlab`; SHA-256 `831CE916744865692FDBE0CF36BDB07D54088B337F22CFEF06E2E7604B76966B`.

**Commit local declarado:** `51b7f9f1f75d9d0817736d76dd78f1aa7a68b034` en la rama local `entrega/arco-tigre10`. **No está publicado en GitHub**.

## Límites y pendientes

- El backend desplegado en **Render** y la **APK V4** continúan usando tokens Bearer opacos; por tanto, no se acredita aún JWT operativo en Cloud de producción.
- Pendiente revisar candidato, aplicar controladamente migración `010_mobile_jwt_rotation.sql`, configurar claves privadas y variables `AUTH_JWT_*` en un entorno Cloud **aislado**, desplegar backend compatible y conectar nueva APK candidata.
- Realizar prueba HTTPS en Android físico contra el backend Cloud de prueba, junto con regresiones de Login, `/auth/me`, refresh, Logout, 401 y ARCO.
- No publicar claves, tokens, certificados privados, `.env` ni archivos de runtime del laboratorio.

**Fuentes locales declaradas por Codex (no adjuntas al repositorio):**
- `Evidencias-Actividad6-Punto1-JWT/INFORME-JWT.md`
- `Evidencias-Actividad6-Punto1-JWT/lapape-jwt-arco-lab-debug.apk`

Este README resume la salida de Codex; las pruebas en Cloud y Android físico deberán acreditarse mediante evidencias adicionales, sin atribuirlas a la APK V4.
