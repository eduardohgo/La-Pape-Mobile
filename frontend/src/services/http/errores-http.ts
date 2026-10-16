export type ApiErrorKind = 'configuration' | 'network' | 'timeout' | 'cancelled' | 'http' | 'invalid-response';

const messages: Record<ApiErrorKind, string> = {
  configuration: 'Revisa la configuración pública de la API.',
  network: 'No fue posible conectar con la API. Revisa la red y el servidor.',
  timeout: 'La API tardó demasiado en responder.',
  cancelled: 'La solicitud fue cancelada.',
  http: 'La API devolvió un error HTTP.',
  'invalid-response': 'La respuesta de la API no tiene el formato esperado.',
};

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status?: number;

  constructor(kind: ApiErrorKind, status?: number) {
    super(messages[kind]);
    this.name = 'ApiError';
    this.kind = kind;
    this.status = status;
  }
}
