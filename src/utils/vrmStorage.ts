import { VrmMetadata } from '../types/tampi';

export function resolveBuiltinVrmUrl(): string {
  const rawBase = import.meta.env?.BASE_URL || '/';
  if (typeof window === 'undefined') {
    const normalized = rawBase.endsWith('/') ? rawBase : `${rawBase}/`;
    return `${normalized}tampi.vrm`;
  }
  const baseUrl = new URL(rawBase, window.location.origin).href;
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return new URL('tampi.vrm', normalizedBase).href;
}

export const DEFAULT_BUILTIN_VRM_URL = resolveBuiltinVrmUrl();

export const REMOTE_FALLBACK_VRM_URL =
  'https://raw.githubusercontent.com/samiul344/TAMPI/main/public/tampi.vrm';

const DB_NAME = 'tampi_assets_db';
const DB_VERSION = 1;
const STORE_NAME = 'avatars';
const ACTIVE_KEY = 'active_vrm';

interface StoredVrmRecord {
  id: string;
  name: string;
  size: number;
  updatedAt: string;
  buffer: ArrayBuffer;
  isCustomUpload?: boolean;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onblocked = () =>
      reject(new Error('IndexedDB open blocked.'));
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

export async function saveVrmToIndexedDb(file: File): Promise<{
  metadata: VrmMetadata;
  blobUrl: string;
}> {
  const buffer = await file.arrayBuffer();
  if (buffer.byteLength < 1024) {
    throw new Error('Selected file is too small or not a valid .vrm / .glb 3D model.');
  }
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  const isGlbBinary = magic === 0x46546c67; // 'glTF'
  if (!isGlbBinary && !/\.gltf$/i.test(file.name)) {
    throw new Error('Please choose a valid .vrm or .glb 3D avatar file.');
  }

  const db = await openDb();
  const record: StoredVrmRecord = {
    id: ACTIVE_KEY,
    name: file.name,
    size: file.size,
    updatedAt: new Date().toISOString(),
    buffer,
    isCustomUpload: true,
  };

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.put(record);
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('Failed to save VRM file to IndexedDB.'));
  });

  db.close();

  const blobUrl = URL.createObjectURL(
    new Blob([buffer], { type: 'model/gltf-binary' }),
  );

  return {
    metadata: {
      name: record.name,
      size: record.size,
      updatedAt: record.updatedAt,
    },
    blobUrl,
  };
}

export async function loadVrmFromIndexedDb(): Promise<{
  metadata: VrmMetadata;
  blobUrl: string;
} | null> {
  if (typeof indexedDB === 'undefined') return null;

  const readPromise = (async () => {
    const db = await openDb();
    try {
      const record = await new Promise<StoredVrmRecord | undefined>(
        (resolve, reject) => {
          const tx = db.transaction(STORE_NAME, 'readonly');
          const store = tx.objectStore(STORE_NAME);
          const req = store.get(ACTIVE_KEY);
          req.onsuccess = () => {
            const direct = req.result as StoredVrmRecord | undefined;
            if (direct && direct.buffer && direct.isCustomUpload === true) {
              resolve(direct);
              return;
            }
            resolve(undefined);
          };
          req.onerror = () =>
            reject(
              req.error ?? new Error('Failed to read VRM from IndexedDB.'),
            );
        },
      );

      if (!record || !record.buffer || record.buffer.byteLength < 1024) {
        return null;
      }

      const blobUrl = URL.createObjectURL(
        new Blob([record.buffer], { type: 'model/gltf-binary' }),
      );

      return {
        metadata: {
          name: record.name,
          size: record.size,
          updatedAt: record.updatedAt,
        },
        blobUrl,
      };
    } finally {
      db.close();
    }
  })();

  const timeoutPromise = new Promise<null>((resolve) => {
    window.setTimeout(() => resolve(null), 1000);
  });

  return Promise.race([readPromise, timeoutPromise]).catch(() => null);
}

export async function clearVrmFromIndexedDb(): Promise<void> {
  if (typeof indexedDB === 'undefined') return;
  const db = await openDb();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    const store = tx.objectStore(STORE_NAME);
    store.clear();
    tx.oncomplete = () => resolve();
    tx.onerror = () =>
      reject(tx.error ?? new Error('Failed to clear VRM from IndexedDB.'));
  });

  db.close();
}

export async function checkDefaultPublicVrm(): Promise<boolean> {
  try {
    const res = await fetch(DEFAULT_BUILTIN_VRM_URL, { method: 'HEAD' });
    if (!res.ok) return false;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) return false;
    return true;
  } catch {
    return false;
  }
}
