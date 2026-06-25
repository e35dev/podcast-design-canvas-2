"use strict";

// Workflow progress smoke suite for Podcast Design Canvas (#89).
// Run with: `node tests/workflow-progress.test.js`.

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const setup = require("../app/episode-setup.js");
const library = require("../app/show-library.js");
const onboarding = require("../app/show-onboarding.js");
const workspace = require("../app/episode-workspace.js");

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
  console.log(`  ok ${name}`);
}

const styles = fs.readFileSync(path.join(__dirname, "../app/styles.css"), "utf8");
const ui = fs.readFileSync(path.join(__dirname, "../app/episode-setup.ui.js"), "utf8");

test("findResumableEpisode returns the latest draft or in-progress episode", () => {
  library._resetCounters();
  const episodes = [
    library.createEpisode("show-1", "Exported episode", { status: library.EPISODE_STATUS.EXPORTED }),
    library.createEpisode("show-1", "Draft episode", { status: library.EPISODE_STATUS.DRAFT }),
  ];
  const resumable = library.findResumableEpisode(episodes);
  assert.strictEqual(resumable.name, "Draft episode");
  assert.strictEqual(library.resumeDestination(resumable.status), "setup");
});

test("resumeDestination routes in-progress episodes to the workspace", () => {
  assert.strictEqual(library.resumeDestination(library.EPISODE_STATUS.IN_PROGRESS), "workspace");
  assert.strictEqual(library.resumeDestination(library.EPISODE_STATUS.DRAFT), "setup");
});

test("showDetailSections highlights a draft episode with a resume primary action", () => {
  library._resetCounters();
  let lib = library.createLibrary();
  const show = library.createShow("Agency Weekly");
  lib = library.addShow(lib, show);
  const ep = library.createEpisode(show.id, "Episode 1", { status: library.EPISODE_STATUS.DRAFT });
  lib = library.addEpisode(lib, show.id, ep);
  const sections = onboarding.showDetailSections(library.getShow(lib, show.id));

  assert.strictEqual(sections.primary.resumableEpisodeId, ep.id);
  assert.ok(/Continue|Resume/i.test(sections.primary.actionLabel));
  assert.ok(/Episode 1/.test(sections.primary.title));
});

test("summarizeWorkspace exposes a numbered step indicator and next action", () => {
  const episode = setup.summarize(setup.createDraft());
  episode.episodeName = "Founders Unfiltered #7";
  episode.speakerCount = 2;
  episode.sourceModeLabel = "Riverside link";
  const ws = workspace.buildWorkspace(episode, {});
  const summary = workspace.summarizeWorkspace(ws);
  assert.ok(/^Step \d+ of \d+ · /.test(summary.stepIndicatorLine));
  assert.ok(summary.nextActionLabel.length > 0);
  assert.ok(summary.nextActionTarget.length > 0);
});

test("styles make the step pill and workspace current step prominent", () => {
  assert.ok(styles.includes(".step-pill--workflow"));
  assert.ok(styles.includes(".step-pill--current"));
  assert.ok(styles.includes(".workspace-current-hero"));
  assert.ok(styles.includes(".show-episode-card--resumable"));
});

test("ACCEPTANCE: show home and guided workspace expose resume and next-action affordances", () => {
  assert.ok(ui.includes("resumeEpisodeFromShow"));
  assert.ok(ui.includes("show-resume-primary-btn"));
  assert.ok(ui.includes("show-episode-resume-btn"));
  assert.ok(ui.includes("workspace-current-hero"));
  assert.ok(ui.includes("workspace-next-action-btn"));
  assert.ok(ui.includes("stepIndicatorLine"));
});

console.log(`\nworkflow progress: ${passed} assertions passed`);
