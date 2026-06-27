"use strict";

// Durable polished audio asset storage for Podcast Design Canvas (#197).
// Persists treated WAV bytes per episode track in memory, localStorage, and IndexedDB.
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

  function polishedLocalStorageKey(showId, episodeId) {
    return `pdc-polished-audio:${listKey(showId, episodeId)}`;
  }

  function bytesToBase64(bytes) {
    const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
    let binary = "";
    const chunkSize = 0x8000;
    for (let i = 0; i < view.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, view.subarray(i, i + chunkSize));
    }
    if (typeof btoa === "function") {
      return btoa(binary);
    }
    return Buffer.from(view).toString("base64");
  }

  function base64ToBytes(base64) {
    if (typeof atob === "function") {
      const binary = atob(base64 || "");
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      return bytes;
    }
    return new Uint8Array(Buffer.from(base64 || "", "base64"));
  }

  function saveAssetsToLocalStorage(showId, episodeId, assets) {
    if (typeof localStorage === "undefined") {
      return;
    }
    try {
      const payload = (Array.isArray(assets) ? assets : []).map((asset) => ({
        id: asset.id,
        showId: asset.showId,
        episodeId: asset.episodeId,
        trackIndex: asset.trackIndex,
        role: asset.role,
        name: asset.name,
        sourceLabel: asset.sourceLabel,
        rawSourceId: asset.rawSourceId,
        polishedFileName: asset.polishedFileName,
        presetId: asset.presetId,
        presetName: asset.presetName,
        byteLength: asset.byteLength,
        checksum: asset.checksum,
        processedAt: asset.processedAt,
        wavBase64: asset.wavBytes ? bytesToBase64(asset.wavBytes) : "",
      }));
      localStorage.setItem(polishedLocalStorageKey(showId, episodeId), JSON.stringify({
        assets: payload,
        updatedAt: Date.now(),
      }));
    } catch (err) {
      /* ignore quota errors */
    }
  }

  function listAssetsFromLocalStorage(showId, episodeId) {
    if (typeof localStorage === "undefined") {
      return [];
    }
    try {
      const raw = localStorage.getItem(polishedLocalStorageKey(showId, episodeId));
      if (!raw) {
        return [];
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.assets)) {
        return [];
      }
      return parsed.assets.map((asset) => ({
        id: asset.id,
        showId: asset.showId,
        episodeId: asset.episodeId,
        trackIndex: asset.trackIndex,
        role: asset.role,
        name: asset.name,
        sourceLabel: asset.sourceLabel,
        rawSourceId: asset.rawSourceId,
        polishedFileName: asset.polishedFileName,
        presetId: asset.presetId,
        presetName: asset.presetName,
        byteLength: asset.byteLength,
        checksum: asset.checksum,
        processedAt: asset.processedAt,
        wavBytes: asset.wavBase64 ? base64ToBytes(asset.wavBase64) : new Uint8Array(0),
      }));
    } catch (err) {
      return [];
    }
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
      record: Object.assign({}, record, {
        wavBytes: undefined,
      }),
      wavBytes: record.wavBytes instanceof Uint8Array ? record.wavBytes : new Uint8Array(record.wavBytes || []),
    };
    payload.record = clone(payload.record);
    memoryStore.set(key, payload);
    const merged = listAssetsSync(record.showId, record.episodeId);
    saveAssetsToLocalStorage(record.showId, record.episodeId, merged.map((asset) => {
      const stored = memoryStore.get(assetKey(record.showId, record.episodeId, asset.id));
      return Object.assign({}, asset, {
        wavBytes: stored ? stored.wavBytes : new Uint8Array(0),
      });
    }));
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

  function saveAssetsSync(showId, episodeId, assets) {
    (Array.isArray(assets) ? assets : []).forEach((asset) => {
      const key = assetKey(showId, episodeId, asset.id);
      const payload = {
        key: key,
        listKey: listKey(showId, episodeId),
        record: clone(asset),
        wavBytes: asset.wavBytes instanceof Uint8Array ? asset.wavBytes : new Uint8Array(asset.wavBytes || []),
      };
      memoryStore.set(key, payload);
    });
    saveAssetsToLocalStorage(showId, episodeId, assets);
  }

  function listAssetsSync(showId, episodeId) {
    const prefix = listKey(showId, episodeId);
    const merged = {};
    Array.from(memoryStore.values()).forEach((entry) => {
      if (entry.listKey === prefix && entry.record) {
        merged[entry.record.id] = clone(entry.record);
      }
    });
    listAssetsFromLocalStorage(showId, episodeId).forEach((record) => {
      merged[record.id] = record;
    });
    return Object.values(merged).sort((a, b) => (a.trackIndex || 0) - (b.trackIndex || 0));
  }

  function listAssets(showId, episodeId) {
    const sync = listAssetsSync(showId, episodeId);
    if (typeof indexedDB === "undefined") {
      return Promise.resolve(sync);
    }
    return openDatabase().then((db) => new Promise((resolve, reject) => {
      if (!db) {
        resolve(sync);
        return;
      }
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).getAll();
      request.onsuccess = () => {
        const merged = {};
        sync.forEach((record) => {
          merged[record.id] = record;
        });
        (request.result || []).forEach((entry) => {
          if (entry.listKey === listKey(showId, episodeId) && entry.record) {
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
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.removeItem(polishedLocalStorageKey(showId, episodeId));
      } catch (err) {
        /* ignore */
      }
    }
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
    saveAssetsSync,
    listAssets,
    listAssetsSync,
    clearEpisodeAssets,
    __resetMemoryStoreForTests,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcAudioMediaStore = api;
}(typeof window !== "undefined" ? window : globalThis));
