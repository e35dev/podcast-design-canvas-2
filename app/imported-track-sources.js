"use strict";

// Imported speaker track source registry for Podcast Design Canvas (#197).
//
// Captures raw audio samples for each imported speaker track at episode setup/ingest
// so audio polish transforms persisted imported media — not ad-hoc synthesized samples.
(function (global) {
  const memoryStore = new Map();

  function episodeKey(showId, episodeId) {
    return `${showId || "show"}:${episodeId || "episode"}`;
  }

  function storageKey(showId, episodeId) {
    return `pdc-imported-sources:${episodeKey(showId, episodeId)}`;
  }

  function cloneEpisodeSources(payload) {
    if (!payload) {
      return { entries: [] };
    }
    return {
      showId: payload.showId,
      episodeId: payload.episodeId,
      updatedAt: payload.updatedAt,
      entries: (payload.entries || []).map((entry) => Object.assign({}, normalizeEntry(entry), {
        sampleRate: entry.sampleRate || 44100,
        sampleLength: entry.sampleLength || 0,
        checksum: entry.checksum || "",
        samples: entry.samples instanceof Float32Array
          ? entry.samples
          : new Float32Array(entry.samples || []),
      })),
    };
  }

  function normalizeEntry(entry) {
    const item = entry || {};
    return {
      rawSourceId: item.rawSourceId || "",
      trackIndex: item.trackIndex || 0,
      role: item.role || "",
      name: item.name || "",
      sourceLabel: item.sourceLabel || "",
      sampleRate: item.sampleRate || 44100,
      sampleLength: item.sampleLength || 0,
      checksum: item.checksum || "",
    };
  }

  function checksumSamples(samples) {
    const view = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
    let sum = 0;
    for (let i = 0; i < view.length; i += 128) {
      sum = (sum + Math.round(view[i] * 100000)) % 65521;
    }
    return `raw-${sum}-${view.length}`;
  }

  function saveEpisodeSources(showId, episodeId, entries) {
    const key = episodeKey(showId, episodeId);
    const payload = {
      showId: showId,
      episodeId: episodeId,
      entries: (Array.isArray(entries) ? entries : []).map((entry) => {
        const normalized = normalizeEntry(entry);
        const samples = entry.samples instanceof Float32Array
          ? entry.samples
          : new Float32Array(entry.samples || []);
        return Object.assign({}, normalized, {
          sampleRate: entry.sampleRate || 44100,
          sampleLength: samples.length,
          checksum: checksumSamples(samples),
          samples: samples,
        });
      }),
      updatedAt: Date.now(),
    };
    memoryStore.set(key, payload);
    if (typeof localStorage !== "undefined") {
      try {
        const serializable = {
          showId: showId,
          episodeId: episodeId,
          updatedAt: payload.updatedAt,
          entries: payload.entries.map((entry) => ({
            rawSourceId: entry.rawSourceId,
            trackIndex: entry.trackIndex,
            role: entry.role,
            name: entry.name,
            sourceLabel: entry.sourceLabel,
            sampleRate: entry.sampleRate,
            sampleLength: entry.sampleLength,
            checksum: entry.checksum,
            samples: Array.from(entry.samples),
          })),
        };
        localStorage.setItem(storageKey(showId, episodeId), JSON.stringify(serializable));
      } catch (err) {
        /* ignore quota errors */
      }
    }
    return payload;
  }

  function loadEpisodeSources(showId, episodeId) {
    const key = episodeKey(showId, episodeId);
    const cached = memoryStore.get(key);
    if (cached) {
      return cloneEpisodeSources(cached);
    }
    if (typeof localStorage === "undefined") {
      return { entries: [] };
    }
    try {
      const raw = localStorage.getItem(storageKey(showId, episodeId));
      if (!raw) {
        return { entries: [] };
      }
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.entries)) {
        return { entries: [] };
      }
      const payload = {
        showId: parsed.showId,
        episodeId: parsed.episodeId,
        updatedAt: parsed.updatedAt,
        entries: parsed.entries.map((entry) => Object.assign({}, normalizeEntry(entry), {
          sampleRate: entry.sampleRate || 44100,
          sampleLength: entry.sampleLength || 0,
          checksum: entry.checksum || "",
          samples: new Float32Array(Array.isArray(entry.samples) ? entry.samples : []),
        })),
      };
      memoryStore.set(key, payload);
      return payload;
    } catch (err) {
      return { entries: [] };
    }
  }

  function getSource(showId, episodeId, rawSourceId) {
    const store = loadEpisodeSources(showId, episodeId);
    const match = (store.entries || []).find((entry) => entry.rawSourceId === rawSourceId);
    if (!match || !match.samples || !match.samples.length) {
      return null;
    }
    return {
      samples: match.samples,
      sampleRate: match.sampleRate || 44100,
      checksum: match.checksum,
      rawSourceId: match.rawSourceId,
    };
  }

  function buildResolver(showId, episodeId) {
    return function resolveImportedSource(track) {
      const rawSourceId = track && track.rawSourceId ? track.rawSourceId : "";
      if (!rawSourceId) {
        return null;
      }
      return getSource(showId, episodeId, rawSourceId);
    };
  }

  function __resetMemoryStoreForTests() {
    memoryStore.clear();
  }

  const api = {
    saveEpisodeSources,
    loadEpisodeSources,
    getSource,
    buildResolver,
    checksumSamples,
    __resetMemoryStoreForTests,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcImportedTrackSources = api;
}(typeof window !== "undefined" ? window : globalThis));
