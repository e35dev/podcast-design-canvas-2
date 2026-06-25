"use strict";

// Audio polish smoke suite for Podcast Design Canvas (#15).
// Guards the documented acceptance: clear quality presets (Natural, Clean, Studio), simple
// noise/leveling/clarity/enhancement controls, per-speaker indicators tied to the imported
// tracks, and a saved treatment summary for the review/export path.
// Run with: `node tests/audio-polish.test.js`.

const assert = require("assert");
const audio = require("../app/audio-polish.js");
const setup = require("../app/episode-setup.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function completeUploadEpisode() {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "upload";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), { name: "Sam Rivera", fileName: "sam.mp4" }),
    Object.assign(setup.createSpeaker("Guest 1"), { name: "Dana Kim", fileName: "dana.mp4" }),
    Object.assign(setup.createSpeaker("Guest 2"), { name: "Marco Vidal", fileName: "marco.mp4" }),
  ];
  return setup.summarize(draft);
}

test("offers Natural, Clean, and Studio quality presets", () => {
  const ids = audio.AUDIO_PRESETS.map((p) => p.id);
  assert.ok(audio.AUDIO_PRESETS.length >= 3, "need at least three presets");
  assert.deepStrictEqual(ids, ["natural", "clean", "studio"]);
  audio.AUDIO_PRESETS.forEach((preset) => {
    assert.ok(preset.name && preset.tagline, `${preset.id} is described`);
    audio.controlKeys().forEach((key) => {
      assert.ok(audio.getLevel(preset.controls[key]).id === preset.controls[key], `${preset.id}.${key} is a real level`);
    });
  });
});

test("the four controls are the creator-facing audio goals", () => {
  const keys = audio.controlKeys();
  assert.deepStrictEqual(keys, ["noise", "leveling", "clarity", "enhancement"]);
  keys.forEach((key) => {
    const control = audio.getControl(key);
    assert.ok(control.label && control.hint, `${key} has a label and hint`);
  });
});

test("presets get more intense from Natural to Studio", () => {
  const total = (preset) =>
    audio.controlKeys().reduce((sum, key) => sum + audio.getLevel(preset.controls[key]).value, 0);
  const natural = total(audio.getPreset("natural"));
  const clean = total(audio.getPreset("clean"));
  const studio = total(audio.getPreset("studio"));
  assert.ok(natural < clean && clean < studio, "Natural < Clean < Studio in total processing");
});

test("a fresh selection defaults to Natural with its control levels copied in", () => {
  const selection = audio.createSelection();
  assert.strictEqual(selection.presetId, "natural");
  assert.deepStrictEqual(selection.controls, audio.getPreset("natural").controls);
  // Mutating the selection must not bleed into the preset definition.
  selection.controls.noise = "strong";
  assert.strictEqual(audio.getPreset("natural").controls.noise, "light", "preset is not mutated");
});

test("applyPresetToSelection adopts the preset's levels as a confident reset", () => {
  let selection = audio.createSelection();
  selection = audio.setControl(selection, "noise", "strong");
  selection = audio.applyPresetToSelection(selection, "studio");
  assert.strictEqual(selection.presetId, "studio");
  assert.deepStrictEqual(selection.controls, audio.getPreset("studio").controls);
  assert.strictEqual(audio.matchPreset(selection.controls).id, "studio");
});

test("getPreset and getLevel fall back to safe defaults for unknown ids", () => {
  assert.strictEqual(audio.getPreset("nope").id, "natural");
  assert.strictEqual(audio.getLevel("nope").id, "off");
});

test("adjusting a control keeps the preset label but reports a custom treatment", () => {
  let selection = audio.applyPresetToSelection(audio.createSelection(), "clean");
  assert.strictEqual(audio.matchPreset(selection.controls).id, "clean");
  selection = audio.setControl(selection, "clarity", "strong");
  assert.strictEqual(selection.presetId, "clean", "starting preset is remembered");
  assert.strictEqual(selection.controls.clarity, "strong");
  assert.strictEqual(audio.matchPreset(selection.controls), null, "no longer matches a preset");
});

test("setControl ignores unknown controls and unknown levels resolve to off", () => {
  let selection = audio.createSelection();
  const before = Object.assign({}, selection.controls);
  selection = audio.setControl(selection, "bogus", "strong");
  assert.deepStrictEqual(selection.controls, before, "unknown control is a no-op");
  selection = audio.setControl(selection, "noise", "bogus");
  assert.strictEqual(selection.controls.noise, "off", "unknown level clamps to off");
});

