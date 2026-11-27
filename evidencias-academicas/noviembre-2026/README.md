# La Pape Mobile — Evidencias académicas (noviembre de 2026)

**Asignatura:** Desarrollo Móvil Integral  
**Actividades:** 6 (Cloud, seguridad y pruebas) y 7 (APK y distribución).  
**Estado del expediente:** En integración. No constituye una afirmación de cumplimiento total.

> Este repositorio es **público**. Se admiten únicamente evidencias revisadas y anonimizadas. No incorporar credenciales, datos personales de prueba, tokens, claves privadas, certificados raíz de laboratorio, archivos .env, bases de datos, rutas de runtime privadas ni APK Debug con configuración local sensible.

## Seguimiento de la rúbrica

| Criterio | Valor | Evidencia actual / pendiente |
|---|---:|---|
| 6.1 API Cloud y JWT | 1.50 | API HTTPS y Bearer opaco probados; JWT integrado aún por verificar |
| 6.2 Certificate Pinning | 1.50 | Pruebas TLS de laboratorio en Node; falta prueba nativa Android |
| 6.3 Derechos ARCO | 1.50 | Capturas Android Debug de acceso, rectificación, oposición y consentimiento; cancelación desde interfaz pendiente; aviso legal borrador |
| 6.4 Ofuscación R8/ProGuard | 1.50 | Compilación Release V4, análisis JADX, inspección DEX; faltan reglas y shrinkResources plenamente acreditados |
| 6.5 Caja negra Debug/Release | 2.00 | Pruebas V4 y ARCO Debug realizadas; falta Release integrada comparable |
| 7.1 Google Play Store | 1.00 | Pendiente; se atenderá al final |
| 7.2 APK/AAB firmado | 0.50 | **APK V4 verificada con firma v2**, ver `actividad-7/02-apk-firmada/` |
| 7.3 Permisos Android | 0.50 | Inventario y manifiesto compilado de APK V4 verificados, ver `actividad-7/03-permisos-android/` |

**Distinción de versiones:** la APK V4 Release, paquete `mx.lapape.mobile`, y la APK ARCO Debug de laboratorio, paquete `mx.lapape.mobile.arcolab`, son distintas. Sus resultados no se sustituyen entre sí.

## Entregables académicos

Los informes Word/PDF, figuras sanitizadas y matrices se incorporarán **solo después de revisar su contenido y metadatos**. Los APK grandes se distribuirán mediante EAS Build o GitHub Releases, no en el historial Git.

La organización de este directorio sigue el instrumento de evaluación del docente y busca permitir una verificación reproducible de los resultados, sin presentar laboratorios como sistemas publicados.

## Integridad y publicación

- Rama de evidencias independiente; **no fusionar a main automáticamente**.
- Sin despliegue de Render, migración de Neon ni publicación en Google Play.
- Conservar hashes SHA-256 y fecha/entorno para cada artefacto.
- No publicar capturas con correos, contraseñas, OTP, JWT, claves privadas o datos identificables.
