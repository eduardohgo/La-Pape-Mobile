import { isIP } from 'node:net';
import { pathToFileURL } from 'node:url';

const catalogOrigin = 'https://la-pape-mobile-catalogo-tigre10.onrender.com';

function validatePublicAuthOrigin(input) {
  let url;
  try {
    url = new URL(input);
  } catch {
    throw new Error('EXPO_PUBLIC_API_URL debe ser un origen HTTPS válido.');
  }
  const host = url.hostname;
  if (url.protocol !== 'https:' || url.username || url.password || url.port
    || url.pathname !== '/' || url.search || url.hash
    || (input !== url.origin && input !== url.origin + '/')
    || isIP(host.replace(/^\[|\]$/g, '')) || !host.includes('.')
    || !host.split('.').every(label => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    || host.length > 253
    || /\.(localhost|local|internal|lan|test|example|invalid|onion|arpa)$/.test(host)) {
    throw new Error('EXPO_PUBLIC_API_URL requiere un dominio HTTPS público sin ruta, credenciales ni IP.');
  }
}

export function checkAndroidBuild(env) {
  const profile = env.EAS_BUILD_PROFILE;
  if (env.EAS_BUILD_PLATFORM !== 'android' || !['preview', 'production'].includes(profile)) return;

  const expected = profile === 'preview' ? 'staging' : 'production';
  if (env.EXPO_NO_DOTENV !== '1' || env.EXPO_PUBLIC_API_ENV !== expected
    || env.EXPO_PUBLIC_CATALOG_MODE !== 'commercial') {
    throw new Error('El perfil Android requiere la configuración de distribución definida en eas.json.');
  }
  const catalog = env.EXPO_PUBLIC_CATALOG_API_URL?.trim();
  if (catalog !== catalogOrigin && catalog !== catalogOrigin + '/') {
    throw new Error('Define EXPO_PUBLIC_CATALOG_API_URL con el origen HTTPS autorizado del catálogo, sin rutas, puertos ni parámetros.');
  }

  const input = env.EXPO_PUBLIC_API_URL?.trim();
  const format = env.EXPO_PUBLIC_AUTH_TOKEN_FORMAT;
  if (format !== undefined && format !== 'jwt') {
    throw new Error('EXPO_PUBLIC_AUTH_TOKEN_FORMAT debe omitirse o ser jwt.');
  }
  if (format === 'jwt' && !input) {
    throw new Error('JWT requiere EXPO_PUBLIC_API_URL con autenticación pública.');
  }
  if (input === undefined && profile === 'preview') {
    return 'Preview con catálogo público y funciones locales. El acceso a cuentas todavía no está disponible en esta versión de prueba.';
  }
  if (!input) throw new Error(profile === 'production'
    ? 'Define EXPO_PUBLIC_API_URL en el entorno de producción de EAS.'
    : 'EXPO_PUBLIC_API_URL debe omitirse o contener un origen HTTPS público válido.');
  validatePublicAuthOrigin(input);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const notice = checkAndroidBuild(process.env);
    if (notice) console.log(notice);
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