test("per-speaker treatments are tied to the imported tracks", () => {
  const episode = completeUploadEpisode();
  const selection = audio.applyPresetToSelection(audio.createSelection(), "clean");
  const tracks = audio.buildTrackTreatments(episode.speakers, selection);
  assert.strictEqual(tracks.length, 3);
  assert.deepStrictEqual(tracks.map((t) => t.name), ["Sam Rivera", "Dana Kim", "Marco Vidal"]);
  assert.deepStrictEqual(tracks.map((t) => t.role), ["Host", "Guest 1", "Guest 2"]);
  assert.ok(tracks.every((t) => t.ready === true), "tracks with a real source are ready");
  assert.ok(tracks.every((t) => /Noise cleanup/.test(t.treatmentLabel)), "treatment names the active goals");
});

test("a track with no assigned source surfaces as needs-source, never ready", () => {
  const speakers = [
    { role: "Host", name: "Sam", sourceLabel: "sam.mp4" },
    { role: "Guest 1", name: "Dana", sourceLabel: "No file chosen" },
  ];
  const tracks = audio.buildTrackTreatments(speakers, audio.createSelection());
  assert.strictEqual(tracks[0].status, "ready");
  assert.strictEqual(tracks[1].status, "needs-source");
  assert.strictEqual(tracks[1].ready, false);
});

test("an all-off treatment is reported honestly as no processing", () => {
  let selection = audio.createSelection();
  audio.controlKeys().forEach((key) => {
    selection = audio.setControl(selection, key, "off");
  });
  assert.strictEqual(audio.activeControls(selection.controls).length, 0);
  const tracks = audio.buildTrackTreatments([{ role: "Host", name: "Sam", sourceLabel: "sam.mp4" }], selection);
  assert.ok(/left untouched/i.test(tracks[0].treatmentLabel));
});

test("summarizeAudio reflects the chosen preset, controls, and tracks", () => {
  const episode = completeUploadEpisode();
  const selection = audio.applyPresetToSelection(audio.createSelection(), "studio");
  const summary = audio.summarizeAudio(selection, episode.speakers);
  assert.strictEqual(summary.presetName, "Studio");
  assert.strictEqual(summary.isCustom, false);
  assert.strictEqual(summary.treatmentName, "Studio");
  assert.strictEqual(summary.controls.length, 4);
  assert.ok(summary.controls.every((c) => c.on), "Studio turns every control on");
  assert.strictEqual(summary.trackCount, 3);
  assert.strictEqual(summary.readyCount, 3);
});

test("a customized summary names the preset it started from", () => {
  let selection = audio.applyPresetToSelection(audio.createSelection(), "clean");
  selection = audio.setControl(selection, "enhancement", "strong");
  const summary = audio.summarizeAudio(selection, [{ role: "Host", name: "Sam", sourceLabel: "sam.mp4" }]);
  assert.strictEqual(summary.isCustom, true);
  assert.strictEqual(summary.treatmentName, "Custom (based on Clean)");
});

// End-to-end: a completed setup feeds the audio polish step, the creator picks a preset and
// tweaks a control, and the saved summary covers every assigned speaker track — the
// documented runnable check for issue #15.
test("ACCEPTANCE: move from setup into audio polish and save a per-track treatment", () => {
  const episode = completeUploadEpisode();
  assert.strictEqual(episode.speakerCount, 3);

  let selection = audio.createSelection();
  selection = audio.applyPresetToSelection(selection, "clean");
  selection = audio.setControl(selection, "clarity", "strong");

  const summary = audio.summarizeAudio(selection, episode.speakers);
  assert.strictEqual(summary.isCustom, true);
  assert.strictEqual(summary.treatmentName, "Custom (based on Clean)");
  assert.deepStrictEqual(summary.tracks.map((t) => t.name), ["Sam Rivera", "Dana Kim", "Marco Vidal"]);
  assert.ok(summary.tracks.every((t) => t.ready), "every imported track is ready to polish");
  const clarity = summary.controls.find((c) => c.key === "clarity");
  assert.strictEqual(clarity.levelLabel, "Strong");
  assert.strictEqual(summary.readyCount, episode.speakerCount);
});

console.log(`\naudio polish: ${passed} assertions passed`);
