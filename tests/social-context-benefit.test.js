"use strict";

// Social context benefit copy suite for Podcast Design Canvas (#139).
// Run with: `node tests/social-context-benefit.test.js`.
//
// The import wizard must explain, in creator-facing language, why adding host
// and guest links helps (better names, transcripts, references, captions, and
// visual moments), give a subtle setup cue that context improves transcript and
// visual accuracy, and keep links optional so the flow works with none added.

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

test("the speaker social-link hint explains the concrete editing benefits", () => {
  assert.ok(/transcript/i.test(ui), "expected the hint to mention transcripts");
  assert.ok(
    /captions/i.test(ui) && /visual moments/i.test(ui),
    "expected the hint to mention captions and visual moments",
  );
  assert.ok(
    /spell names/i.test(ui),
    "expected the hint to mention spelling names correctly",
  );
});

test("the social-link hint keeps a trust-building, non-invasive framing", () => {
  assert.ok(
    /never an invasive profile crawl/i.test(ui),
    "expected the hint to reassure it is not invasive research",
  );
  assert.ok(
    /works fine with no links/i.test(ui),
    "expected the hint to say the import works with no links",
  );
});

test("the setup lead gives a subtle cue that context improves accuracy", () => {
  assert.ok(
    /optional social links/i.test(ui),
    "expected the import lead to frame social links as optional",
  );
  assert.ok(
    /transcript spellings and visual accuracy|transcripts, and visual moments right/i.test(
      ui,
    ),
    "expected the import lead to tie context to transcript/visual accuracy",
  );
});

test("social links stay optional — a draft with no links still validates", () => {
  const draft = setup.createDraft();
  draft.episodeName = "Episode 1";
  draft.riversideLink = "https://riverside.fm/studio/ep-1";
  // Names are required, but social links are not added on any speaker.
  draft.speakers.forEach((sp, i) => { sp.name = `Speaker ${i + 1}`; });
  const result = setup.validateDraft(draft);
  assert.strictEqual(result.ok, true, "expected a no-links draft to be valid");
});

console.log(`\nsocial-context-benefit: ${passed} test(s) passed.`);
