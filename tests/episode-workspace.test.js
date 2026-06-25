"use strict";

// Guided workspace smoke suite for Podcast Design Canvas (#40).
// Guards the ordered stages, per-stage status/summary, and overall progress — including
// that the workspace reflects progress across setup, style, review, and export.
// Run with: `node tests/episode-workspace.test.js`.

const assert = require("assert");
const ws = require("../app/episode-workspace.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

function stageById(stages, id) {
  return stages.find((s) => s.id === id);
}

test("STAGE_ORDER covers the full import-to-publish flow in order", () => {
  const ids = ws.STAGE_ORDER.map((s) => s.id);
  assert.deepStrictEqual(ids, ["setup", "style", "audio", "moments", "template", "review", "export"]);
  ws.STAGE_ORDER.forEach((s) => {
    assert.ok(s.label && s.action, `${s.id} has a label and an action`);
  });
});

test("an empty episode shows setup ready and everything else to-do", () => {
  const stages = ws.buildStages({});
  assert.strictEqual(stageById(stages, "setup").status, "ready");
  assert.strictEqual(stageById(stages, "style").status, "todo");
  assert.strictEqual(stageById(stages, "audio").status, "todo");
  assert.strictEqual(stageById(stages, "review").status, "todo");
  assert.strictEqual(stageById(stages, "export").status, "todo");
});

test("completing setup makes the dependent stages actionable", () => {
  const stages = ws.buildStages({ setupComplete: true, speakerCount: 2, sourceModeLabel: "Upload" });
  assert.strictEqual(stageById(stages, "setup").status, "done");
  assert.ok(stageById(stages, "setup").summary.includes("2 speakers"));
  assert.strictEqual(stageById(stages, "style").status, "ready");
  assert.strictEqual(stageById(stages, "audio").status, "ready");
  assert.strictEqual(stageById(stages, "moments").status, "ready");
});

test("each stage reports a plain-language status and summary of current choices", () => {
  const stages = ws.buildStages({
    setupComplete: true, speakerCount: 3, sourceModeLabel: "Riverside",
    styleName: "Panel Grid", layoutLabel: "Grid",
    audioName: "Studio",
    momentCount: 4,
    templateName: "The Build Show",
  });
  assert.strictEqual(stageById(stages, "style").status, "done");
  assert.ok(stageById(stages, "style").summary.includes("Panel Grid"));
  assert.strictEqual(stageById(stages, "audio").status, "done");
  assert.ok(stageById(stages, "audio").summary.includes("Studio"));
  assert.strictEqual(stageById(stages, "moments").status, "done");
  assert.ok(stageById(stages, "moments").summary.includes("4"));
  assert.strictEqual(stageById(stages, "template").status, "done");
  assert.ok(stageById(stages, "template").summary.includes("The Build Show"));
});

test("template is actionable once a style is chosen", () => {
  const todo = ws.buildStages({ setupComplete: true });
  assert.strictEqual(stageById(todo, "template").status, "todo");
  const ready = ws.buildStages({ setupComplete: true, styleName: "Split Stage" });
  assert.strictEqual(stageById(ready, "template").status, "ready");
});

test("review is ready when style and audio are set, and blocks when flagged", () => {
  const ready = ws.buildStages({ setupComplete: true, styleName: "Panel Grid", audioName: "Clean" });
  assert.strictEqual(stageById(ready, "review").status, "ready");

  const blocked = ws.buildStages({ setupComplete: true, styleName: "Panel Grid", audioName: "Clean", reviewBlocked: true, reviewBlockingCount: 2 });
  assert.strictEqual(stageById(blocked, "review").status, "blocked");
  assert.ok(stageById(blocked, "review").summary.includes("2"));

  const approved = ws.buildStages({ setupComplete: true, styleName: "Panel Grid", audioName: "Clean", reviewApproved: true });
  assert.strictEqual(stageById(approved, "review").status, "done");
});

test("export becomes done once an export is ready", () => {
  const ready = ws.buildStages({ setupComplete: true, styleName: "Panel Grid", audioName: "Clean", reviewApproved: true });
  assert.strictEqual(stageById(ready, "export").status, "ready");

  const done = ws.buildStages({ setupComplete: true, styleName: "Panel Grid", audioName: "Clean", reviewApproved: true, exportReady: true, exportFileName: "show-1080p.mp4" });
  assert.strictEqual(stageById(done, "export").status, "done");
  assert.ok(stageById(done, "export").summary.includes("show-1080p.mp4"));
});

test("summarizeProgress counts completed stages and names the next one", () => {
  const stages = ws.buildStages({ setupComplete: true, speakerCount: 2, styleName: "Panel Grid" });
  const progress = ws.summarizeProgress(stages);
  assert.strictEqual(progress.total, 7);
  assert.strictEqual(progress.completed, 2); // setup + style
  assert.ok(progress.percent > 0 && progress.percent < 100);
  assert.strictEqual(progress.nextStageId, "audio");
  assert.ok(/next: Audio polish/.test(progress.headline));
});

test("summarizeProgress reports full completion", () => {
  const stages = ws.buildStages({
    setupComplete: true, speakerCount: 2, styleName: "Panel Grid", audioName: "Clean",
    momentCount: 3, templateName: "Show", reviewApproved: true, exportReady: true,
  });
  const progress = ws.summarizeProgress(stages);
  assert.strictEqual(progress.completed, 7);
  assert.strictEqual(progress.percent, 100);
  assert.strictEqual(progress.complete, true);
  assert.strictEqual(progress.nextStageId, null);
});

// End-to-end: the workspace reflects progress across setup → style → review → export.
test("ACCEPTANCE: workspace reflects progress across setup, style, review, and export", () => {
  // Nothing done yet.
  let result = ws.buildWorkspace({});
  assert.strictEqual(result.progress.completed, 0);
  assert.strictEqual(stageById(result.stages, "setup").status, "ready");

  // Setup done.
  result = ws.buildWorkspace({ setupComplete: true, speakerCount: 2, sourceModeLabel: "Upload" });
  assert.strictEqual(stageById(result.stages, "setup").status, "done");
  assert.strictEqual(result.progress.nextStageId, "style");

  // Style chosen.
  result = ws.buildWorkspace({ setupComplete: true, speakerCount: 2, styleName: "Panel Grid", audioName: "Clean" });
  assert.strictEqual(stageById(result.stages, "style").status, "done");
  assert.strictEqual(stageById(result.stages, "review").status, "ready");

  // Reviewed & approved, then exported.
  result = ws.buildWorkspace({
    setupComplete: true, speakerCount: 2, styleName: "Panel Grid", audioName: "Clean",
    reviewApproved: true, exportReady: true, exportFileName: "founders-1080p.mp4",
  });
  assert.strictEqual(stageById(result.stages, "review").status, "done");
  assert.strictEqual(stageById(result.stages, "export").status, "done");
  assert.ok(result.progress.percent >= 70, "most stages complete");
});

console.log(`\nepisode workspace: ${passed} assertions passed`);
