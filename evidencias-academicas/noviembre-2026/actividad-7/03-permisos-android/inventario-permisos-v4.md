# Actividad 7 — Punto 3: Permisos Android de APK V4

**Origen:** `aapt2 dump permissions` y `aapt2 dump xmltree ... --file AndroidManifest.xml` sobre el APK V4.  
**Paquete:** `mx.lapape.mobile`  
**SHA-256 APK:** `43E533FCCCB64AFDA09CDF1B3E7408314A7785384F4E534AA03D26AE19606853`

| Permiso solicitado | Justificación o alcance verificable | Permiso peligroso |
|---|---|---|
| `android.permission.INTERNET` | Comunicación de red con las API HTTPS | No |
| `android.permission.ACCESS_NETWORK_STATE` | Consulta de conectividad | No |
| `android.permission.VIBRATE` | Soporte de vibración incluido en el APK; función concreta por confirmar | No |
| `android.permission.USE_BIOMETRIC` | Soporte provisto por dependencias; el flujo probado no acredita uso biométrico | No |
| `android.permission.USE_FINGERPRINT` | Compatibilidad incluida por dependencias, sin flujo de huella probado | No |
| `mx.lapape.mobile.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION` | Protección de receptores internos | No |

No se encontraron solicitudes de cámara, GPS, micrófono o almacenamiento externo en el inventario V4. La aparición de `android.permission.DUMP` dentro del atributo `android:permission` de un componente **no** significa que el APK lo solicite mediante `uses-permission`.

El permiso personalizado figura tanto en `permission` como en `uses-permission`; eso **no** constituye un séptimo permiso solicitado. No se requieren diálogos de autorización de permisos peligrosos para este inventario; un diálogo de autenticación biométrica, si se invocara, sería diferente.

**Pendiente de adjuntar:** copia saneada del volcado `AndroidManifest-compilado.txt`, captura de PowerShell y documento académico revisado.
