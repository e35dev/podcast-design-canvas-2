"use strict";

// Browser wiring for the episode setup flow (#1) and the preset style step (#3). Renders
// the setup wizard, the episode workspace, and the preset style selection + preview from
// the shared PdcEpisodeSetup / PdcEpisodeStyle rules. Loaded as a classic script so the
// app runs by opening index.html directly or via `npm run preview`.
(function () {
  const ES = window.PdcEpisodeSetup;
  const STY = window.PdcEpisodeStyle;
  const MO = window.PdcEpisodeMoments;
  const root = document.getElementById("app");
  const stepPill = document.querySelector(".step-pill");
  if (!ES || !root) {
    return;
  }

  let state = ES.createDraft();
  let errors = {};
  let showErrors = false;
  // Style step state, kept across navigation so choices survive Edit setup / Back.
  let styleSelection = STY ? STY.createSelection() : null;
  let appliedStyle = null;
  // Visual moments state (#19). Held at module scope so the timeline and every edit
  // persist when the creator leaves the moments editor and comes back.
  let momentsState = MO ? MO.createMomentsState() : null;
  let selectedMomentId = null;

  function setStep(label) {
    if (stepPill) {
      stepPill.textContent = label;
    }
  }

  // Tiny DOM helper: el("div", {class:"x", onclick:fn}, child, child...).
  function el(tag, attrs) {
    const node = document.createElement(tag);
    const props = attrs || {};
    Object.keys(props).forEach((key) => {
      const value = props[key];
      if (value == null || value === false) {
        return;
      }
      if (key === "class") {
        node.className = value;
      } else if (key === "for") {
        node.htmlFor = value;
      } else if (key.indexOf("on") === 0 && typeof value === "function") {
        node.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (value === true) {
        node.setAttribute(key, "");
      } else {
        node.setAttribute(key, value);
      }
    });
    for (let i = 2; i < arguments.length; i += 1) {
      appendChild(node, arguments[i]);
    }
    return node;
  }

  function appendChild(node, child) {
    if (child == null || child === false) {
      return;
    }
    if (Array.isArray(child)) {
      child.forEach((c) => appendChild(node, c));
    } else if (typeof child === "string") {
      node.appendChild(document.createTextNode(child));
    } else {
      node.appendChild(child);
    }
  }

  function fieldId(key) {
    if (key.indexOf("speaker:") === 0) {
      const parts = key.split(":");
      return parts.length === 4
        ? `f-sp-${parts[1]}-social-${parts[3]}`
        : `f-sp-${parts[1]}-${parts[2]}`;
    }
    return `f-${key}`;
  }

  // Inline error paragraph for a field, shown only after a failed Continue.
  function errorFor(key) {
    if (!showErrors || !errors[key]) {
      return null;
    }
    return el("p", { class: "field-error", role: "alert" }, errors[key]);
  }

  function isInvalid(key) {
    return showErrors && Boolean(errors[key]);
  }

  function field(labelText, control, key, hint) {
    return el(
      "div",
      { class: "field" },
      el("label", { for: control.id }, labelText),
      hint ? el("p", { class: "hint" }, hint) : null,
      control,
      key ? errorFor(key) : null,
    );
  }

  function nextRole() {
    const used = {};
    state.speakers.forEach((s) => {
      used[s.role] = true;
    });
    const free = ES.SPEAKER_BUCKETS.find((bucket) => !used[bucket]);
    return free || `Guest ${state.speakers.length}`;
  }

  // ---- Setup view -------------------------------------------------------------

  function renderSetup() {
    root.innerHTML = "";
    setStep("Step 1 of 6 · Set up episode");
    state.sourceMode = ES.normalizeMode(state.sourceMode);

    const form = el("form", { class: "setup", novalidate: true });
    form.addEventListener("submit", (event) => {
      event.preventDefault();
      onContinue();
    });

    if (showErrors && errors && Object.keys(errors).length) {
      form.appendChild(
        el(
          "div",
          { class: "banner", role: "alert", tabindex: "-1", id: "error-banner" },
          el("strong", {}, "A few things need a quick fix:"),
          el(
            "ul",
            {},
            // Show up to the first handful of messages so the banner stays scannable.
            (function () {
              const seen = {};
              const items = [];
              Object.keys(errors).forEach((k) => {
                const msg = errors[k];
                if (!seen[msg]) {
                  seen[msg] = true;
                  items.push(el("li", {}, msg));
                }
              });
              return items;
            })(),
          ),
        ),
      );
    }

    // Episode details
    const nameInput = el("input", {
      id: "f-episodeName",
      type: "text",
      value: state.episodeName,
      placeholder: "e.g. Episode 12 — Building in Public",
      "aria-invalid": isInvalid("episodeName") ? "true" : null,
    });
    nameInput.addEventListener("input", (e) => {
      state.episodeName = e.target.value;
    });

    const detailsCard = el(
      "section",
      { class: "card" },
      el("h2", {}, "Episode details"),
      field("Episode name", nameInput, "episodeName"),
    );
    form.appendChild(detailsCard);

    // Recording source
    const modeButtons = ES.SOURCE_MODES.map((mode) => {
      const id = `mode-${mode.key}`;
      const input = el("input", {
        id,
        type: "radio",
        name: "sourceMode",
        value: mode.key,
        checked: state.sourceMode === mode.key,
      });
      input.addEventListener("change", () => {
        state.sourceMode = mode.key;
        renderSetup();
      });
      return el("label", { class: "mode-option", for: id }, input, el("span", {}, mode.label));
    });

    const sourceCard = el(
      "section",
      { class: "card" },
      el("h2", {}, "Recording source"),
      el("p", { class: "hint" }, "Bring in your recording, then assign each track to a speaker below."),
      el("div", { class: "mode-row" }, modeButtons),
    );

    if (state.sourceMode === "riverside") {
      const linkInput = el("input", {
        id: "f-riversideLink",
        type: "url",
        value: state.riversideLink,
        placeholder: "https://riverside.fm/studio/your-episode",
        "aria-invalid": isInvalid("riversideLink") ? "true" : null,
      });
      linkInput.addEventListener("input", (e) => {
        state.riversideLink = e.target.value;
      });
      sourceCard.appendChild(
        field("Riverside recording link", linkInput, "riversideLink", "Paste the link to your Riverside recording session."),
      );
    } else {
      sourceCard.appendChild(
        el("p", { class: "hint" }, "Add a separate synced video file for each speaker in the cards below."),
      );
    }
    form.appendChild(sourceCard);

    // Speakers & sources
    const speakersCard = el("section", { class: "card" }, el("h2", {}, "Speakers & sources"));
    state.speakers.forEach((speaker, index) => {
      speakersCard.appendChild(renderSpeaker(speaker, index));
    });

    const addButton = el("button", { type: "button", class: "ghost" }, "+ Add speaker source");
    addButton.addEventListener("click", () => {
      state.speakers.push(ES.createSpeaker(nextRole()));
      renderSetup();
    });
    speakersCard.appendChild(addButton);
    form.appendChild(speakersCard);

    form.appendChild(
      el(
        "div",
        { class: "actions" },
        el("button", { type: "submit", class: "primary" }, "Continue to workspace →"),
      ),
    );

    root.appendChild(form);

    if (showErrors) {
      focusFirstError();
    }
  }

  function renderSpeaker(speaker, index) {
    const card = el("div", { class: "speaker" });
    const header = el(
      "div",
      { class: "speaker-head" },
      el("span", { class: "speaker-tag" }, `Source ${index + 1}`),
    );
    const removeButton = el("button", {
      type: "button",
      class: "link-button",
      "aria-label": `Remove source ${index + 1}`,
      disabled: state.speakers.length <= 1 ? true : null,
    }, "Remove");
    removeButton.addEventListener("click", () => {
      if (state.speakers.length > 1) {
        state.speakers.splice(index, 1);
        renderSetup();
      }
    });
    header.appendChild(removeButton);
    card.appendChild(header);

    // Name
    const nameInput = el("input", {
      id: `f-sp-${index}-name`,
      type: "text",
      value: speaker.name,
      placeholder: "Speaker name",
      "aria-invalid": isInvalid(`speaker:${index}:name`) ? "true" : null,
    });
    nameInput.addEventListener("input", (e) => {
      speaker.name = e.target.value;
    });
    card.appendChild(field("Speaker name", nameInput, `speaker:${index}:name`));

    // Role bucket
    const roleSelect = el("select", {
      id: `f-sp-${index}-role`,
      "aria-invalid": isInvalid(`speaker:${index}:role`) ? "true" : null,
    });
    ES.SPEAKER_BUCKETS.forEach((bucket) => {
      const option = el("option", { value: bucket, selected: speaker.role === bucket ? true : null }, bucket);
      roleSelect.appendChild(option);
    });
    roleSelect.addEventListener("change", (e) => {
      speaker.role = e.target.value;
    });
    card.appendChild(field("Role", roleSelect, `speaker:${index}:role`));

    // Source: file (upload) or optional channel label (riverside)
    if (state.sourceMode === "upload") {
      const fileInput = el("input", {
        id: `f-sp-${index}-source`,
        type: "file",
        accept: "video/*",
        "aria-invalid": isInvalid(`speaker:${index}:source`) ? "true" : null,
      });
      const chosen = el(
        "p",
        { class: "chosen-file" },
        speaker.fileName ? `Selected: ${speaker.fileName}` : "No file chosen yet",
      );
      fileInput.addEventListener("change", (e) => {
        const file = e.target.files && e.target.files[0];
        speaker.fileName = file ? file.name : "";
        speaker.fileSize = file ? file.size : 0;
        chosen.textContent = speaker.fileName ? `Selected: ${speaker.fileName}` : "No file chosen yet";
      });
      card.appendChild(field("Speaker video file", fileInput, `speaker:${index}:source`));
      card.appendChild(chosen);
    } else {
      const trackInput = el("input", {
        id: `f-sp-${index}-source`,
        type: "text",
        value: speaker.trackLabel,
        placeholder: "e.g. Track 1 (optional)",
      });
      trackInput.addEventListener("input", (e) => {
        speaker.trackLabel = e.target.value;
      });
      card.appendChild(field("Channel label", trackInput, null, "Optional — name this speaker's channel in the recording."));
    }

    // Optional social links
    const social = el("details", { class: "social" });
    social.appendChild(el("summary", {}, "Social links (optional)"));
    const socialHint = el(
      "p",
      { class: "hint" },
      "Used only to spell names right and add relevant context — never to surface personal details.",
    );
    social.appendChild(socialHint);
    ES.SOCIAL_NETWORKS.forEach((net) => {
      const input = el("input", {
        id: `f-sp-${index}-social-${net.key}`,
        type: "url",
        value: speaker.social[net.key] || "",
        placeholder: `${net.label} URL`,
        "aria-invalid": isInvalid(`speaker:${index}:social:${net.key}`) ? "true" : null,
      });
      input.addEventListener("input", (e) => {
        speaker.social[net.key] = e.target.value;
      });
      social.appendChild(field(net.label, input, `speaker:${index}:social:${net.key}`));
    });
    card.appendChild(social);

    return card;
  }

  function onContinue() {
    const result = ES.validateDraft(state);
    errors = result.errors;
    showErrors = true;
    if (result.ok) {
      renderWorkspace(ES.summarize(state));
    } else {
      renderSetup();
    }
  }

  function focusFirstError() {
    const keys = Object.keys(errors);
    if (!keys.length) {
      return;
    }
    const banner = document.getElementById("error-banner");
    if (banner) {
      banner.focus();
    }
    const target = document.getElementById(fieldId(keys[0]));
    if (target && typeof target.scrollIntoView === "function") {
      target.scrollIntoView({ block: "center" });
    }
  }

  // ---- Workspace summary view -------------------------------------------------

  function renderWorkspace(summary) {
    root.innerHTML = "";
    setStep("Step 1 of 6 · Episode workspace");

    const view = el("div", { class: "workspace" });
    view.appendChild(
      el(
        "div",
        { class: "workspace-head" },
        el("p", { class: "eyebrow" }, "Episode workspace"),
        el("h2", {}, summary.episodeName),
      ),
    );

    // Captured context
    const context = el(
      "section",
      { class: "card" },
      el("h3", {}, "Captured context"),
      el(
        "div",
        { class: "stats" },
        stat(summary.sourceModeLabel, "Source"),
        stat(String(summary.speakerCount), `Speaker${summary.speakerCount === 1 ? "" : "s"}`),
        stat(String(summary.socialLinkCount), `Social link${summary.socialLinkCount === 1 ? "" : "s"}`),
      ),
    );
    if (summary.riversideLink) {
      context.appendChild(
        el(
          "p",
          { class: "context-link" },
          "Recording: ",
          el("a", { href: summary.riversideLink, target: "_blank", rel: "noopener noreferrer" }, summary.riversideLink),
        ),
      );
    }
    view.appendChild(context);

    // Sources & speakers
    const sources = el("section", { class: "card" }, el("h3", {}, "Sources & speakers"));
    summary.speakers.forEach((speaker) => {
      const row = el(
        "div",
        { class: "summary-speaker" },
        el(
          "div",
          { class: "summary-speaker-main" },
          el("span", { class: "role-pill" }, speaker.role || "Unassigned"),
          el("span", { class: "summary-name" }, speaker.name || "Unnamed speaker"),
        ),
        el("p", { class: "summary-source" }, speaker.sourceLabel),
      );
      if (speaker.social.length) {
        const chips = el("div", { class: "chips" });
        speaker.social.forEach((link) => {
          chips.appendChild(
            el("a", { class: "chip", href: link.url, target: "_blank", rel: "noopener noreferrer" }, link.label),
          );
        });
        row.appendChild(chips);
      }
      sources.appendChild(row);
    });
    view.appendChild(sources);

    // Selected style (shown once a preset has been applied to the episode)
    if (STY && appliedStyle) {
      const styleCard = el(
        "section",
        { class: "card selected-style" },
        el("h3", {}, "Selected style"),
        el(
          "div",
          { class: "selected-style-body" },
          renderPreview(summary, styleSelection, true),
          el(
            "div",
            { class: "selected-style-meta" },
            el("p", { class: "selected-style-name" }, appliedStyle.presetName),
            el("p", { class: "hint" }, appliedStyle.tagline),
            el(
              "p",
              { class: "selected-style-facts" },
              `Layout: ${appliedStyle.layoutLabel} · Pacing: ${appliedStyle.pacingLabel} · Captions: ${appliedStyle.captionStyle}`,
            ),
          ),
        ),
      );
      view.appendChild(styleCard);
    }

    // Visual moments — the contextual editing layer (#19). Available once the episode
    // exists; summarizes what has been added and opens the moments editor.
    if (MO && momentsState) {
      const mo = MO.summarizeMoments(momentsState);
      const momentsCard = el(
        "section",
        { class: "card moments-card" },
        el("h3", {}, "Visual moments"),
        el(
          "p",
          { class: "hint" },
          mo.total
            ? `${mo.total} moment${mo.total === 1 ? "" : "s"} placed${mo.hidden ? ` · ${mo.hidden} hidden` : ""}. Captions, titles, b-roll, and callouts make the episode feel produced.`
            : "Add captions, title moments, b-roll, and callouts at key points so a long episode feels deliberately edited.",
        ),
      );
      if (mo.total) {
        const tags = el("div", { class: "chips" });
        MO.MOMENT_TYPES.forEach((type) => {
          const count = mo.byType[type.key] || 0;
          if (count) {
            tags.appendChild(el("span", { class: "chip" }, `${type.label} · ${count}`));
          }
        });
        momentsCard.appendChild(tags);
      }
      const momentsButton = el(
        "button",
        { type: "button", class: "primary" },
        mo.total ? "Edit visual moments →" : "Add visual moments →",
      );
      momentsButton.addEventListener("click", () => renderMoments(summary));
      momentsCard.appendChild(el("div", { class: "actions" }, momentsButton));
      view.appendChild(momentsCard);
    }

    // Next step — choose or change the visual style
    const styleAvailable = Boolean(STY);
    const styleButton = el(
      "button",
      { type: "button", class: "primary", disabled: styleAvailable ? null : true },
      appliedStyle ? "Change style →" : "Choose a style →",
    );
    if (styleAvailable) {
      styleButton.addEventListener("click", () => renderStyle(summary));
    }
    view.appendChild(
      el(
        "section",
        { class: "card next-step" },
        el("h3", {}, appliedStyle ? "Style applied" : "Ready for the next step"),
        el(
          "p",
          {},
          appliedStyle
            ? "Your style is set. Detailed editing and export come next."
            : "Your sources, speaker roles, and context are saved. Pick a visual style next.",
        ),
        el("div", { class: "actions" },
          styleButton,
          (function () {
            const back = el("button", { type: "button", class: "ghost" }, "← Edit setup");
            back.addEventListener("click", () => {
              showErrors = false;
              renderSetup();
            });
            return back;
          })(),
        ),
      ),
    );

    root.appendChild(view);
    view.scrollIntoView({ block: "start" });
  }

  // ---- Preset style selection + preview (#3) ----------------------------------

  // A live preview built from the real assigned speakers. `compact` renders the smaller
  // version shown on the workspace once a style is applied.
  function renderPreview(summary, selection, compact) {
    const preset = STY.getPreset(selection && selection.presetId);
    const frames = STY.buildPreviewFrames(summary.speakers, selection, summary.speakerCount);
    const layoutId = STY.resolveLayout(selection, summary.speakerCount);

    const stage = el("div", { class: `preview-stage stage-${layoutId}${compact ? " compact" : ""}` });
    stage.style.background = preset.background;
    stage.style.color = preset.textColor;

    const frameWrap = el("div", { class: "preview-frames" });
    frames.forEach((frame) => {
      const frameEl = el(
        "div",
        { class: `preview-frame${frame.active ? " active" : ""}` },
        el("span", { class: "preview-role" }, frame.role),
        el("span", { class: "preview-name" }, frame.name),
      );
      frameEl.style.borderColor = preset.accent;
      if (frame.active) {
        frameEl.style.boxShadow = `0 0 0 2px ${preset.accent}`;
      }
      frameWrap.appendChild(frameEl);
    });
    stage.appendChild(frameWrap);

    // Sample caption strip so the caption treatment is visible in the preview.
    const caption = el(
      "div",
      { class: "preview-caption" },
      el("span", { class: "preview-caption-text" }, "Sample caption — this is how on-screen text will look."),
    );
    caption.style.background = preset.accent;
    stage.appendChild(caption);

    if (!compact) {
      const foot = el(
        "p",
        { class: "preview-foot" },
        `${preset.captionStyle} · ${STY.getLayout(layoutId).label}`,
      );
      const container = el("div", {}, stage, foot);
      return container;
    }
    return stage;
  }

  function renderStyle(summary) {
    root.innerHTML = "";
    setStep("Step 2 of 6 · Choose a style");
    if (!styleSelection) {
      styleSelection = STY.createSelection();
    }

    const view = el("div", { class: "style-step" });
    view.appendChild(
      el(
        "div",
        { class: "workspace-head" },
        el("p", { class: "eyebrow" }, "Choose a style"),
        el("h2", {}, `Pick a look for ${summary.episodeName}`),
        el("p", { class: "hint" }, "Start from a preset, then fine-tune layout and pacing. The preview uses your real speakers."),
      ),
    );

    const layoutGrid = el("div", { class: "style-layout" });

    // Controls column
    const controls = el("section", { class: "card" }, el("h3", {}, "Style presets"));
    const presetGrid = el("div", { class: "preset-grid" });
    STY.STYLE_PRESETS.forEach((preset) => {
      const selected = styleSelection.presetId === preset.id;
      const card = el(
        "button",
        {
          type: "button",
          class: `preset-card${selected ? " selected" : ""}`,
          "aria-pressed": selected ? "true" : "false",
        },
        (function () {
          const swatch = el("span", { class: "preset-swatch" });
          swatch.style.background = preset.background;
          swatch.style.borderColor = preset.accent;
          const dot = el("span", { class: "preset-swatch-dot" });
          dot.style.background = preset.accent;
          swatch.appendChild(dot);
          return swatch;
        })(),
        el("span", { class: "preset-name" }, preset.name),
        el("span", { class: "preset-tagline" }, preset.tagline),
      );
      card.addEventListener("click", () => {
        styleSelection.presetId = preset.id;
        renderStyle(summary);
      });
      presetGrid.appendChild(card);
    });
    controls.appendChild(presetGrid);

    // Layout control
    const layoutSelect = el("select", { id: "style-layout" });
    STY.LAYOUTS.forEach((layout) => {
      layoutSelect.appendChild(
        el("option", { value: layout.id, selected: styleSelection.layout === layout.id ? true : null }, layout.label),
      );
    });
    layoutSelect.addEventListener("change", (e) => {
      styleSelection.layout = e.target.value;
      renderStyle(summary);
    });
    controls.appendChild(field("Layout", layoutSelect, null, "Auto matches the number of speakers you set up."));

    // Pacing control
    const pacingSelect = el("select", { id: "style-pacing" });
    STY.PACING.forEach((pacing) => {
      pacingSelect.appendChild(
        el("option", { value: pacing.id, selected: styleSelection.pacing === pacing.id ? true : null }, pacing.label),
      );
    });
    pacingSelect.addEventListener("change", (e) => {
      styleSelection.pacing = e.target.value;
      renderStyle(summary);
    });
    controls.appendChild(field("Pacing", pacingSelect, null, STY.getPacing(styleSelection.pacing).note));

    layoutGrid.appendChild(controls);

    // Preview column
    const previewCard = el(
      "section",
      { class: "card preview-card" },
      el("h3", {}, "Preview"),
      renderPreview(summary, styleSelection, false),
    );
    layoutGrid.appendChild(previewCard);

    view.appendChild(layoutGrid);

    // Actions
    const applyButton = el("button", { type: "button", class: "primary" }, "Apply style & continue →");
    applyButton.addEventListener("click", () => {
      appliedStyle = STY.summarizeStyle(styleSelection, summary.speakerCount);
      renderWorkspace(summary);
    });
    const back = el("button", { type: "button", class: "ghost" }, "← Back to workspace");
    back.addEventListener("click", () => renderWorkspace(summary));
    view.appendChild(el("div", { class: "actions" }, applyButton, back));

    root.appendChild(view);
    view.scrollIntoView({ block: "start" });
  }

  // ---- Visual moments editor (#19) --------------------------------------------

  // The preset look the moment preview borrows. Uses the applied style if one is set,
  // otherwise the currently selected preset, so the preview stays consistent with the show.
  function activePreset() {
    if (STY) {
      return STY.getPreset(styleSelection && styleSelection.presetId);
    }
    return { background: "#10131f", accent: "#ffb347", textColor: "#f6f7fb", captionStyle: "Lower-third" };
  }

  function currentCaptionStyle() {
    if (appliedStyle && appliedStyle.captionStyle) {
      return appliedStyle.captionStyle;
    }
    return activePreset().captionStyle;
  }

  // The on-screen overlay for a moment type, drawn over the preview stage.
  function buildOverlay(typeKey, text, preset) {
    if (typeKey === "title") {
      return el(
        "div",
        { class: "moment-overlay title-overlay" },
        el("span", { class: "moment-overlay-kicker" }, "Title"),
        el("span", { class: "moment-overlay-title" }, text),
      );
    }
    if (typeKey === "broll") {
      const overlay = el(
        "div",
        { class: "moment-overlay broll-overlay" },
        el("span", { class: "moment-overlay-kicker" }, "B-roll"),
        el("span", {}, text),
      );
      overlay.style.borderColor = preset.accent;
      return overlay;
    }
    if (typeKey === "callout") {
      const overlay = el("div", { class: "moment-overlay callout-overlay" }, text);
      overlay.style.background = preset.accent;
      overlay.style.color = "#10131f";
      return overlay;
    }
    const caption = el("div", { class: "moment-overlay caption-overlay" }, el("span", { class: "preview-caption-text" }, text));
    caption.style.background = preset.accent;
    caption.style.color = "#10131f";
    return caption;
  }

  // A preview stage showing the real speaker frames with the selected moment overlaid.
  function buildMomentStage(summary, moment) {
    const preset = activePreset();
    const type = MO.getMomentType(moment.type);
    const layoutId = STY ? STY.resolveLayout(styleSelection, summary.speakerCount) : "grid";
    const stage = el("div", {
      class: `preview-stage stage-${layoutId} moment-stage${moment.visible === false ? " is-hidden" : ""}`,
    });
    stage.style.background = preset.background;
    stage.style.color = preset.textColor;

    const frameWrap = el("div", { class: "preview-frames" });
    const frames = STY ? STY.buildPreviewFrames(summary.speakers, styleSelection, summary.speakerCount) : [];
    frames.forEach((frame) => {
      const frameEl = el(
        "div",
        { class: `preview-frame${frame.active ? " active" : ""}` },
        el("span", { class: "preview-role" }, frame.role),
        el("span", { class: "preview-name" }, frame.name),
      );
      frameEl.style.borderColor = preset.accent;
      frameWrap.appendChild(frameEl);
    });
    stage.appendChild(frameWrap);

    const text = (moment.text && moment.text.trim()) || type.defaultText;
    stage.appendChild(buildOverlay(type.key, text, preset));
    return stage;
  }

  // Repaint just the preview pane for the selected moment, without re-rendering the whole
  // editor — so typing in a moment's text never loses focus while the preview updates live.
  function paintPreview(summary, previewBody) {
    previewBody.innerHTML = "";
    const moment = selectedMomentId ? MO.findMoment(momentsState, selectedMomentId) : null;
    if (!moment) {
      previewBody.appendChild(
        el("p", { class: "hint" }, "Select a moment from the timeline to preview how it lands on screen."),
      );
      return;
    }
    const preview = MO.previewMoment(momentsState, moment.id, {
      speakers: summary.speakers,
      captionStyle: currentCaptionStyle(),
    });
    previewBody.appendChild(buildMomentStage(summary, moment));
    previewBody.appendChild(
      el(
        "p",
        { class: "preview-foot" },
        `${preview.treatment} · ${preview.timecode}` +
          (preview.speakerName ? ` · ${preview.speakerName}` : "") +
          (preview.visible ? "" : " · hidden"),
      ),
    );
  }

  function addMomentOfType(summary, typeKey) {
    const list = momentsState.moments;
    const last = list.length ? list[list.length - 1].atSeconds : -30;
    const at = MO.clampTime(last + 30, momentsState.durationSeconds);
    const type = MO.getMomentType(typeKey);
    const overrides = {};
    if (type.speakerAware) {
      overrides.speakerRole = (summary.roles && summary.roles[0]) || "";
    }
    const moment = MO.addMoment(momentsState, typeKey, at, overrides);
    selectedMomentId = moment.id;
    renderMoments(summary);
  }

  function renderMomentRow(summary, entry, previewBody) {
    const type = MO.getMomentType(entry.type);
    const row = el("div", {
      class: `moment-row${entry.id === selectedMomentId ? " selected" : ""}${entry.visible ? "" : " is-hidden"}`,
    });
    row.addEventListener("click", (event) => {
      if (event.target.closest("input, select, button")) {
        return;
      }
      selectedMomentId = entry.id;
      Array.from(row.parentNode.children).forEach((sibling) => {
        if (sibling.classList) {
          sibling.classList.remove("selected");
        }
      });
      row.classList.add("selected");
      paintPreview(summary, previewBody);
    });

    // Header: type, editable timecode, show/hide, remove.
    const timeInput = el("input", { class: "moment-time", type: "text", value: entry.timecode, "aria-label": "Moment time" });
    timeInput.addEventListener("change", (event) => {
      const seconds = MO.parseTimecode(event.target.value);
      if (seconds != null) {
        MO.updateMoment(momentsState, entry.id, { atSeconds: seconds });
      }
      renderMoments(summary);
    });
    const visButton = el("button", { type: "button", class: "link-button" }, entry.visible ? "Hide" : "Show");
    visButton.addEventListener("click", () => {
      MO.toggleVisible(momentsState, entry.id);
      renderMoments(summary);
    });
    const removeButton = el("button", { type: "button", class: "link-button" }, "Remove");
    removeButton.addEventListener("click", () => {
      MO.removeMoment(momentsState, entry.id);
      if (selectedMomentId === entry.id) {
        selectedMomentId = null;
      }
      renderMoments(summary);
    });
    row.appendChild(
      el(
        "div",
        { class: "moment-row-head" },
        el("span", { class: `moment-type-pill type-${entry.type}` }, entry.typeLabel),
        timeInput,
        el("div", { class: "moment-row-actions" }, visButton, removeButton),
      ),
    );

    // Text editor — live-updates the preview when this moment is selected.
    const textInput = el("input", { class: "moment-text", type: "text", value: entry.text, placeholder: type.defaultText });
    textInput.addEventListener("input", (event) => {
      MO.updateMoment(momentsState, entry.id, { text: event.target.value });
      if (entry.id === selectedMomentId) {
        paintPreview(summary, previewBody);
      }
    });
    row.appendChild(textInput);

    // Speaker assignment for speaker-aware moments (captions, callouts).
    if (type.speakerAware && summary.roles.length) {
      const select = el("select", { class: "moment-speaker", "aria-label": "Speaker for this moment" });
      select.appendChild(el("option", { value: "" }, "No speaker"));
      summary.roles.forEach((role) => {
        select.appendChild(el("option", { value: role, selected: entry.speakerRole === role ? true : null }, role));
      });
      select.addEventListener("change", (event) => {
        MO.updateMoment(momentsState, entry.id, { speakerRole: event.target.value });
        selectedMomentId = entry.id;
        paintPreview(summary, previewBody);
        row.classList.add("selected");
      });
      row.appendChild(select);
    }

    return row;
  }

  function renderMoments(summary) {
    root.innerHTML = "";
    setStep("Step 3 of 6 · Visual moments");
    if (!momentsState) {
      momentsState = MO.createMomentsState();
    }

    const view = el("div", { class: "moments-step" });
    view.appendChild(
      el(
        "div",
        { class: "workspace-head" },
        el("p", { class: "eyebrow" }, "Visual moments"),
        el("h2", {}, `Add visual moments to ${summary.episodeName}`),
        el(
          "p",
          { class: "hint" },
          "Place captions, title moments, b-roll, and callouts at key points so a long episode feels deliberately produced. The preview uses your real speakers and style.",
        ),
      ),
    );

    const previewBody = el("div", { class: "moment-preview-body" });

    // Add bar — one button per moment type.
    const addBar = el("div", { class: "moment-add-bar" });
    addBar.appendChild(el("span", { class: "moment-add-label" }, "Add a moment:"));
    MO.MOMENT_TYPES.forEach((type) => {
      const button = el("button", { type: "button", class: "ghost moment-add" }, `+ ${type.label}`);
      button.addEventListener("click", () => addMomentOfType(summary, type.key));
      addBar.appendChild(button);
    });

    // Timeline track with a marker per moment, positioned by time.
    const timeline = MO.buildTimeline(momentsState, summary.speakers);
    const track = el("div", { class: "moment-track" }, el("div", { class: "moment-track-line" }));
    timeline.forEach((entry) => {
      const marker = el("button", {
        type: "button",
        class: `moment-marker type-${entry.type}${entry.id === selectedMomentId ? " selected" : ""}${entry.visible ? "" : " is-hidden"}`,
        title: `${entry.typeLabel} · ${entry.timecode}`,
        "aria-label": `${entry.typeLabel} at ${entry.timecode}`,
      });
      marker.style.left = `${Math.round(entry.position * 100)}%`;
      marker.addEventListener("click", () => {
        selectedMomentId = entry.id;
        renderMoments(summary);
      });
      track.appendChild(marker);
    });
    const scale = el(
      "div",
      { class: "moment-track-scale" },
      el("span", {}, "0:00"),
      el("span", {}, MO.formatTimecode(momentsState.durationSeconds)),
    );

    // The editable list of moments.
    const list = el("div", { class: "moment-list" });
    if (!timeline.length) {
      list.appendChild(
        el("p", { class: "hint" }, "No moments yet — add a caption, title, b-roll, or callout to begin."),
      );
    } else {
      timeline.forEach((entry) => list.appendChild(renderMomentRow(summary, entry, previewBody)));
    }

    const editorCard = el(
      "section",
      { class: "card moments-editor" },
      el("h3", {}, "Episode timeline"),
      addBar,
      track,
      scale,
      list,
    );

    const previewCard = el("section", { class: "card preview-card" }, el("h3", {}, "Moment preview"), previewBody);
    paintPreview(summary, previewBody);

    view.appendChild(el("div", { class: "moments-layout" }, editorCard, previewCard));

    const doneButton = el("button", { type: "button", class: "primary" }, "Done — back to workspace");
    doneButton.addEventListener("click", () => renderWorkspace(summary));
    view.appendChild(el("div", { class: "actions" }, doneButton));

    root.appendChild(view);
    view.scrollIntoView({ block: "start" });
  }

  function stat(value, label) {
    return el("div", { class: "stat" }, el("span", { class: "stat-value" }, value), el("span", { class: "stat-label" }, label));
  }

  renderSetup();
}());
