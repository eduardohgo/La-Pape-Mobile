import { Image } from 'expo-image';

export type StationeryKind = 'notebook' | 'markers' | 'pencils' | 'scissors' | 'glue' | 'paper' | 'hero';

const illustrations = {
  notebook: require('@/assets/images/home/notebook.svg'),
  markers: require('@/assets/images/home/markers.svg'),
  pencils: require('@/assets/images/home/pencils.svg'),
  scissors: require('@/assets/images/home/scissors.svg'),
  glue: require('@/assets/images/home/glue.svg'),
  paper: require('@/assets/images/home/paper.svg'),
  hero: require('@/assets/images/home/hero-stationery.svg'),
};

export function productIllustration(name: string, category: string): StationeryKind {
  const label = name.toLocaleLowerCase('es-MX');
  if (/cuaderno/.test(label)) return 'notebook';
  if (/marcador|plum[oó]n/.test(label)) return 'markers';
  if (/pegamento|adhesivo/.test(label)) return 'glue';
  if (/tijera/.test(label)) return 'scissors';
  if (/l[aá]piz|l[aá]pices|color|bol[ií]grafo/.test(label)) return 'pencils';
  return category === 'Cuadernos' ? 'notebook' : category === 'Arte' ? 'markers' : 'paper';
}

export function StationeryArt({ kind, width = 90, height = 90 }: { kind: StationeryKind; width?: number; height?: number }) {
  return <Image source={illustrations[kind]} style={{ width, height }} contentFit="contain" accessible={false} />;
}
