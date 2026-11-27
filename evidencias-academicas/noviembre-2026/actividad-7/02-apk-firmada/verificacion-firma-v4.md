# Actividad 7 — Punto 2: Verificación de firma de APK V4

**Archivo de origen local:** `lapape-v4.apk`  
**Paquete:** `mx.lapape.mobile`  
**VersionCode:** `4`  
**Herramienta:** `apksigner verify --verbose --print-certs`, Android SDK Build Tools 37.0.0, JBR/OpenJDK 21.0.6.  
**Resultado:** `Verifies` (validación de firma exitosa).

| Atributo | Resultado |
|---|---|
| APK Signature Scheme v1 | false |
| APK Signature Scheme v2 | **true** |
| APK Signature Scheme v3 / v3.1 / v3.2 / v4 | false |
| Firmantes | 1 |
| Algoritmo de clave | RSA |
| Longitud de clave | 2048 bits |
| Certificado SHA-256 | `ab644cb6f5ca0e2d518f7fd6ec724012c9564927d87f8c8642af0c74c40baaa5` |
| SHA-256 del archivo APK | `43E533FCCCB64AFDA09CDF1B3E7408314A7785384F4E534AA03D26AE19606853` |

La firma v2 válida acredita la integridad criptográfica del APK verificado; **no demuestra por sí sola publicación en Google Play**. Este registro corresponde exclusivamente a la APK V4.

**Pendiente de adjuntar:** salida textual de `apksigner`, captura de terminal, e informe académico revisado.
