import { get, put } from "@vercel/blob";

export interface KV {
  get<T>(key: string): Promise<T | null>;
  put(key: string, value: unknown): Promise<void>;
  /** Writes only if `key` is new; false when it already exists. */
  putIfAbsent(key: string, value: unknown): Promise<boolean>;
}

const blobPut = (key: string, value: unknown, allowOverwrite: boolean) =>
  put(key, JSON.stringify(value), {
    access: "private",
    addRandomSuffix: false,
    allowOverwrite,
    contentType: "application/json",
  });

export const blobKV: KV = {
  async get<T>(key: string) {
    const result = await get(key, { access: "private", useCache: false });
    if (!result) return null;
    return JSON.parse(await new Response(result.stream).text()) as T;
  },
  async put(key, value) {
    await blobPut(key, value, true);
  },
  async putIfAbsent(key, value) {
    try {
      await blobPut(key, value, false);
      return true;
    } catch (error) {
      if (await blobKV.get(key)) return false;
      throw error;
    }
  },
};

export function memoryKV(map = new Map<string, string>()): KV {
  return {
    async get<T>(key: string) {
      const value = map.get(key);
      return value === undefined ? null : (JSON.parse(value) as T);
    },
    async put(key, value) {
      map.set(key, JSON.stringify(value));
    },
    async putIfAbsent(key, value) {
      if (map.has(key)) return false;
      map.set(key, JSON.stringify(value));
      return true;
    },
  };
}
