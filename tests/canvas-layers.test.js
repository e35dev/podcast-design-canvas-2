"use strict";

// Canvas layer locking smoke suite for Podcast Design Canvas (#5).
// Guards the acceptance rules: locked layers cannot self-reorder, cannot be displaced
// by neighbors, and unlocked layers still reorder around them.
// Run with: `node tests/canvas-layers.test.js`.

const assert = require("assert");
const layers = require("../app/canvas-layers.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function ids(stack) {
  return stack.map((layer) => layer.id);
}

function lockedIndex(stack, id) {
  return stack.findIndex((layer) => layer.id === id);
}

test("sample stack seeds a locked brand layer", () => {
  const stack = layers.sampleLayers();
  const brand = stack.find((layer) => layer.type === "brand");
  assert.ok(brand);
  assert.strictEqual(brand.locked, true);
});

test("a locked layer cannot move via its own controls", () => {
  const stack = [
    layers.createLayer("brand", "locked", { locked: true }),
    layers.createLayer("captions", "free"),
    layers.createLayer("speaker", "mid"),
  ];
  assert.strictEqual(layers.canMoveLayer(stack, 0, 1), false);
  assert.strictEqual(layers.canMoveLayer(stack, 0, -1), false);
  assert.deepStrictEqual(ids(layers.moveLayer(stack, 0, 1)), ids(stack));
  assert.deepStrictEqual(ids(layers.moveLayer(stack, 0, -1)), ids(stack));
});

test("an unlocked neighbor cannot displace a locked layer", () => {
  const stack = [
    layers.createLayer("captions", "top"),
    layers.createLayer("brand", "locked", { locked: true }),
    layers.createLayer("speaker", "bottom"),
  ];
  assert.strictEqual(layers.canMoveLayer(stack, 0, 1), false, "top cannot move into locked slot");
  assert.strictEqual(layers.canMoveLayer(stack, 2, -1), false, "bottom cannot move into locked slot");
  assert.strictEqual(lockedIndex(stack, "locked"), 1);
  const afterTop = layers.moveLayer(stack, 0, 1);
  const afterBottom = layers.moveLayer(stack, 2, -1);
  assert.strictEqual(lockedIndex(afterTop, "locked"), 1);
  assert.strictEqual(lockedIndex(afterBottom, "locked"), 1);
});

test("unlocked layers reorder freely around locked anchors", () => {
  const stack = [
    layers.createLayer("title", "a"),
    layers.createLayer("captions", "b"),
    layers.createLayer("brand", "locked", { locked: true }),
    layers.createLayer("speaker", "c"),
    layers.createLayer("broll", "d"),
  ];
  assert.strictEqual(layers.canMoveLayer(stack, 3, -1), false, "blocked by locked brand");
  assert.strictEqual(layers.canMoveLayer(stack, 1, 1), false, "blocked by locked brand");

  const movedUp = layers.moveLayer(stack, 4, -1);
  assert.deepStrictEqual(ids(movedUp), ["a", "b", "locked", "d", "c"]);
  assert.strictEqual(lockedIndex(movedUp, "locked"), 2);

  const movedDown = layers.moveLayer(stack, 0, 1);
  assert.deepStrictEqual(ids(movedDown), ["b", "a", "locked", "c", "d"]);
  assert.strictEqual(lockedIndex(movedDown, "locked"), 2);
});

test("locking only blocks removal and reorder — visibility still toggles", () => {
  const stack = [layers.createLayer("brand", "locked", { locked: true })];
  const hidden = layers.toggleVisibility(stack, 0);
  assert.strictEqual(hidden[0].visible, false);
  assert.deepStrictEqual(ids(layers.removeLayer(stack, 0)), ids(stack));
});

test("evaluateLayout asks to lock visible brand elements", () => {
  const stack = [layers.createLayer("brand", "logo", { locked: false })];
  const result = layers.evaluateLayout(stack);
  assert.strictEqual(result.overall, "review");
  assert.ok(/cannot move by accident/i.test(result.checks[0].action));
});

test("ACCEPTANCE: locked stack positions stay fixed during neighbor reordering", () => {
  let stack = [
    layers.createLayer("title", "a"),
    layers.createLayer("brand", "logo", { locked: true }),
    layers.createLayer("captions", "b"),
    layers.createLayer("speaker", "c"),
  ];
  const lockedPositions = { logo: 1 };

  const moves = [
    [0, 1],
    [3, -1],
    [2, -1],
    [3, -1],
    [0, 1],
  ];
  moves.forEach(([index, delta]) => {
    stack = layers.moveLayer(stack, index, delta);
    Object.keys(lockedPositions).forEach((id) => {
      assert.strictEqual(lockedIndex(stack, id), lockedPositions[id], `${id} stayed pinned`);
    });
  });

  stack = layers.toggleLock(stack, lockedIndex(stack, "logo"));
  const brandIdx = lockedIndex(stack, "logo");
  stack = layers.moveLayer(stack, brandIdx, 1);
  assert.notStrictEqual(lockedIndex(stack, "logo"), lockedPositions.logo, "unlocked brand can move");
});

console.log(`\ncanvas layers: ${passed} assertions passed`);
