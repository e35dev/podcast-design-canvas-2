"use strict";

// Audio polish processing smoke suite for Podcast Design Canvas (#197).
// Run with: `node tests/audio-polish-processing.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");
const store = require("../app/speaker-media-store.js");

const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");
const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function uploadDraftWithMediaIds() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.wav", sourceMediaId: "show-1:ep-1:source:1" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.wav", sourceMediaId: "show-1:ep-1:source:2" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Marco Vidal", fileName: "marco.wav", sourceMediaId: "show-1:ep-1:source:3" }),
  ];
  return draft;
}

function seedImportedSources(episodeKey, draft) {
  store.resetMemoryStore();
  draft.speakers.forEach((speaker, index) => {
    const wav = audio.buildImportedSpeakerSourceWav({
      role: speaker.role,
      trackIndex: index,
      seed: `${episodeKey}:${speaker.name}`,
    });
    store.saveMediaSync(store.buildMediaId(episodeKey, "source", index + 1), wav, {
      kind: "source",
      role: speaker.role,
    });
  });
}

test("processSamples changes decoded imported speaker audio", () => {
  const source = audio.buildImportedSpeakerSourceWav({ role: "Host", trackIndex: 0, seed: "sam" });
  const decoded = audio.decodeWav(source);
  const processed = audio.processSamples(decoded.samples, audio.applyPreset(audio.createPolish({}), "studio"));
  let changed = 0;
  for (let i = 0; i < decoded.samples.length; i += 1) {
    if (Math.abs(decoded.samples[i] - processed[i]) > 0.0001) {
      changed += 1;
    }
  }
  assert.ok(changed > decoded.samples.length * 0.5, "expected most samples to change after polish");
});

test("syncProcessPolish saves polished WAV assets for every imported speaker track", () => {
  const episodeKey = "show-1:ep-1";
  const draft = uploadDraftWithMediaIds();
  seedImportedSources(episodeKey, draft);
  const summary = setup.summarize(draft);
  let polish = audio.createPolish(summary);

  polish = audio.syncProcessPolish(polish, {
    loadSourceMedia: (mediaId) => store.loadMediaSync(mediaId),
    savePolishedMedia: (trackIndex, bytes) => {
      const mediaId = store.buildMediaId(episodeKey, "polished", trackIndex);
      store.saveMediaSync(mediaId, bytes, { kind: "polished" });
      return mediaId;
    },
  });

  assert.strictEqual(audio.hasCompletePolishedTracks(polish), true);
  polish.speakers.forEach((track, index) => {
    assert.strictEqual(track.status, audio.TRACK_STATUS.COMPLETE);
    assert.ok(track.polishedMediaId);
    assert.ok(track.polishedFileName.endsWith("-polished.wav"));
    const polishedBytes = store.loadMediaSync(store.buildMediaId(episodeKey, "polished", index + 1));
    assert.ok(polishedBytes && polishedBytes.length > 44);
    const sourceBytes = store.loadMediaSync(track.sourceMediaId);
    const sourceDecoded = audio.decodeWav(sourceBytes);
    const polishedDecoded = audio.decodeWav(polishedBytes);
    assert.notDeepStrictEqual(Array.from(sourceDecoded.samples.slice(0, 128)), Array.from(polishedDecoded.samples.slice(0, 128)));
  });

  const applied = audio.summarizePolish(polish);
  assert.strictEqual(applied.allTracksComplete, true);
  assert.strictEqual(applied.polishedTrackCount, 3);
  assert.match(applied.assetLine, /3 polished WAV assets saved/);
  assert.strictEqual(audio.buildReviewSummary(summary, applied, {}).readyForExport, true);
});

test("ACCEPTANCE: imported source bytes are processed into durable polished outputs", () => {
  const episodeKey = "show-2:ep-2";
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.wav", sourceMediaId: `${episodeKey}:source:1` }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.wav", sourceMediaId: `${episodeKey}:source:2` }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Marco Vidal", fileName: "marco.wav", sourceMediaId: `${episodeKey}:source:3` }),
  ];
  seedImportedSources(episodeKey, draft);
  const summary = setup.summarize(draft);
  const polished = audio.syncProcessPolish(audio.createPolish(summary), {
    loadSourceMedia: (mediaId) => store.loadMediaSync(mediaId),
    savePolishedMedia: (trackIndex, bytes) => store.saveMediaSync(store.buildMediaId(episodeKey, "polished", trackIndex), bytes, { kind: "polished" }),
  });
  assert.ok(store.loadMediaSync(store.buildMediaId(episodeKey, "polished", 1)));
  assert.ok(store.loadMediaSync(store.buildMediaId(episodeKey, "polished", 2)));
  assert.ok(store.loadMediaSync(store.buildMediaId(episodeKey, "polished", 3)));
  assert.strictEqual(audio.summarizePolish(polished).usesPolishedTracks, true);
});

test("ACCEPTANCE: UI wires Apply to async processing with per-track status and asset line", () => {
  assert.ok(ui.includes("applyAudioPolishAndStay"));
  assert.ok(ui.includes("openAudioPolishStep"));
  assert.ok(ui.includes("audio-apply-btn"));
  assert.ok(ui.includes('id: "workspace-primary-next"'));
  assert.ok(ui.includes("workspace-handoff-layout"));
  assert.ok(ui.includes("workspace-handoff-next"));
  assert.ok(ui.includes("audio-track-status-"));
  assert.ok(ui.includes("TRACK_STATUS.COMPLETE"));
  assert.ok(ui.includes("audio-polish-asset-line"));
  assert.ok(ui.includes("ingestEpisodeSourceMedia"));
  assert.ok(styles.includes(".audio-track-status-complete"));
  assert.ok(styles.includes(".audio-track-status-pending"));
  assert.strictEqual(audio.trackStatusLabel({ status: audio.TRACK_STATUS.PENDING }), "Waiting to process");
  assert.match(audio.trackStatusLabel({ status: audio.TRACK_STATUS.COMPLETE, polishedFileName: "host-polished.wav" }), /Saved/);
});

test("ACCEPTANCE: audio polish handoff mirrors workspace primary-next probe pattern (#154)", () => {
  assert.ok(ui.includes("audio-step guided-workspace"));
  assert.ok(ui.includes("workspace-handoff-primary-btn"));
  assert.ok(ui.includes("Apply audio & continue"));
});

console.log(`\naudio polish processing: ${passed} assertions passed`);

