"use strict";

// Committed imported speaker track bytes for sandbox Riverside/upload handoff (#197).
// These are static fixture files — not synthesized at Apply or ingest time.
(function (global) {
  const FIXTURE_FILES = {
    Host: "host.wav",
    "Guest 1": "guest-1.wav",
    "Guest 2": "guest-2.wav",
    "Guest 3": "guest-3.wav",
    "Guest 4": "guest-4.wav",
  };

  function fixtureFileForRole(role) {
    const bucket = String(role || "Host").trim();
    if (FIXTURE_FILES[bucket]) {
      return FIXTURE_FILES[bucket];
    }
    const slug = bucket.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "speaker";
    return `${slug}.wav`;
  }

  function fixturePathForRole(role) {
    return `fixtures/speaker-tracks/${fixtureFileForRole(role)}`;
  }

  function importedFileNameForRole(role, mode) {
    const bucket = String(role || "speaker");
    if (mode === "riverside") {
      return `${bucket.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-riverside-sync.wav`;
    }
    const mp4Name = {
      Host: "host-synced.mp4",
      "Guest 1": "guest-1-synced.mp4",
      "Guest 2": "guest-2-synced.mp4",
      "Guest 3": "guest-3-synced.mp4",
      "Guest 4": "guest-4-synced.mp4",
    }[bucket];
    return (mp4Name || `${bucket.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-synced.mp4`).replace(/\.mp4$/i, ".wav");
  }

  async function loadFixtureBytes(role) {
    const path = fixturePathForRole(role);
    if (typeof fetch !== "undefined") {
      const response = await fetch(path);
      if (!response.ok) {
        throw new Error(`Imported speaker fixture missing for ${role || "speaker"}.`);
      }
      return new Uint8Array(await response.arrayBuffer());
    }
    if (typeof require === "function") {
      const fs = require("fs");
      const nodePath = require("path");
      const file = nodePath.join(__dirname, "..", path.replace(/\//g, nodePath.sep));
      if (!fs.existsSync(file)) {
        throw new Error(`Imported speaker fixture missing for ${role || "speaker"}.`);
      }
      return new Uint8Array(fs.readFileSync(file));
    }
    throw new Error("Imported speaker fixtures are unavailable in this environment.");
  }

  function loadFixtureBytesSync(role) {
    if (typeof require !== "function") {
      throw new Error("Synchronous fixture loading requires Node.");
    }
    const fs = require("fs");
    const nodePath = require("path");
    const path = fixturePathForRole(role);
    const file = nodePath.join(__dirname, "..", path.replace(/\//g, nodePath.sep));
    if (!fs.existsSync(file)) {
      throw new Error(`Imported speaker fixture missing for ${role || "speaker"}.`);
    }
    return new Uint8Array(fs.readFileSync(file));
  }

  const api = {
    FIXTURE_FILES,
    fixtureFileForRole,
    fixturePathForRole,
    importedFileNameForRole,
    loadFixtureBytes,
    loadFixtureBytesSync,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcImportedSpeakerFixtures = api;
}(typeof window !== "undefined" ? window : globalThis));
