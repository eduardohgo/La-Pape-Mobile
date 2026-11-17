// Call only with fixed event names. Never log request headers, database errors
// or config objects: their messages can contain credentials or user input.
export function logFailure(event) {
  console.error(JSON.stringify({ level: 'error', event }));
}
