# Arquitectura y patrones en código utilizado

```text
View: pantalla-catalogo / pantalla-detalle-producto
  -> hooks React: useCatalogViewModel / useProductDetailViewModel
  -> ViewModel: snapshots, retry, cancel, subscribe
  -> casos de uso: loadCatalog / loadProduct
  -> CatalogRepository (contrato del dominio)
  <- createHttpCatalogRepository (adaptador)
  -> createCatalogService -> createHttpClient -> API compartida

composicion.ts ensambla dependencias y conserva un adaptador por runtime.
```

El dominio no depende de React, fetch o Expo. Las pantallas mantienen JSX, estilos,
navegación y estado visual local. Los ViewModels encapsulan las solicitudes y los
estados loading/loaded/error; el de detalle también not-found. Los casos de uso
validan UUID de detalle y ordenan copias de categorías; no recalculan precios.

## Singleton

Ubicación: [composicion.ts](../../frontend/src/features/catalogo/composicion.ts),
createCatalogScope y applicationScope. Uso real: los hooks pasan getCatalogRepository
a sus ViewModels; la primera carga construye el adaptador y las siguientes lo reutilizan.

```ts
// Fragmento del código real de createCatalogScope:
let instance: CatalogRepository | undefined;
// Dentro de getRepository:
return instance ??= build();
```

Alcance: un runtime de la app, creación perezosa, sin caché de productos ni sesiones.
Cada pantalla conserva un ViewModel propio. Las pruebas construyen ámbitos aislados
y verifican identidad, una sola construcción y recuperación tras construcción fallida.

## Factory

Ubicaciones: [createCatalogService](../../frontend/src/services/servicio-catalogo.ts),
[createHttpClient](../../frontend/src/services/http/cliente-http.ts) y
[createHttpCatalogRepository](../../frontend/src/features/catalogo/datos/repositorio-http.ts).
Son funciones creadoras con dependencias explícitas, no clases Factory nominales.

Ejemplo de ensamblaje real en composicion.ts:

```ts
createHttpCatalogRepository(
  createCatalogService(getApiConfig()),
  __DEV__ && process.env.EXPO_PUBLIC_CATALOG_MODE === 'demo' ? 'demo' : 'commercial',
)
```

La Factory permite inyectar transporte simulado en pruebas y conservar el cliente
HTTP utilizado en producción. Se prueban instancias independientes y sus llamadas.

## Repository

Ubicaciones: [contrato](../../frontend/src/features/catalogo/dominio/repositorio-catalogo.ts)
y [adaptador HTTP](../../frontend/src/features/catalogo/datos/repositorio-http.ts).

```ts
export interface CatalogRepository {
  list(signal: AbortSignal): Promise<CatalogData>;
  detail(id: string, signal: AbortSignal): Promise<VisibleProductDetail>;
}
```

loadCatalog y loadProduct consumen ese contrato sin conocer HTTP. El adaptador usa
categories/products/product del servicio comercial; en modo demo usa únicamente
los métodos demo. No mezcla catálogos ni cambia a demo ante un error comercial.
El 404 se convierte en ProductNotFoundError, sin filtrar cuerpos privados al estado UI.

## Observer

Ubicaciones: [viewmodels.ts](../../frontend/src/features/catalogo/presentacion/viewmodels.ts)
y [hooks.ts](../../frontend/src/features/catalogo/presentacion/hooks.ts).

Ejemplo real de conexión:

```ts
const state = useSyncExternalStore(
  model.subscribe, model.getSnapshot, model.getInitialSnapshot,
);
useEffect(() => {
  void model.retry();
  return model.cancel;
}, [model]);
```

subscribe registra callbacks; publish notifica snapshots; la función devuelta retira
la suscripción. Los callbacks duplicados reciben una notificación por publicación,
con limpieza independiente de cada alta. Retry cancela la solicitud anterior y solo
la vigente publica su respuesta. Al desmontar, el efecto cancela y React administra
la baja del Observer.

Las pruebas ejecutadas comprueban notificaciones, bajas repetidas, retirada durante
notificación, aislamiento, cancelación y respuestas tardías. La conexión React está
en código real y su render SSR se prueba; su montaje/cleanup automatizado en cliente
sigue pendiente. No se deduce Observer solamente por encontrar useEffect.

Pruebas localizables: [arquitectura](../../frontend/test/catalog-architecture.test.cjs)
e [integración/Observer](../../frontend/test/catalog-integration.test.cjs).
