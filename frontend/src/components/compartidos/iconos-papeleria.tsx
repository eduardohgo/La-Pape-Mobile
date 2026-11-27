import { Image } from 'expo-image';

type IconName = 'search' | 'cart' | 'heart' | 'user' | 'home' | 'grid' | 'arrow' | 'close' | 'back' | 'filter'
  | 'mail' | 'lock' | 'eye' | 'eye-off' | 'check' | 'pin' | 'bag' | 'card' | 'settings';

const paths: Record<IconName, string> = {
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
  cart: '<path d="M2 3h3l2.2 12h12l2.1-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  heart: '<path d="M20.8 4.8c-2.4-2.4-6.3-1.6-8.8 1.1C9.5 3.2 5.6 2.4 3.2 4.8c-2.5 2.5-1.4 6.1 1 8.6L12 21l7.8-7.6c2.4-2.5 3.5-6.1 1-8.6Z"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
  home: '<path d="m2 11 10-9 10 9h-3v10h-5v-7h-4v7H5V11Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  arrow: '<path d="M3 12h17m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  back: '<path d="m15 5-7 7 7 7"/>',
  filter: '<path d="M3 4h18l-7 8v7l-4 2v-9Z"/>',
  mail: '<rect x="2.5" y="5" width="19" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/>',
  eye: '<path d="M2 12s3.6-6 10-6 10 6 10 6-3.6 6-10 6-10-6-10-6Z"/><circle cx="12" cy="12" r="2.6"/>',
  'eye-off': '<path d="M3 3l18 18M9 6.5A10.9 10.9 0 0 1 12 6c6.4 0 10 6 10 6a15 15 0 0 1-3 3.4M6 7.8A15 15 0 0 0 2 12s3.6 6 10 6c1.4 0 2.7-.3 3.9-.8"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  bag: '<path d="M4 7h16l1 15H3Z"/><path d="M8 8V6a4 4 0 0 1 8 0v2"/>',
  card: '<rect x="2" y="4" width="20" height="16" rx="3"/><path d="M2 9h20M6 15h5"/>',
  settings: '<path d="m9 2-.7 3-3 1-2.6-1.2-2 3.4 2.2 2.1v3.4L.7 16l2 3.4L5.3 18l3 1 .7 3h4l.7-3 3-1 2.6 1.4 2-3.4-2.2-2.3v-3.4L21.3 8l-2-3.4L16.7 6l-3-1-.7-3Z"/><circle cx="11" cy="12" r="3"/>',
};

const base64Alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

function svgDataUri(svg: string): string {
  // expo-image's Android data-URL loader always decodes the payload as Base64.
  // Encode UTF-8 without relying on Node Buffer or browser-only globals in Hermes.
  const bytes = encodeURIComponent(svg).replace(/%([0-9A-F]{2})/g,
    (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
  let encoded = '';
  for (let offset = 0; offset < bytes.length; offset += 3) {
    const second = offset + 1 < bytes.length;
    const third = offset + 2 < bytes.length;
    const block = (bytes.charCodeAt(offset) << 16)
      | ((second ? bytes.charCodeAt(offset + 1) : 0) << 8)
      | (third ? bytes.charCodeAt(offset + 2) : 0);
    encoded += base64Alphabet[block >>> 18] + base64Alphabet[(block >>> 12) & 63]
      + (second ? base64Alphabet[(block >>> 6) & 63] : '=')
      + (third ? base64Alphabet[block & 63] : '=');
  }
  return 'data:image/svg+xml;base64,' + encoded;
}

// Keep the original vector paths, colors and sizing on every platform.
export function HomeIcon({ name, size = 24, color = '#252334', filled = false }: {
  name: IconName; size?: number; color?: string; filled?: boolean;
}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
  return <Image source={{ uri: svgDataUri(svg) }} style={{ width: size, height: size }} accessible={false} />;
}
