import { VrmMetadata } from '../types/tampi';

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
    request.onerror = () =>
      reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

export async function saveVrmToIndexedDb(file: File): Promise<{
  metadata: VrmMetadata;
  blobUrl: string;
}> {
  const buffer = await file.arrayBuffer();
  const db = await openDb();
  const record: StoredVrmRecord = {
    id: ACTIVE_KEY,
    name: file.name,
    size: file.size,
    updatedAt: new Date().toISOString(),
    buffer,
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
  const db = await openDb();

  const record = await new Promise<StoredVrmRecord | undefined>(
    (resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(ACTIVE_KEY);
      req.onsuccess = () => {
        const direct = req.result as StoredVrmRecord | undefined;
        if (direct && direct.buffer) {
          resolve(direct);
          return;
        }
        const allReq = store.getAll();
        allReq.onsuccess = () => {
          const all = (allReq.result as StoredVrmRecord[] | undefined) ?? [];
          const valid = all.filter((r) => Boolean(r?.buffer));
          valid.sort((a, b) =>
            (b.updatedAt || '').localeCompare(a.updatedAt || ''),
          );
          resolve(valid[0]);
        };
        allReq.onerror = () => resolve(undefined);
      };
      req.onerror = () =>
        reject(req.error ?? new Error('Failed to read VRM from IndexedDB.'));
    },
  );

  db.close();

  if (!record || !record.buffer) return null;

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
    const res = await fetch('/tampi.vrm', { method: 'HEAD' });
    if (!res.ok) return false;
    const contentType = (res.headers.get('content-type') || '').toLowerCase();
    if (contentType.includes('text/html')) return false;
    return true;
  } catch {
    return false;
  }
}
