// Cards live in IndexedDB on the device only: photos can outgrow localStorage.
const DB_NAME = "stripes";
const STORE = "cards";

let dbPromise;
function db() {
  if (!dbPromise) {
    dbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }
  return dbPromise;
}

async function run(mode, fn) {
  const tx = (await db()).transaction(STORE, mode);
  const result = fn(tx.objectStore(STORE));
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve(result && "result" in result ? result.result : undefined);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export const allCards = () => run("readonly", (s) => s.getAll());
export const putCard = (card) => run("readwrite", (s) => s.put(card));
export const deleteCard = (id) => run("readwrite", (s) => s.delete(id));
export const putCards = (cards) => run("readwrite", (s) => cards.forEach((c) => s.put(c)));

export const newId = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36) + Math.random().toString(36).slice(2));

// Asks the browser not to evict our data under storage pressure.
export function requestPersistence() {
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

export const settings = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem("stripes." + key);
      return v === null ? fallback : JSON.parse(v);
    } catch (_) {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem("stripes." + key, JSON.stringify(value)); } catch (_) { /* private mode */ }
  },
};
