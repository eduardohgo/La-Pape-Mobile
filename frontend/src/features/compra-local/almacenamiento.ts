export type KeyValueStorage = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
};
export type LocalStorage = { read(): Promise<unknown>; write(value: unknown): Promise<void> };
type Manifest = { generation: string; count: number };

function manifest(text: string | null): Manifest | null {
  if (text === null) return null;
  const value = JSON.parse(text);
  if (!value || !/^[a-z0-9]+_[a-z0-9]+$/.test(value.generation)
    || !Number.isInteger(value.count) || value.count < 1 || value.count > 128) throw new Error('Almacenamiento local inválido.');
  return value;
}

// Small encrypted values avoid historical iOS keychain limits. The pointer is committed last.
export function createLocalStorage(storage: KeyValueStorage, namespace: string): LocalStorage {
  const index = `${namespace}.index`;
  const key = (generation: string, part: number) => `${namespace}.${generation}.${part}`;
  async function removeParts(value: Manifest) {
    await Promise.all(Array.from({ length: value.count }, (_, i) => storage.remove(key(value.generation, i))));
  }
  return {
    async read() {
      const current = manifest(await storage.get(index));
      if (!current) return null;
      const parts = await Promise.all(Array.from({ length: current.count }, (_, i) => storage.get(key(current.generation, i))));
      if (parts.some(part => part === null)) throw new Error('No se pudo recuperar la lista local.');
      return JSON.parse(parts.join(''));
    },
    async write(value) {
      let previous: Manifest | null = null;
      const old = await storage.get(index);
      try { previous = manifest(old); } catch { /* Explicit reset can replace corrupt local data. */ }
      const chunks: string[] = [];
      let chunk = '';
      let bytes = 0;
      for (const char of JSON.stringify(value)) {
        const point = char.codePointAt(0) ?? 0;
        const length = point <= 0x7F ? 1 : point <= 0x7FF ? 2 : point <= 0xFFFF ? 3 : 4;
        if (bytes + length > 1024) { chunks.push(chunk); chunk = ''; bytes = 0; }
        chunk += char; bytes += length;
      }
      chunks.push(chunk);
      if (chunks.length > 128) throw new Error('La lista supera el tamaño de almacenamiento local.');
      // This identifier only separates storage generations; it is never a security token.
      let generation = Date.now().toString(36) + '_' + (Math.random().toString(36).slice(2) || '0');
      if (generation === previous?.generation) generation += '0';
      const current = { generation, count: chunks.length };
      try {
        for (let i = 0; i < chunks.length; i++) await storage.set(key(generation, i), chunks[i]);
        await storage.set(index, JSON.stringify(current));
      } catch {
        await removeParts(current).catch(() => {});
        throw new Error('No se pudo guardar la lista en este dispositivo.');
      }
      if (previous) await removeParts(previous).catch(() => {});
    },
  };
}
