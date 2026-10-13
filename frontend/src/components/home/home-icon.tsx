import { Image } from 'expo-image';

type IconName = 'search' | 'cart' | 'heart' | 'user' | 'home' | 'grid' | 'arrow' | 'close';

const paths: Record<IconName, string> = {
  search: '<circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/>',
  cart: '<path d="M2 3h3l2.2 12h12l2.1-9H6"/><circle cx="9" cy="20" r="1"/><circle cx="18" cy="20" r="1"/>',
  heart: '<path d="M20.8 4.8c-2.4-2.4-6.3-1.6-8.8 1.1C9.5 3.2 5.6 2.4 3.2 4.8c-2.5 2.5-1.4 6.1 1 8.6L12 21l7.8-7.6c2.4-2.5 3.5-6.1 1-8.6Z"/>',
  user: '<circle cx="12" cy="7" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/>',
  home: '<path d="m2 11 10-9 10 9h-3v10h-5v-7h-4v7H5V11Z"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
  arrow: '<path d="M3 12h17m-6-6 6 6-6 6"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
};

// Small original vectors, decoded by the already installed expo-image module.
export function HomeIcon({ name, size = 24, color = '#252334', filled = false }: {
  name: IconName; size?: number; color?: string; filled?: boolean;
}) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="${filled ? color : 'none'}" stroke="${color}" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths[name]}</svg>`;
  return <Image source={{ uri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}` }} style={{ width: size, height: size }} accessible={false} />;
}
