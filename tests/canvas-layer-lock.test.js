"use strict";

// Locked canvas layers are immovable in the stack (#190).
// A locked layer cannot be dragged/reordered, neighbors cannot displace it, adding a
// new layer never shifts a locked layer's stacking order, and it cannot be removed.
// Unlocking restores normal editing.
// Run with: `node tests/canvas-layer-lock.test.js`.

const assert = require("assert");
const CL = require("../app/canvas-layers.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function ids(layers) {
  return layers.map((layer) => layer.id);
}

test("a locked layer cannot move up or down", () => {
  const layers = [
    CL.createLayer("captions", "a"),
    CL.createLayer("brand", "b", { locked: true }),
    CL.createLayer("title", "c"),
  ];
  assert.strictEqual(CL.canMoveLayer(layers, 1, -1), false);
  assert.strictEqual(CL.canMoveLayer(layers, 1, 1), false);
  assert.deepStrictEqual(ids(CL.moveLayer(layers, 1, -1)), ["a", "b", "c"]);
  assert.deepStrictEqual(ids(CL.moveLayer(layers, 1, 1)), ["a", "b", "c"]);
});

test("an unlocked neighbor cannot displace a locked layer via moveLayer", () => {
  const layers = [
    CL.createLayer("captions", "a"),
    CL.createLayer("brand", "b", { locked: true }),
    CL.createLayer("title", "c"),
  ];
  // "a" trying to move down into the locked slot, and "c" trying to move up into it.
  assert.strictEqual(CL.canMoveLayer(layers, 0, 1), false);
  assert.strictEqual(CL.canMoveLayer(layers, 2, -1), false);
  assert.deepStrictEqual(ids(CL.moveLayer(layers, 0, 1)), ["a", "b", "c"]);
  assert.deepStrictEqual(ids(CL.moveLayer(layers, 2, -1)), ["a", "b", "c"]);
});

test("adding a layer does not change a locked layer's index (locked at bottom)", () => {
  const layers = CL.sampleLayers(); // l5 is locked at index 4
  const lockedBefore = layers.findIndex((l) => l.locked);
  const next = CL.addLayer(layers, "title", "new1");
  const lockedAfter = next.findIndex((l) => l.id === "l5");
  assert.strictEqual(lockedAfter, lockedBefore);
  assert.strictEqual(next[lockedAfter].locked, true);
});

test("adding a layer does not change a locked layer's index (locked at top)", () => {
  const layers = [
    CL.createLayer("brand", "b", { locked: true }),
    CL.createLayer("title", "t"),
    CL.createLayer("captions", "c"),
  ];
  const next = CL.addLayer(layers, "speaker", "new1");
  assert.strictEqual(next.findIndex((l) => l.id === "b"), 0);
  assert.strictEqual(next[0].locked, true);
});

test("adding a layer keeps every locked layer's stacking order (locked in middle)", () => {
  const layers = [
    CL.createLayer("title", "t"),
    CL.createLayer("brand", "b", { locked: true }),
    CL.createLayer("captions", "c"),
  ];
  const next = CL.addLayer(layers, "speaker", "new1");
  assert.strictEqual(next.findIndex((l) => l.id === "b"), 1);
  assert.strictEqual(next[1].locked, true);
});

test("a new layer is unlocked and visible and does not change unlocked-only stacking", () => {
  const layers = [CL.createLayer("title", "t"), CL.createLayer("captions", "c")];
  const next = CL.addLayer(layers, "speaker", "new1");
  // No locks: still lands on top of the stack (index 0), unchanged behavior.
  assert.strictEqual(next[0].id, "new1");
  assert.strictEqual(next[0].locked, false);
  assert.strictEqual(next[0].visible, true);
});

test("removeLayer no-ops on a locked layer", () => {
  const layers = [
    CL.createLayer("captions", "a"),
    CL.createLayer("brand", "b", { locked: true }),
    CL.createLayer("title", "c"),
  ];
  assert.deepStrictEqual(ids(CL.removeLayer(layers, 1)), ["a", "b", "c"]);
});

test("unlocking a layer restores normal moves", () => {
  let layers = [
    CL.createLayer("captions", "a"),
    CL.createLayer("brand", "b", { locked: true }),
    CL.createLayer("title", "c"),
  ];
  layers = CL.toggleLock(layers, 1); // unlock "b"
  assert.strictEqual(CL.canMoveLayer(layers, 1, -1), true);
  assert.deepStrictEqual(ids(CL.moveLayer(layers, 1, -1)), ["b", "a", "c"]);
  assert.deepStrictEqual(ids(CL.removeLayer(layers, 1)), ["a", "c"]);
});

console.log(`canvas-layer-lock.test.js: ${passed} passed`);
