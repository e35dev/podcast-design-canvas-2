"use strict";

// Riverside session track discovery for Podcast Design Canvas (#225).
//
// When a creator pastes a Riverside recording link, this module builds a deterministic
// sandbox session preview (tracks, labels, durations, sync status) and maps discovered
// tracks onto Host / Guest speaker buckets. DOM-free so the import step and tests share
// one source of truth.
(function (global) {
  function trim(value) {
    return typeof value === "string" ? value.trim() : "";
  }

  function setupApi() {
    if (typeof module !== "undefined" && module.exports && typeof require === "function") {
      return require("./episode-setup.js");
    }
    const g = typeof window !== "undefined" ? window : globalThis;
    return g.PdcEpisodeSetup;
  }

  function titleCase(value) {
    return trim(value)
      .split(/[\s-_]+/)
      .filter(Boolean)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
      .join(" ");
  }

  function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
  }

  function formatDuration(totalSeconds) {
    const safe = Math.max(0, Math.floor(totalSeconds || 0));
    const hours = Math.floor(safe / 3600);
    const minutes = Math.floor((safe % 3600) / 60);
    const seconds = safe % 60;
    if (hours > 0) {
      return `${hours}:${pad2(minutes)}:${pad2(seconds)}`;
    }
    return `${minutes}:${pad2(seconds)}`;
  }

  function sessionSlugFromLink(link) {
    const text = trim(link);
    if (!text) {
      return "";
    }
    try {
      const path = new URL(text).pathname;
      const match = path.match(/\/studio\/([^/?#]+)/i);
      if (match) {
        return trim(match[1]);
      }
    } catch (err) {
      /* fall through */
    }
    return "session";
  }

  function isRiversideHost(link) {
    const text = trim(link);
    if (!text) {
      return false;
    }
    try {
      const host = new URL(text).hostname.replace(/^www\./i, "");
      return host === "riverside.fm" || host.endsWith(".riverside.fm");
    } catch (err) {
      return false;
    }
  }

  function isRiversideUrl(link) {
    const ES = setupApi();
    if (!ES || !ES.isLikelyUrl(link)) {
      return false;
    }
    return isRiversideHost(link);
  }

  function durationSeed(slug, index) {
    const seed = trim(slug) || "session";
    let hash = 0;
    for (let i = 0; i < seed.length; i += 1) {
      hash = (hash * 31 + seed.charCodeAt(i) + index * 17) % 100000;
    }
    return 2400 + (hash % 2100);
  }

  function buildTrack(slug, index) {
    const ES = setupApi();
    const role = ES ? ES.defaultSpeakerRoleForIndex(index) : (index === 0 ? "Host" : `Guest ${index}`);
    const sessionTitle = titleCase(slug) || "Recording";
    const participantName = role;
    const label = `${sessionTitle} — ${role} track`;
    const durationSeconds = durationSeed(slug, index);
    return {
      id: `track-${index + 1}`,
      role,
      label,
      participantName,
      durationSeconds,
      durationLabel: formatDuration(durationSeconds),
      synced: true,
    };
  }

  function buildSessionFromLink(link) {
    const slug = sessionSlugFromLink(link);
    const sessionTitle = titleCase(slug) || "Riverside session";
    const tracks = [buildTrack(slug, 0), buildTrack(slug, 1), buildTrack(slug, 2)];
    return {
      link: trim(link),
      slug,
      sessionTitle,
      trackCount: tracks.length,
      tracks,
    };
  }

  function validateDiscoverInput(link) {
    const ES = setupApi();
    const text = trim(link);
    if (!text) {
      return { ok: false, error: "Add your Riverside recording link before discovering tracks." };
    }
    if (!ES || !ES.isLikelyUrl(text)) {
      return {
        ok: false,
        error: "That Riverside link doesn't look right — paste the full link starting with http.",
      };
    }
    if (!isRiversideHost(text)) {
      return {
        ok: false,
        error: "That link doesn't look like a Riverside session — paste a riverside.fm studio link.",
      };
    }
    return { ok: true };
  }

  function discoverSession(link) {
    const check = validateDiscoverInput(link);
    if (!check.ok) {
      return { ok: false, error: check.error };
    }
    return { ok: true, session: buildSessionFromLink(link) };
  }

  function applyTracksToDraft(draft, session) {
    const ES = setupApi();
    const data = draft && typeof draft === "object" ? draft : (ES ? ES.createDraft() : { speakers: [] });
    const tracks = session && Array.isArray(session.tracks) ? session.tracks : [];
    if (!tracks.length) {
      return data;
    }

    data.sourceMode = "riverside";
    if (session.link) {
      data.riversideLink = trim(session.link);
    }

    const speakers = [];
    tracks.forEach((track, index) => {
      const existing = Array.isArray(data.speakers) ? data.speakers[index] : null;
      const role = track.role || (ES ? ES.defaultSpeakerRoleForIndex(index) : "Host");
      const speaker = existing && typeof existing === "object"
        ? Object.assign({}, existing)
        : (ES ? ES.createSpeaker(role) : { name: "", role, fileName: "", fileSize: 0, trackLabel: "", social: {} });
      speaker.role = role;
      speaker.trackLabel = trim(track.label) || trim(track.participantName);
      if (!trim(speaker.name) && trim(track.participantName)) {
        speaker.name = trim(track.participantName);
      }
      speakers.push(speaker);
    });

    data.speakers = speakers;
    return data;
  }

  function summarizeSession(session) {
    const data = session && typeof session === "object" ? session : {};
    const tracks = Array.isArray(data.tracks) ? data.tracks : [];
    return {
      sessionTitle: trim(data.sessionTitle) || "Riverside session",
      trackCount: tracks.length,
      syncedCount: tracks.filter((track) => track.synced).length,
      reviewLine: tracks.length
        ? `${tracks.length} Riverside track${tracks.length === 1 ? "" : "s"} discovered · ${tracks.filter((t) => t.synced).length} synced`
        : "No Riverside tracks discovered yet",
    };
  }

  const api = {
    sessionSlugFromLink,
    isRiversideUrl,
    validateDiscoverInput,
    discoverSession,
    buildSessionFromLink,
    applyTracksToDraft,
    summarizeSession,
    formatDuration,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcRiversideSession = api;
}(typeof window !== "undefined" ? window : globalThis));
