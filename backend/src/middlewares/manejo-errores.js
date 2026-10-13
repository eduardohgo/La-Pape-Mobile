export function notFound(_req, res) {
  res.status(404).json({ error: 'Ruta no encontrada' });
}

export function errorHandler(err, _req, res, next) {
  if (res.headersSent) return next(err);
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON inválido' });
  }
  if (err.type === 'entity.too.large') {
    return res.status(413).json({ error: 'Cuerpo de solicitud demasiado grande' });
  }
  if (err.code === 'ORIGIN_DENIED') {
    return res.status(403).json({ error: 'Origen no permitido' });
  }
  return res.status(500).json({ error: 'Error interno del servidor' });
}
