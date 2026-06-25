"use strict";

// Episode import before brand setup smoke suite for Podcast Design Canvas (#73).
// Run with: `node tests/episode-import-flow.test.js`.

const assert = require("assert");
const setup = require("../app/episode-setup.js");
const library = require("../app/show-library.js");
const flow = require("../app/episode-import-flow.js");

let passed = 0;
function test(name, fn) {
  library._resetCounters();
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

test("afterShowCreated routes new shows to episode setup", () => {
  const show = library.createShow("Founders Unfiltered");
  const next = flow.afterShowCreated(show);
  assert.strictEqual(next.nextAction, flow.NEXT_AFTER_SHOW_CREATE);
  assert.strictEqual(next.showId, show.id);
  assert.ok(/Riverside|speaker/.test(next.message));
});

test("show detail section order prioritizes episode import over brand kit", () => {
  assert.deepStrictEqual(flow.showDetailSectionOrder(), ["episode-import", "episodes", "brand-kit"]);
  assert.strictEqual(flow.episodeImportBeforeBrandKit(), true);
});

test("primary library action promotes starting an episode", () => {
  const action = flow.primaryLibraryAction();
  assert.strictEqual(action.id, "start-episode");
  assert.ok(/Start episode/.test(action.label));
  assert.ok(/brand/.test(action.hint));
});

test("ACCEPTANCE: episode setup accepts Riverside import, upload sources, and social links", () => {
  const draft = setup.createDraft();
  draft.episodeName = "Founders Unfiltered #7";
  draft.sourceMode = "riverside";
  draft.riversideLink = "https://riverside.fm/studio/founders-7";
  draft.speakers = [
    Object.assign(setup.createSpeaker("Host"), {
      name: "Sam Rivera",
      social: { website: "https://samrivera.show" },
    }),
    Object.assign(setup.createSpeaker("Guest 1"), {
      name: "Dana Kim",
      social: { linkedin: "https://linkedin.com/in/danakim" },
    }),
  ];
  const riversideCheck = setup.validateDraft(draft);
  assert.strictEqual(riversideCheck.ok, true);

  draft.sourceMode = "upload";
  draft.riversideLink = "";
  draft.speakers[0].fileName = "sam.mp4";
  draft.speakers[1].fileName = "dana.mp4";
  const uploadCheck = setup.validateDraft(draft);
  assert.strictEqual(uploadCheck.ok, true);

  const summary = setup.summarize(draft);
  assert.strictEqual(summary.speakerCount, 2);
  assert.ok(summary.socialLinkCount >= 2);

  const show = library.createShow("Founders Unfiltered");
  const next = flow.afterShowCreated(show);
  assert.strictEqual(next.nextAction, "episode-setup");
  assert.strictEqual(flow.showDetailSectionOrder()[0], "episode-import");
});

console.log(`\nepisode-import-flow: ${passed} passed`);
