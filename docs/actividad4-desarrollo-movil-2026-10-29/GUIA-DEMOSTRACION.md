# Guía breve de demostración ante el profesor

Este es un recorrido propuesto, no el desglose certificado de las siete comprobaciones
declaradas por el usuario. No se han iniciado servidores para preparar el expediente.

## Preparación

Usar el proyecto existente con SDK 58 y la configuración local comercial ya preparada.
Para ver datos remotos, el backend compartido debe estar disponible y el iPhone debe
alcanzar la computadora por la misma red local. No usar 127.0.0.1 como backend en el
teléfono. No mostrar .env, credenciales, Dashboard de Neon ni configuración de Cloudinary.

Si el propietario decide iniciar Expo desde frontend, el comando habitual es:

```powershell
npx expo start --go --lan
```

Es una instrucción para la demostración; no fue ejecutada al preparar este expediente.
El expediente no inicia ni reinicia el backend ni prescribe exponerlo públicamente.

## Recorrido propuesto

1. Abrir Inicio y mostrar la interfaz React Native y las ilustraciones.
2. Entrar a Catálogo y explicar que consulta la API comercial compartida.
3. Buscar por nombre o SKU y aplicar/quitar una categoría; explicar la búsqueda local.
4. Abrir un producto por UUID y mostrar nombre, SKU, descripción y precio MXN sin editarlo.
5. Mostrar que image_url=NULL conserva una ilustración y regresar al catálogo.
6. Explicar estados de carga, vacío, error y reintento con las pruebas automatizadas.
   No simular fallas de servicios ni cambiar configuraciones durante la exposición.
7. Mostrar los cuatro patrones en código y ejecutar npm test; enseñar cobertura y límites.

Los accesos futuros a carrito, favoritos y autenticación no se presentan como funciones
implementadas. No se intenta comprar, crear inventario, registrar usuarios ni publicar datos.

## Evidencia sugerida para adjuntar después

- Capturas auténticas de Inicio, Catálogo con filtro y Detalle de un producto.
- Video opcional del recorrido navegación/regreso, si lo exige el profesor.
- Salida de npm test y cobertura ya conservadas bajo evidencias; una nueva ejecución
  debe distinguirse por su fecha de la evidencia del 27 de octubre.

No se afirma que esos archivos visuales ya existan. Las capturas por sí solas tampoco
acreditan montaje automatizado de hooks, rendimiento o ausencia de fugas.
