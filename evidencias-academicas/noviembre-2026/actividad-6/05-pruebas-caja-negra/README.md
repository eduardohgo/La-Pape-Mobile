# Actividad 6 — Punto 5: Caja negra Debug/Release (2.00 puntos)

## Versiones distintas
- **Release V4:** `mx.lapape.mobile`, prueba manual en dispositivo físico.
- **Debug ARCO:** `mx.lapape.mobile.arcolab`, AVD con HTTPS y PostgreSQL de laboratorio.

Los resultados de ARCO Debug **no** pueden presentarse como pruebas de Release.

## Resultados observados
- Login y Perfil en ambas versiones, con contextos de prueba diferentes.
- Rectificación, oposición, promociones y registro con OTP sintético en Debug ARCO.
- CN-09: V4 presentaba una incidencia de navegación tras Logout; en Debug ARCO se comprobó el regreso a Inicio con Acceder.
- Aislamiento entre cuentas en laboratorio.

## Pendientes
- Release integrada con ARCO y JWT, si la implementación resulta segura.
- Repetir matriz de regresión sobre la misma versión Debug/Release.
- Cancelación de cuenta desde UI Android en base de datos desechable.
- Registrar defectos, reproducciones, reparaciones y estado por versión.

## Informe preparado
`La_Pape_Actividad_6_Punto_5_Caja_Negra_V4_y_ARCO_Debug_Actualizado.docx`

Las capturas de las pruebas se subirán tras revisión adicional de privacidad.
