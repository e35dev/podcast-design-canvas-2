"use strict";

// Durable speaker media store for Podcast Design Canvas (#197).
//
// Full-length imported speaker tracks and their polished outputs are real audio files —
// far too large to keep inline in the episode session's localStorage record (a single
// long-form track is hundreds of megabytes). This module stores those WAV data URIs in
// IndexedDB in the browser (which handles hour-plus episodes) and in an in-memory map
// everywhere else (Node tests, SSR), behind one small async API. The episode session
// then persists only lightweight references, and rehydrates the real audio on reload.
//
// DOM-free and dependency-free so the polish UI and Node tests share one code path.
(function (global) {
  const DB_NAME = "pdc-speaker-media";
  const DB_VERSION = 1;
  const STORE_NAME = "assets";
  const WAV_DATA_URI_PREFIX = "data:audio/wav;base64,";

  // In-memory fallback used whenever IndexedDB is unavailable (Node, tests).
  const memory = new Map();

  function hasIndexedDb() {
    try {
      return typeof indexedDB !== "undefined" && !!indexedDB;
    } catch (err) {
      return false;
    }
  }

  function openDb() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error("IndexedDB open failed"));
    });
  }

  function put(id, value) {
    const key = String(id);
    const text = typeof value === "string" ? value : "";
    if (!hasIndexedDb()) {
      memory.set(key, text);
      return Promise.resolve(key);
    }
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).put(text, key);
      tx.oncomplete = () => { db.close(); resolve(key); };
      tx.onerror = () => { db.close(); reject(tx.error || new Error("IndexedDB put failed")); };
    })).catch((err) => {
      // If IndexedDB fails at runtime, fall back to memory so the session still works.
      memory.set(key, text);
      return key;
    });
  }

  function get(id) {
    const key = String(id);
    if (!hasIndexedDb()) {
      return Promise.resolve(memory.has(key) ? memory.get(key) : "");
    }
    return openDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, "readonly");
      const request = tx.objectStore(STORE_NAME).get(key);
      request.onsuccess = () => { db.close(); resolve(typeof request.result === "string" ? request.result : ""); };
      request.onerror = () => { db.close(); reject(request.error || new Error("IndexedDB get failed")); };
    })).catch(() => (memory.has(key) ? memory.get(key) : ""));
  }

  function remove(id) {
    const key = String(id);
    memory.delete(key);
    if (!hasIndexedDb()) {
      return Promise.resolve();
    }
    return openDb().then((db) => new Promise((resolve) => {
      const tx = db.transaction(STORE_NAME, "readwrite");
      tx.objectStore(STORE_NAME).delete(key);
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => { db.close(); resolve(); };
    })).catch(() => undefined);
  }

  function isWavDataUri(value) {
    return typeof value === "string" && value.indexOf(WAV_DATA_URI_PREFIX) === 0;
  }

  function srcKey(prefix, trackIndex) {
    return `${prefix || "episode"}:src:${trackIndex}`;
  }

  function outKey(prefix, trackIndex) {
    return `${prefix || "episode"}:out:${trackIndex}`;
  }

  // Shallow-copy an audioPolish-shaped object together with fresh speaker/track element
  // copies, so we can strip the heavy audio fields without mutating the live in-session
  // object the UI is still rendering from.
  function copyShape(obj) {
    const copy = Object.assign({}, obj);
    if (Array.isArray(obj.speakers)) {
      copy.speakers = obj.speakers.map((speaker) => Object.assign({}, speaker));
    }
    if (Array.isArray(obj.tracks)) {
      copy.tracks = obj.tracks.map((track) => Object.assign({}, track));
    }
    return copy;
  }

  // Move the heavy audio (each speaker's captured `media` and each track's
  // `processedAsset`) out of an audioPolish-shaped object into the store, returning a
  // lean copy that carries only reference ids. The store writes run in the background;
  // callers that need to be sure the bytes are durable can await `.written`.
  function externalizeAudioPolish(audioPolish, prefix) {
    if (!audioPolish || typeof audioPolish !== "object") {
      return { lean: audioPolish, written: Promise.resolve() };
    }
    const lean = copyShape(audioPolish);
    const writes = [];
    (lean.speakers || []).forEach((speaker, index) => {
      if (isWavDataUri(speaker.media)) {
        const id = srcKey(prefix, speaker.trackIndex || index + 1);
        writes.push(put(id, speaker.media));
        speaker.mediaRef = id;
        speaker.media = "";
      }
    });
    (lean.tracks || []).forEach((track, index) => {
      if (isWavDataUri(track.processedAsset)) {
        const id = outKey(prefix, track.trackIndex || index + 1);
        writes.push(put(id, track.processedAsset));
        track.processedAssetRef = id;
        track.processedAsset = "";
      }
    });
    return { lean: lean, written: Promise.all(writes) };
  }

  // Restore the heavy audio onto a lean audioPolish-shaped object by fetching each
  // referenced asset back from the store. Tolerant: a missing reference simply leaves
  // that field empty (the readiness gate then treats the track as incomplete).
  function rehydrateAudioPolish(lean, prefix) {
    if (!lean || typeof lean !== "object") {
      return Promise.resolve(lean);
    }
    const full = copyShape(lean);
    const reads = [];
    (full.speakers || []).forEach((speaker) => {
      if (!isWavDataUri(speaker.media) && speaker.mediaRef) {
        reads.push(get(speaker.mediaRef).then((value) => {
          speaker.media = value || "";
          delete speaker.mediaRef;
        }));
      }
    });
    (full.tracks || []).forEach((track) => {
      if (!isWavDataUri(track.processedAsset) && track.processedAssetRef) {
        reads.push(get(track.processedAssetRef).then((value) => {
          track.processedAsset = value || "";
          delete track.processedAssetRef;
        }));
      }
    });
    return Promise.all(reads).then(() => full);
  }

  const api = {
    put,
    get,
    remove,
    isPersistent: hasIndexedDb,
    externalizeAudioPolish,
    rehydrateAudioPolish,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcSpeakerMediaStore = api;
}(typeof window !== "undefined" ? window : globalThis));
