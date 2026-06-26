"use strict";

// Durable polished audio asset storage for Podcast Design Canvas (#197).
// Persists treated WAV bytes per episode track in IndexedDB (browser) with an
// in-memory fallback for node tests.
(function (global) {
  const DB_NAME = "pdc-audio-media";
  const DB_VERSION = 1;
  const STORE_NAME = "assets";
  const memoryStore = new Map();

  function assetKey(showId, episodeId, assetId) {
    return `${showId || "show"}:${episodeId || "episode"}:${assetId || "asset"}`;
  }

  function listKey(showId, episodeId) {
    return `${showId || "show"}:${episodeId || "episode"}`;
  }

  function clone(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function openDatabase() {
    if (typeof indexedDB === "undefined") {
      return Promise.resolve(null);
    }
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: "key" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function saveAsset(record) {
    const key = assetKey(record.showId, record.episodeId, record.id);
    const payload = {
      key: key,
      listKey: listKey(record.showId, record.episodeId),
      record: clone(record),
      wavBytes: record.wavBytes instanceof Uint8Array ? record.wavBytes : new Uint8Array(record.wavBytes || []),
    };
    memoryStore.set(key, payload);
    if (typeof indexedDB === "undefined") {
      return Promise.resolve(payload.record);
    }
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      if (!db) {
        resolve(payload.record);
        return;
      }
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(payload);
      tx.oncomplete = () => resolve(payload.record);
      tx.onerror = () => reject(tx.error);
    }));
  }

  function listAssets(showId, episodeId) {
    const prefix = listKey(showId, episodeId);
    const fromMemory = Array.from(memoryStore.values())
      .filter((entry) => entry.listKey === prefix)
      .map((entry) => clone(entry.record));
    if (typeof indexedDB === "undefined") {
      return Promise.resolve(fromMemory);
    }
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      if (!db) {
        resolve(fromMemory);
        return;
      }
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const merged = {};
        fromMemory.forEach((record) => {
          merged[record.id] = record;
        });
        (request.result || []).forEach((entry) => {
          if (entry.listKey === prefix && entry.record) {
            merged[entry.record.id] = clone(entry.record);
          }
        });
        resolve(Object.values(merged).sort((a, b) => (a.trackIndex || 0) - (b.trackIndex || 0)));
      };
      request.onerror = () => reject(request.error);
    }));
  }

  function clearEpisodeAssets(showId, episodeId) {
    const prefix = listKey(showId, episodeId);
    Array.from(memoryStore.keys()).forEach((key) => {
      const entry = memoryStore.get(key);
      if (entry && entry.listKey === prefix) {
        memoryStore.delete(key);
      }
    });
    if (typeof indexedDB === "undefined") {
      return Promise.resolve(true);
    }
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      if (!db) {
        resolve(true);
        return;
      }
      const tx = db.transaction(STORE_NAME, "readwrite");
      const store = tx.objectStore(STORE_NAME);
      const request = store.getAll();
      request.onsuccess = () => {
        (request.result || []).forEach((entry) => {
          if (entry.listKey === prefix) {
            store.delete(entry.key);
          }
        });
      };
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => reject(tx.error);
    }));
  }

  function __resetMemoryStoreForTests() {
    memoryStore.clear();
  }

  const api = {
    saveAsset,
    listAssets,
    clearEpisodeAssets,
    __resetMemoryStoreForTests,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioMediaStore = api;
}(typeof window !== "undefined" ? window : globalThis));
