"use strict";

// Episode import handoff recap suite for Podcast Design Canvas (#142).
// Run with: `node tests/import-handoff-recap.test.js`.
//
// After completing the import flow, the workspace must show a visible episode
// setup summary confirming the imported source, each speaker bucket + assigned
// identity, and the actual social links/context entered — not just an opaque
// count — and invalid import inputs must be blocked before continuing.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const ui = fs.readFileSync(
  path.join(__dirname, "../app/episode-setup.ui.js"),
  "utf8",
);
const styles = fs.readFileSync(
  path.join(__dirname, "../app/styles.css"),
  "utf8",
);

test("the workspace renders an episode import recap section", () => {
  assert.ok(/function renderEpisodeImportRecap\(summary\)/.test(ui));
  assert.ok(/renderEpisodeImportRecap\(summary\)/.test(ui), "recap is rendered");
  assert.ok(/Episode import summary/.test(ui));
});

test("the recap confirms the import is driving the setup", () => {
  assert.ok(
    /now driving the episode setup/i.test(ui),
    "expected a confirmation that the import drives the setup",
  );
});

test("the recap shows source, episode look, and each speaker", () => {
  assert.ok(/episode-import-recap-source/.test(ui));
  assert.ok(/episode-import-recap-style/.test(ui));
  assert.ok(/episode-import-recap-speakers/.test(ui));
});

test("the recap surfaces each speaker's actual social context, not just a count", () => {
  assert.ok(
    /episode-import-recap-speaker-social/.test(ui),
    "expected per-speaker social links in the recap",
  );
  assert.ok(
    /speaker\.social\.forEach/.test(ui),
    "expected the recap to iterate each speaker's social entries",
  );
  assert.ok(
    /episode-import-recap-speaker-social/.test(styles),
    "expected styles for the per-speaker social context",
  );
});

test("summarize exposes the per-speaker social context the recap renders", () => {
  const draft = setup.createDraft();
  draft.speakers[0].name = "Avery";
  draft.speakers[0].social.website = "https://avery.example";
  draft.speakers[0].social.twitter = "https://x.com/avery";
  const summary = setup.summarize(draft);
  assert.strictEqual(summary.speakers[0].social.length, 2);
  assert.deepStrictEqual(
    summary.speakers[0].social.map((s) => s.label).sort(),
    ["Website", "X"],
  );
  assert.strictEqual(summary.socialLinkCount, 2);
});

test("invalid import inputs are blocked before continuing", () => {
  // onContinue validates and re-renders setup with inline errors instead of
  // advancing when the draft is invalid.
  assert.ok(/function onContinue\(\)/.test(ui));
  assert.ok(/ES\.validateDraft\(state\)/.test(ui));
  assert.ok(
    /showErrors = true/.test(ui) && /renderSetup\(\);/.test(ui),
    "expected invalid drafts to surface inline errors and not advance",
  );
  // A missing Riverside link must fail validation.
  const draft = setup.createDraft();
  draft.episodeName = "Episode 1";
  draft.sourceMode = "riverside";
  draft.riversideLink = "";
  draft.speakers.forEach((sp, i) => {
    sp.name = `Speaker ${i + 1}`;
  });
  const result = setup.validateDraft(draft);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.riversideLink, "expected a missing-link error");
});

console.log(`\nimport-handoff-recap: ${passed} test(s) passed.`);
