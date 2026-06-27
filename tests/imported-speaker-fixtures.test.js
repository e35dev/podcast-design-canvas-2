"use strict";

// Imported speaker fixture smoke suite (#197).
// Run with: `node tests/imported-speaker-fixtures.test.js`.

const assert = require("assert");
const fixtures = require("../app/imported-speaker-fixtures.js");
const audio = require("../app/audio-polish.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

test("fixture files load as valid imported PCM WAV bytes", () => {
  ["Host", "Guest 1", "Guest 2"].forEach((role) => {
    const bytes = fixtures.loadFixtureBytesSync(role);
    assert.ok(bytes.length > 44);
    const decoded = audio.decodeWav(bytes);
    assert.ok(decoded.samples.length > 1000);
  });
});

test("fixture paths map speaker buckets to committed track files", () => {
  assert.strictEqual(fixtures.fixturePathForRole("Host"), "fixtures/speaker-tracks/host.wav");
  assert.strictEqual(fixtures.fixturePathForRole("Guest 1"), "fixtures/speaker-tracks/guest-1.wav");
  assert.match(fixtures.importedFileNameForRole("Host", "riverside"), /riverside-sync\.wav$/);
});

test("ACCEPTANCE: polish processing changes fixture bytes into different polished output", () => {
  const source = fixtures.loadFixtureBytesSync("Host");
  const decoded = audio.decodeWav(source);
  const processed = audio.processSamples(decoded.samples, audio.createPolish({}));
  const polished = audio.encodeWav(processed, decoded.sampleRate);
  const polishedDecoded = audio.decodeWav(polished);
  assert.notDeepStrictEqual(
    Array.from(source.slice(44, 172)),
    Array.from(polished.slice(44, 172)),
  );
  assert.ok(polishedDecoded.samples.length === decoded.samples.length);
});

console.log(`\nimported speaker fixtures: ${passed} assertions passed`);
