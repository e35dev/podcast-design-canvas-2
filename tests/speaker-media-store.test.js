"use strict";

// Durable speaker media store suite for Podcast Design Canvas (#197).
// Proves full-length audio is offloaded out of the session record and rehydrated intact
// for EVERY track (not last-one-wins), so a resumed episode still has real polished audio.
// Run with: `node tests/speaker-media-store.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const audio = require("../app/audio-polish.js");
const store = require("../app/speaker-media-store.js");
const fixture = require("./audio-fixture.js");

const WAV_PREFIX = "data:audio/wav;base64,";
let passed = 0;
async function test(name, fn) {
  await fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function mediaEpisode() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.wav" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.wav" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Marco Vidal", fileName: "marco.wav" }),
  ];
  return setup.summarize(fixture.attachMediaToDraft(draft));
}

(async () => {
  await test("put/get round-trips an audio asset through the in-memory backend", async () => {
    const id = "ep-test:out:1";
    await store.put(id, "data:audio/wav;base64,QUJD");
    assert.strictEqual(await store.get(id), "data:audio/wav;base64,QUJD");
    assert.strictEqual(await store.get("missing"), "", "missing ids resolve to empty, never throw");
  });

  await test("externalize strips heavy audio into refs without mutating the live object", async () => {
    const episode = mediaEpisode();
    const polish = audio.processPolish(audio.applyPreset(audio.createPolish(episode), "studio"));

    const before = polish.speakers[0].media;
    const result = store.externalizeAudioPolish(polish, "show:ep1");
    await result.written;

    // Original object is untouched (the UI keeps rendering from it).
    assert.strictEqual(polish.speakers[0].media, before, "live object is not mutated");
    // Lean copy carries refs, not bytes.
    assert.ok(result.lean.speakers.every((s) => s.media === "" && s.mediaRef), "speaker media moved to a ref");
    assert.ok(result.lean.tracks.every((t) => t.processedAsset === "" && t.processedAssetRef), "polished asset moved to a ref");
    const json = JSON.stringify(result.lean);
    assert.ok(json.indexOf(WAV_PREFIX) === -1, "no inline WAV bytes remain in the lean record");
  });

  await test("rehydrate restores real polished audio for EVERY track after a reload", async () => {
    const episode = mediaEpisode();
    const polished = audio.summarizePolish(audio.processPolish(audio.applyPreset(audio.createPolish(episode), "studio")));
    assert.strictEqual(audio.hasCompletePolishedTracks(polished), true);

    // Offload, simulate a reload by serializing only the lean record, then rehydrate.
    const ext = store.externalizeAudioPolish(polished, "show:ep2");
    await ext.written;
    const leanReloaded = JSON.parse(JSON.stringify(ext.lean));
    assert.ok(JSON.stringify(leanReloaded).indexOf(WAV_PREFIX) === -1, "the persisted record holds no audio bytes");
    const restored = await store.rehydrateAudioPolish(leanReloaded, "show:ep2");

    assert.strictEqual(restored.tracks.length, episode.speakerCount);
    assert.strictEqual(audio.hasCompletePolishedTracks(restored), true, "still publish-ready after reload");
    restored.tracks.forEach((track, index) => {
      assert.ok(track.processedAsset.indexOf(WAV_PREFIX) === 0, `track ${index} restored its real WAV`);
      assert.strictEqual(track.processedAsset, polished.tracks[index].processedAsset, "exact bytes restored");
      assert.doesNotThrow(() => audio.decodeWav(Buffer.from(track.processedAsset.slice(WAV_PREFIX.length), "base64")));
    });
    const uris = restored.tracks.map((t) => t.processedAsset);
    assert.strictEqual(new Set(uris).size, uris.length, "every track keeps its own distinct asset (no last-one-wins)");
  });

  console.log(`\nspeaker media store: ${passed} assertions passed`);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
