import type { CartAddResult } from './accion-agregar';

export type FlightRect = Readonly<{ x: number; y: number; width: number; height: number }>;
export type CartFlightPath = Readonly<{ startX: number; startY: number; endX: number; endY: number; controlX: number; controlY: number; size: number }>;
function valid(rect: FlightRect | null): rect is FlightRect {
  return !!rect && Object.values(rect).every(Number.isFinite) && rect.width > 0 && rect.height > 0;
}
function visible(root: FlightRect, rect: FlightRect | null): rect is FlightRect {
  return valid(rect) && rect.x < root.x + root.width && rect.y < root.y + root.height
    && rect.x + rect.width > root.x && rect.y + rect.height > root.y;
}
export function makeCartFlight(root: FlightRect | null, source: FlightRect | null, fallback: FlightRect | null,
  targets: readonly (FlightRect | null)[]): CartFlightPath | null {
  if (!valid(root)) return null;
  // Header first when fully visible; otherwise the fixed footer is the destination.
  const target = targets.find(rect => valid(rect) && rect.x >= root.x && rect.y >= root.y
    && rect.x + rect.width <= root.x + root.width && rect.y + rect.height <= root.y + root.height);
  const origin = visible(root, source) ? source : visible(root, fallback) ? fallback : null;
  if (!target || !origin) return null;
  const left = Math.max(root.x, origin.x), top = Math.max(root.y, origin.y);
  const right = Math.min(root.x + root.width, origin.x + origin.width), bottom = Math.min(root.y + root.height, origin.y + origin.height);
  const size = Math.min(82, Math.max(56, Math.min(origin.width, origin.height)));
  const startX = (left + right) / 2 - root.x, startY = (top + bottom) / 2 - root.y;
  const endX = target.x + target.width / 2 - root.x, endY = target.y + target.height / 2 - root.y;
  return { startX, startY, endX, endY, size, controlX: (startX + endX) / 2,
    controlY: Math.max(size / 2, Math.min(startY, endY) - Math.min(110, Math.abs(endY - startY) * 0.3 + 45)) };
}
export function sampleCartFlight(path: CartFlightPath, progress: number) {
  'worklet';
  const t = Math.max(0, Math.min(1, progress)), inverse = 1 - t;
  return {
    x: inverse * inverse * path.startX + 2 * inverse * t * path.controlX + t * t * path.endX,
    y: inverse * inverse * path.startY + 2 * inverse * t * path.controlY + t * t * path.endY,
    scale: 1 - 0.82 * t, opacity: t < 0.85 ? 1 : (1 - t) / 0.15,
  };
}

// Visual work is cancellable, but a committed cart change is never rolled back by animation.
export function createCartFlightCoordinator() {
  let current: symbol | null = null;
  return {
    isBusy: () => current !== null,
    cancel() { current = null; },
    async run<T>(prepare: () => Promise<T | null>, commit: () => Promise<CartAddResult>, show: (path: T | null) => Promise<void>): Promise<CartAddResult> {
      if (current) return 'ignored';
      const ticket = Symbol(); current = ticket;
      try {
        // Measurement and persistence start together. Leaving the screen cancels
        // the decoration, not the user's already accepted add action.
        const preparation = prepare().catch(() => null);
        const result = await commit();
        if (result !== 'added') return result;
        const path = await preparation;
        if (current === ticket) await show(path).catch(() => {});
        return result;
      } catch { return 'error'; }
      finally { if (current === ticket) current = null; }
    },
  };
}
