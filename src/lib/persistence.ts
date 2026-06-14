// ============================================================
// IndexedDB persistence for image batches
// 让长批量任务在刷新/崩溃后能恢复
// ============================================================

import type { ImageEntry } from "@/types";

const DB_NAME = "ai-inpaint-studio";
const DB_VERSION = 1;
const STORE_IMAGES = "images";
const STORE_META = "meta";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB is not available"));
  }
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error);
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = (ev) => {
      const db = (ev.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_IMAGES)) {
        db.createObjectStore(STORE_IMAGES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };
  });
  return dbPromise;
}

function tx<T>(storeName: string, mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T> | Promise<T>): Promise<T> {
  return openDB().then((db) => new Promise<T>((resolve, reject) => {
    const t = db.transaction(storeName, mode);
    const store = t.objectStore(storeName);
    const result = run(store);
    if (result instanceof Promise) {
      result.then(resolve, reject);
      t.oncomplete = () => {};
      return;
    }
    result.onsuccess = () => resolve(result.result);
    result.onerror = () => reject(result.error);
  }));
}

/**
 * 把整个 images 数组持久化（覆盖式：先清空再写，简单但代价小）。
 * 内部用 debounce，避免每次状态变更都立刻写盘。
 */
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let pendingImages: ImageEntry[] | null = null;

export function saveImages(images: ImageEntry[], debounceMs: number = 500): void {
  pendingImages = images;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(async () => {
    const snapshot = pendingImages;
    pendingImages = null;
    saveTimer = null;
    if (!snapshot) return;
    try {
      await flushImages(snapshot);
    } catch (err) {
      console.warn("[persistence] saveImages failed:", err);
    }
  }, debounceMs);
}

async function flushImages(images: ImageEntry[]): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE_IMAGES, "readwrite");
    const store = t.objectStore(STORE_IMAGES);
    store.clear();
    for (const img of images) {
      // 跳过没有任何持久化价值的空条目
      if (!img.id) continue;
      store.put(img);
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(new Error("transaction aborted"));
  });
}

export async function loadImages(): Promise<ImageEntry[]> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const t = db.transaction(STORE_IMAGES, "readonly");
      const store = t.objectStore(STORE_IMAGES);
      const req = store.getAll();
      req.onsuccess = () => resolve((req.result as ImageEntry[]) || []);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    console.warn("[persistence] loadImages failed:", err);
    return [];
  }
}

export async function clearAllPersistedImages(): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE_IMAGES, "readwrite");
      t.objectStore(STORE_IMAGES).clear();
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } catch (err) {
    console.warn("[persistence] clearAllPersistedImages failed:", err);
  }
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  try {
    const db = await openDB();
    await new Promise<void>((resolve, reject) => {
      const t = db.transaction(STORE_META, "readwrite");
      t.objectStore(STORE_META).put({ key, value });
      t.oncomplete = () => resolve();
      t.onerror = () => reject(t.error);
    });
  } catch (err) {
    console.warn("[persistence] setMeta failed:", err);
  }
}

export async function getMeta<T = unknown>(key: string): Promise<T | undefined> {
  try {
    const db = await openDB();
    return await new Promise<T | undefined>((resolve, reject) => {
      const t = db.transaction(STORE_META, "readonly");
      const req = t.objectStore(STORE_META).get(key);
      req.onsuccess = () => resolve((req.result as { value?: T } | undefined)?.value);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return undefined;
  }
}
