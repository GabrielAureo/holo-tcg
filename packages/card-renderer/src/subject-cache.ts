const DB_NAME = 'holo-renderer-cache';
const DB_VERSION = 1;
const STORE_NAME = 'subjects';
const PIPELINE_VERSION = 'imgly-1.7.0-v1';
const MAX_CACHE_BYTES = 96 * 1024 * 1024;
const MAX_CACHE_ENTRIES = 80;
const FREQUENCY_BONUS_MS = 7 * 24 * 60 * 60 * 1000;

type SubjectCacheEntry = {
  key: string;
  blob: Blob;
  size: number;
  accessCount: number;
  lastAccessed: number;
  createdAt: number;
};

export type SubjectCacheStats = {
  entries: number;
  bytes: number;
};

function cacheKey(artworkKey: string) {
  return `${PIPELINE_VERSION}:${artworkKey}`;
}

function openDatabase() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('IndexedDB is unavailable'));
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME, { keyPath: 'key' });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open subject cache'));
  });
}

function requestResult<T>(request: IDBRequest<T>) {
  return new Promise<T>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'));
  });
}

async function allEntries(db: IDBDatabase) {
  const transaction = db.transaction(STORE_NAME, 'readonly');
  return requestResult(transaction.objectStore(STORE_NAME).getAll()) as Promise<SubjectCacheEntry[]>;
}

async function evictIfNeeded(db: IDBDatabase) {
  const entries = await allEntries(db);
  let totalBytes = entries.reduce((sum, entry) => sum + entry.size, 0);
  if (entries.length <= MAX_CACHE_ENTRIES && totalBytes <= MAX_CACHE_BYTES) return;

  const now = Date.now();
  const evictionOrder = [...entries].sort((left, right) => {
    // Frequently viewed subjects get a recency bonus, but old popular cards can still age out.
    const leftScore = left.lastAccessed + Math.log2(left.accessCount + 1) * FREQUENCY_BONUS_MS;
    const rightScore = right.lastAccessed + Math.log2(right.accessCount + 1) * FREQUENCY_BONUS_MS;
    return leftScore - rightScore || left.createdAt - right.createdAt || now - left.lastAccessed - (now - right.lastAccessed);
  });

  const transaction = db.transaction(STORE_NAME, 'readwrite');
  const store = transaction.objectStore(STORE_NAME);
  let remainingEntries = entries.length;
  for (const entry of evictionOrder) {
    if (remainingEntries <= MAX_CACHE_ENTRIES && totalBytes <= MAX_CACHE_BYTES) break;
    store.delete(entry.key);
    totalBytes -= entry.size;
    remainingEntries -= 1;
  }
}

export async function getCachedSubject(artworkKey: string) {
  try {
    const db = await openDatabase();
    const key = cacheKey(artworkKey);
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const entry = await requestResult(store.get(key)) as SubjectCacheEntry | undefined;
    if (!entry) { db.close(); return null; }
    entry.accessCount += 1;
    entry.lastAccessed = Date.now();
    store.put(entry);
    db.close();
    return entry.blob;
  } catch {
    return null;
  }
}

export async function cacheSubject(artworkKey: string, blob: Blob) {
  try {
    const db = await openDatabase();
    const key = cacheKey(artworkKey);
    const now = Date.now();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const previous = await requestResult(store.get(key)) as SubjectCacheEntry | undefined;
    store.put({ key, blob, size: blob.size, accessCount: (previous?.accessCount ?? 0) + 1, lastAccessed: now, createdAt: previous?.createdAt ?? now } satisfies SubjectCacheEntry);
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error ?? new Error('Could not store subject'));
      transaction.onabort = () => reject(transaction.error ?? new Error('Could not store subject'));
    });
    await evictIfNeeded(db);
    db.close();
  } catch {
    // Rendering should never fail because the opportunistic cache is unavailable.
  }
}

export async function getSubjectCacheStats(): Promise<SubjectCacheStats> {
  try {
    const db = await openDatabase();
    const entries = await allEntries(db);
    db.close();
    return { entries: entries.length, bytes: entries.reduce((sum, entry) => sum + entry.size, 0) };
  } catch {
    return { entries: 0, bytes: 0 };
  }
}

export async function clearSubjectCache() {
  try {
    const db = await openDatabase();
    const transaction = db.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).clear();
    await new Promise<void>((resolve) => { transaction.oncomplete = () => resolve(); });
    db.close();
  } catch {
    // Cache cleanup is best-effort.
  }
}
