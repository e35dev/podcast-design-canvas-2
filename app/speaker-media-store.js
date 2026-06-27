"use strict";

// Durable speaker source and polished audio bytes for Podcast Design Canvas (#197).
//
// Stores imported and processed track bytes in IndexedDB in the browser with an
// in-memory fallback for node tests. Metadata and IDs live in episode session JSON;
// audio bytes never go into localStorage.
(function (global) {
  const DB_NAME = "pdc-speaker-media";
  const DB_VERSION = 1;
  const STORE_NAME = "media";

  const memory = new Map();
  let dbPromise = null;

  function toUint8Array(bytes) {
    if (bytes instanceof Uint8Array) {
      return bytes;
    }
    if (bytes instanceof ArrayBuffer) {
      return new Uint8Array(bytes);
    }
    if (typeof Buffer !== "undefined" && Buffer.isBuffer(bytes)) {
      return new Uint8Array(bytes);
    }
    return new Uint8Array(bytes || []);
  }

  function cloneBytes(bytes) {
    const view = toUint8Array(bytes);
    return view.slice();
  }

  function openDb() {
    if (typeof indexedDB === "undefined") {
      return Promise.resolve(null);
    }
    if (!dbPromise) {
      dbPromise = new Promise((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, DB_VERSION);
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(STORE_NAME)) {
            db.createObjectStore(STORE_NAME, { keyPath: "id" });
          }
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    return dbPromise;
  }

  function buildMediaId(episodeKey, kind, trackIndex) {
    const safeEpisode = String(episodeKey || "episode").replace(/[^a-zA-Z0-9:_-]+/g, "-");
    return `${safeEpisode}:${kind}:${trackIndex}`;
  }

  async function saveMedia(id, bytes, meta) {
    const payload = {
      id: id,
      bytes: cloneBytes(bytes),
      meta: meta || {},
      updatedAt: Date.now(),
    };
    memory.set(id, payload);
    const db = await openDb();
    if (!db) {
      return id;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(payload);
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function loadMedia(id) {
    if (memory.has(id)) {
      return cloneBytes(memory.get(id).bytes);
    }
    const db = await openDb();
    if (!db) {
      return null;
    }
    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(id);
      request.onsuccess = () => {
        const row = request.result;
        if (!row || !row.bytes) {
          resolve(null);
          return;
        }
        memory.set(id, row);
        resolve(cloneBytes(row.bytes));
      };
      request.onerror = () => reject(request.error);
    });
  }

  async function hasMedia(id) {
    if (memory.has(id)) {
      return true;
    }
    const bytes = await loadMedia(id);
    return Boolean(bytes && bytes.length);
  }

  async function listMediaForEpisode(episodeKey, kind) {
    const prefix = `${String(episodeKey || "episode").replace(/[^a-zA-Z0-9:_-]+/g, "-")}:${kind}:`;
    const ids = [];
    memory.forEach((_value, key) => {
      if (key.indexOf(prefix) === 0) {
        ids.push(key);
      }
    });
    const db = await openDb();
    if (db && !ids.length) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const request = tx.objectStore(STORE_NAME).getAllKeys();
        request.onsuccess = () => {
          (request.result || []).forEach((key) => {
            if (String(key).indexOf(prefix) === 0) {
              ids.push(String(key));
            }
          });
          resolve();
        };
        request.onerror = () => reject(request.error);
      });
    }
    return ids.sort();
  }

  function saveMediaSync(id, bytes, meta) {
    memory.set(id, {
      id: id,
      bytes: cloneBytes(bytes),
      meta: meta || {},
      updatedAt: Date.now(),
    });
    return id;
  }

  function loadMediaSync(id) {
    const row = memory.get(id);
    return row ? cloneBytes(row.bytes) : null;
  }

  function resetMemoryStore() {
    memory.clear();
    dbPromise = null;
  }

  const api = {
    buildMediaId,
    saveMedia,
    loadMedia,
    hasMedia,
    listMediaForEpisode,
    saveMediaSync,
    loadMediaSync,
    resetMemoryStore,
    toUint8Array,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcSpeakerMediaStore = api;
}(typeof window !== "undefined" ? window : globalThis));

