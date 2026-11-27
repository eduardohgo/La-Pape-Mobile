# Actividad 6 — Punto 3: Derechos ARCO (1.50 puntos)

**Entorno comprobado:** APK Android Debug aislada `mx.lapape.mobile.arcolab`, servidor Express HTTPS y PostgreSQL desechable. **No es producción.**

## Evidencias verificadas en el laboratorio
- Acceso y consulta de datos personales.
- Rectificación del nombre con persistencia después de cerrar e iniciar sesión.
- Oposición: creación de folio, consulta de historial y determinación del operador.
- Autorización y revocación de promociones.
- Registro con consentimiento promocional no premarcado y verificación mediante OTP **sintético**.
- Aislamiento: una segunda cuenta no observa las solicitudes de otra.
- Logout redirige a Inicio y Privacidad requiere autenticación después.

## Pendientes
- Eliminación de cuenta desde la interfaz Android (existe prueba en PostgreSQL desechable).
- Aprobación y publicación del aviso de privacidad; el actual es **BORRADOR**.
- Integración segura de ARCO en una Release y en los servicios de producción.

## Material fuente para revisión previa al commit
- `La_Pape_Actividad_6_Punto_3_Derechos_ARCO_Evidencias_Android.docx`.
- Capturas PNG anonimizadas del expediente Debug, **excluyendo** `00-avd-systemui-anr.png` de figuras de cumplimiento.
- Matriz de pruebas del laboratorio.

Los archivos gráficos y el informe serán añadidos después de verificar que no contienen datos personales, folios vinculables, credenciales, OTP o referencias privadas de laboratorio.
