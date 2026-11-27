# Contrato inicial de registro — PB-03

Estado: validación aislada con las políticas de longitud y correo aprobadas,
**no lista para producción**. No hay rutas,
usuarios, hashing, sesiones ni consultas a la base. El módulo no está importado
por `app.js` y no habilita autenticación.

`validateRegistration(input)` es una función síncrona y pura en JavaScript ESM.
No muta la entrada, no realiza I/O y no usa variables de entorno. Acepta un objeto
JSON plano (también con prototipo `null`) con exactamente estos tres campos propios,
enumerables y de tipo `string`; no acepta getters, arreglos, clases ni conversiones implícitas.

| Campo | Contrato inicial |
| --- | --- |
| `name` | Obligatorio, no vacío tras trim; máximo 120 puntos de código Unicode en la entrada original. Devuelve trim exterior y conserva espacios interiores, acentos y puntuación. Rechaza controles, caracteres de formato invisibles y sustitutos Unicode aislados en el nombre resultante. |
| `email` | Obligatorio; máximo 254 caracteres en la entrada original, incluidos espacios exteriores. Quita solo esos espacios. Parte local ASCII tipo dot-atom de 1–64 caracteres, sin puntos iniciales/finales/consecutivos. Dominio con al menos dos etiquetas ASCII de 1–63 caracteres, alfanuméricas con guiones interiores. Solo el dominio pasa a minúsculas. |
| `password` | Obligatoria, de tipo `string`, no vacía ni compuesta únicamente de espacios Unicode. Mínimo aprobado de 15 puntos de código Unicode y máximo técnico de 1024 bytes UTF-8, sin truncamiento. Se conserva exactamente: sin recortar espacios, cambiar mayúsculas ni normalizar Unicode. Rechaza sustitutos Unicode aislados para evitar reemplazos silenciosos al codificar UTF-8. No exige mayúsculas, números ni caracteres especiales. |

El correo conserva puntos, sufijos `+` y mayúsculas de la parte local. No aplica
reglas particulares de Gmail u otros proveedores. No admite por ahora direcciones
entre comillas, dominios literales IP ni correo internacional Unicode; acepta
etiquetas ASCII punycode sin convertirlas. Validar la sintaxis no acredita la propiedad
del correo, la existencia del dominio ni la unicidad en la futura base.

El resultado separa `email`, la representación para mostrar o contactar al usuario,
de `emailKey`, la clave canónica generada convirtiendo **todo** el correo validado y
sin espacios exteriores a minúsculas. Ejemplo: `Maria.Jose+Escuela@EXAMPLE.COM`
produce `email: 'Maria.Jose+Escuela@example.com'` y
`emailKey: 'maria.jose+escuela@example.com'`. Las variantes que solo difieren en
mayúsculas tendrán la misma clave. Tanto el registro como el futuro login deberán
usar esta misma regla para sus búsquedas; aquí no se implementa login.
Puntos y sufijos `+` se conservan también en la clave: no equivalen a quitarlos.
`emailKey` es un campo de salida generado por el servidor y se rechaza como entrada.
La unicidad definitiva deberá protegerse mediante una restricción UNIQUE sobre la
clave canónica en PostgreSQL, no solo con una consulta previa. La persistencia deberá
garantizar que esa clave corresponda al correo según esta regla, también al cambiarlo.
No se modifica PostgreSQL ni se comprueba unicidad en esta actividad.

Solo se permiten `name`, `email` y `password`. `role`, `rol`, `permissions` e
`isAdmin` producen `PRIVILEGED_FIELDS`, incluso con valor CLIENTE, false o null.
Cualquier otra propiedad produce `UNKNOWN_FIELDS`, incluidos alias en español,
campos anidados adicionales, `__proto__`, símbolos y propiedades no enumerables.
Los objetos con prototipos personalizados se rechazan. No se ejecutan getters.
El contrato es para datos JSON, no para objetos Proxy con código arbitrario.

El futuro servicio de registro **deberá asignar CLIENTE exclusivamente desde el
servidor**, sin leer ningún rol de la solicitud. El público no puede elegir
TRABAJADOR, ADMIN ni DUENO. El validador no asigna ni devuelve un rol: ante un
campo adicional rechaza todo el objeto en lugar de descartarlo silenciosamente.

## Resultado y errores

Éxito de esta capa de validación:

```js
{ ok: true, productionReady: false, passwordPolicy: 'approved-length',
  nameMaxCodePoints: 120, emailMaxLength: 254,
  passwordMinCodePoints: 15, passwordMaxBytes: 1024,
  data: { name, email, emailKey, password } }
```

Fallo: los mismos metadatos, `ok: false` y `errors: [{ field, code }]`, sin `data`.
`field` es name/email/password o null para errores del objeto. Los códigos son
`INVALID_OBJECT`, `PRIVILEGED_FIELDS`, `UNKNOWN_FIELDS`, `REQUIRED`,
`INVALID_PROPERTY`, `INVALID_TYPE`, `EMPTY`, `TOO_SHORT`, `TOO_LONG` e `INVALID_FORMAT`.
Primero se revisan el objeto y sus campos permitidos; después, la presencia y los
tipos; por último, el contenido. Se acumulan errores dentro de cada fase.
No son respuestas HTTP.
Los errores no reflejan valores ni nombres desconocidos. El resultado exitoso
contiene la contraseña original para el futuro servicio: nunca debe registrarse
en logs ni devolverse como respuesta HTTP.

## Política aprobada y trabajo pendiente

La política aprobada en esta actividad sustituye el estado anterior de decisión
pendiente: mínimo de 15 caracteres Unicode, sin reglas obligatorias de composición,
máximo técnico de 1024 bytes UTF-8 y comparación de correo sin distinguir mayúsculas.
Para el mínimo, «carácter Unicode» significa punto de código, no unidad UTF-16,
byte ni grafema visible: un emoji suplementario cuenta como uno y una letra seguida
de una marca combinante cuenta como dos. No se normaliza la contraseña para contarlos.
Los espacios forman parte de su longitud y se conservan; una contraseña compuesta
únicamente de espacios se rechaza independientemente de su longitud.

Antes del registro real faltan la comprobación de contraseñas comunes o comprometidas
mediante un mecanismo seguro y adecuado, el hashing seguro, la verificación de
propiedad del correo y la persistencia con unicidad protegida por PostgreSQL.
No se ha implementado ni simulado una comprobación de contraseñas comprometidas:
por ejemplo, quince letras iguales pasan esta capa, sin acreditar que sean seguras.
Se deberá seleccionar y revisar ese mecanismo antes de integrar el registro real,
sin exponer la contraseña en claro a servicios de terceros ni registrarla en logs.

`productionReady: false` y `passwordPolicy: 'approved-length'` están presentes tanto
en éxitos como en errores. La segunda marca acredita la regla de longitud aprobada,
no una comprobación completa de seguridad. Son metadatos, no un bloqueo de despliegue.
El soporte de correo internacional continúa fuera del contrato inicial.

Desde `backend/`, sin instalar dependencias:

```powershell
node --test test/registration-validation.test.js
npm test
npm run check
node --check src/validators/validacion-registro.js
node --check test/registration-validation.test.js
git diff --check
```
