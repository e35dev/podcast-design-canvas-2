"use strict";

// Browser wiring for the episode setup flow (#1) and the preset style step (#4). Renders
// the setup wizard, the episode workspace, and the preset style selection + preview from
// the shared PdcEpisodeSetup / PdcEpisodeStyle rules. Loaded as a classic script so the
// app runs by opening index.html directly or via `npm run preview`.
(function () {
  const ES = window.PdcEpisodeSetup;
  const STY = window.PdcEpisodeStyle;
  const CE = window.PdcCanvasEditor;
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
  let layoutCustomized = false;
  // Canvas editor (#11) state, kept across navigation so a customized layout and the saved
  // show templates survive Back / Edit setup. The template store persists in localStorage so
  // saved templates are available for future episodes.
  let canvasDesign = null;
  let canvasFlash = null;
  const templateStore = CE
    ? CE.createTemplateStore(typeof window !== "undefined" && window.localStorage ? window.localStorage : null)
    : null;

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
        el("button", { type: "submit", class: "primary" }, "Continue to style →"),
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
      const summary = ES.summarize(state);
      if (STY && !appliedStyle) {
        renderStyle(summary);
      } else {
        renderWorkspace(summary);
      }
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
    // Once a style is applied, the canvas editor is the real next step: open the chosen
    // preset as a starting point and personalize it into a reusable show layout.
    const canvasAvailable = Boolean(CE && appliedStyle);
    const canvasButton = canvasAvailable
      ? (function () {
          const button = el("button", { type: "button", class: "primary" }, "Open canvas editor →");
          button.addEventListener("click", () => {
            if (!canvasDesign) {
              canvasDesign = CE.openDesign(appliedStyle, summary);
            }
            renderCanvas(summary);
          });
          return button;
        })()
      : null;

    view.appendChild(
      el(
        "section",
        { class: "card next-step" },
        el("h3", {}, appliedStyle ? "Style applied" : "Ready for the next step"),
        el(
          "p",
          {},
          appliedStyle
            ? "Your style is set. Open the canvas editor to make it your own and save it as a reusable show template."
            : "Your sources, speaker roles, and context are saved. Pick a visual style next.",
        ),
        el("div", { class: "actions" },
          canvasButton,
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

    // Saved show templates are available for every future episode. Reselecting one opens the
    // canvas editor with that saved identity, re-adapted to this episode's speakers.
    if (CE && templateStore) {
      const saved = templateStore.list();
      if (saved.length) {
        const templatesCard = el(
          "section",
          { class: "card templates-card" },
          el("h3", {}, "Saved show templates"),
          el("p", { class: "hint" }, "Reuse a saved look on this episode — the layout adapts to your current speakers."),
        );
        const list = el("div", { class: "template-list" });
        saved.forEach((template) => {
          const useButton = el("button", { type: "button", class: "ghost" }, "Use template");
          useButton.addEventListener("click", () => {
            canvasDesign = CE.applyTemplate(template, summary);
            renderCanvas(summary);
          });
          list.appendChild(
            el(
              "div",
              { class: "template-row" },
              el(
                "div",
                { class: "template-meta" },
                el("span", { class: "template-name" }, template.name),
                el("span", { class: "hint" }, `${template.presetName} · ${template.layoutLabel} · ${template.speakerCount} speaker${template.speakerCount === 1 ? "" : "s"}`),
              ),
              useButton,
            ),
          );
        });
        templatesCard.appendChild(list);
        view.appendChild(templatesCard);
      }
    }

    root.appendChild(view);
    view.scrollIntoView({ block: "start" });
  }

  // ---- Preset style selection + preview (#4) ----------------------------------

  // A live preview built from the real assigned speakers. `compact` renders the smaller
  // version shown on the workspace once a style is applied.
  function renderPreview(summary, selection, compact) {
    const preset = STY.getPreset(selection && selection.presetId);
    const pacing = STY.getPacing(selection && selection.pacing);
    const frames = STY.buildPreviewFrames(summary.speakers, selection, summary.speakerCount);
    const layoutId = STY.resolveLayout(selection, summary.speakerCount);

    const stage = el("div", {
      class: `preview-stage stage-${layoutId} pacing-${pacing.id}${compact ? " compact" : ""}`,
    });
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
        `${pacing.label} pacing · ${preset.captionStyle} · ${STY.getLayout(layoutId).label}`,
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
        styleSelection = STY.applyPresetToSelection(styleSelection, preset.id, layoutCustomized);
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
      layoutCustomized = styleSelection.layout !== "auto";
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

  // ---- Canvas editor (#11) ----------------------------------------------------

  // The live canvas. Every element is drawn from the current design and updated in place as
  // the creator edits, so a reviewer sees the layout change without reloading. User text is
  // added as text nodes (never innerHTML), so renaming a frame or title is XSS-safe.
  function buildCanvasStage(design) {
    const stage = el("div", { class: `canvas-stage stage-${design.layoutId}` });
    stage.style.background = design.background;
    stage.style.color = design.textColor;

    if (design.title.visible && design.title.text) {
      stage.appendChild(el("div", { class: "canvas-title" }, design.title.text));
    }

    const frameWrap = el("div", { class: "canvas-frames" });
    design.frames.forEach((frame) => {
      const frameEl = el(
        "div",
        { class: "canvas-frame" },
        el("span", { class: "canvas-frame-role" }, frame.role),
        frame.showLabel ? el("span", { class: "canvas-frame-label" }, frame.label) : null,
      );
      frameEl.style.borderColor = design.accent;
      frameWrap.appendChild(frameEl);
    });
    stage.appendChild(frameWrap);

    if (design.caption.visible && design.caption.text) {
      const cap = el("div", { class: `canvas-caption cap-${design.caption.style}` }, design.caption.text);
      cap.style.background = design.accent;
      stage.appendChild(cap);
    }

    if (design.overlay.visible && design.overlay.text) {
      const overlay = el("div", { class: "canvas-overlay" }, design.overlay.text);
      overlay.style.borderColor = design.accent;
      stage.appendChild(overlay);
    }

    return stage;
  }

  function renderCanvas(summary) {
    root.innerHTML = "";
    setStep("Step 3 of 6 · Canvas editor");
    if (!CE) {
      renderWorkspace(summary);
      return;
    }
    if (!canvasDesign) {
      canvasDesign = CE.openDesign(appliedStyle, summary);
    }
    const design = canvasDesign;

    const view = el("div", { class: "canvas-step" });
    view.appendChild(
      el(
        "div",
        { class: "workspace-head" },
        el("p", { class: "eyebrow" }, "Canvas editor"),
        el("h2", {}, `Design ${summary.episodeName}`),
        el("p", { class: "hint" }, `Started from ${design.presetName}. Adjust the layout elements, then save it as a reusable show template.`),
      ),
    );

    if (canvasFlash) {
      view.appendChild(el("div", { class: "banner success", role: "status" }, canvasFlash));
      canvasFlash = null;
    }

    const grid = el("div", { class: "canvas-layout" });

    // Live preview (repainted in place on each edit so text inputs keep focus).
    const stageHolder = el("div", { class: "canvas-stage-holder" });
    function paintStage() {
      stageHolder.innerHTML = "";
      stageHolder.appendChild(buildCanvasStage(design));
    }
    paintStage();
    grid.appendChild(el("section", { class: "card preview-card" }, el("h3", {}, "Live canvas"), stageHolder));

    // Element controls.
    const controls = el("section", { class: "card" }, el("h3", {}, "Layout elements"));

    function toggleRow(labelText, checked, onChange) {
      const box = el("input", { type: "checkbox", checked: checked ? true : null });
      box.addEventListener("change", () => onChange(box));
      return el("label", { class: "toggle-row" }, box, el("span", {}, labelText));
    }

    // Background
    const bgInput = el("input", { id: "canvas-bg", type: "color", value: design.background });
    bgInput.addEventListener("input", (e) => { CE.setBackground(design, e.target.value); paintStage(); });
    controls.appendChild(field("Background", bgInput, null, "Set your show's backdrop color."));

    // Title text + visibility
    const titleInput = el("input", { id: "canvas-title", type: "text", value: design.title.text, placeholder: "Show / episode title" });
    titleInput.addEventListener("input", (e) => { CE.setTitleText(design, e.target.value); paintStage(); });
    controls.appendChild(field("Title text", titleInput, null));
    controls.appendChild(toggleRow("Show title on canvas", design.title.visible, (box) => {
      CE.toggleElement(design, "title"); box.checked = design.title.visible; paintStage();
    }));

    // Caption text + style + visibility
    const captionInput = el("input", { id: "canvas-caption", type: "text", value: design.caption.text, placeholder: "Sample caption text" });
    captionInput.addEventListener("input", (e) => { CE.setCaptionText(design, e.target.value); paintStage(); });
    controls.appendChild(field("Caption text", captionInput, null));
    const captionStyle = el("select", { id: "canvas-caption-style" });
    CE.CAPTION_STYLES.forEach((styleOption) => {
      captionStyle.appendChild(el("option", { value: styleOption.id, selected: design.caption.style === styleOption.id ? true : null }, styleOption.label));
    });
    captionStyle.addEventListener("change", (e) => { CE.setCaptionStyle(design, e.target.value); paintStage(); });
    controls.appendChild(field("Caption style", captionStyle, null));
    controls.appendChild(toggleRow("Show captions on canvas", design.caption.visible, (box) => {
      CE.toggleElement(design, "caption"); box.checked = design.caption.visible; paintStage();
    }));

    // Overlay area
    const overlayInput = el("input", { id: "canvas-overlay", type: "text", value: design.overlay.text, placeholder: "e.g. @yourshow" });
    overlayInput.addEventListener("input", (e) => { CE.setOverlayText(design, e.target.value); paintStage(); });
    controls.appendChild(field("Overlay area", overlayInput, null, "A corner handle, brand tag, or b-roll placeholder."));
    controls.appendChild(toggleRow("Show overlay on canvas", design.overlay.visible, (box) => {
      CE.toggleElement(design, "overlay"); box.checked = design.overlay.visible; paintStage();
    }));

    // Speaker frames
    const framesWrap = el("div", { class: "frame-controls" });
    framesWrap.appendChild(el("h4", {}, "Speaker frames"));
    design.frames.forEach((frame, index) => {
      const labelInput = el("input", { id: `canvas-frame-${index}`, type: "text", value: frame.label, placeholder: frame.name });
      labelInput.addEventListener("input", (e) => { CE.setFrameLabel(design, index, e.target.value); paintStage(); });
      framesWrap.appendChild(field(`${frame.role} nameplate`, labelInput, null));
      framesWrap.appendChild(toggleRow("Show nameplate", frame.showLabel, (box) => {
        CE.toggleElement(design, `frame:${index}`); box.checked = design.frames[index].showLabel; paintStage();
      }));
    });
    controls.appendChild(framesWrap);

    grid.appendChild(controls);
    view.appendChild(grid);

    // Save as a reusable show template.
    const saveCard = el("section", { class: "card save-template" }, el("h3", {}, "Save as show template"));
    saveCard.appendChild(el("p", { class: "hint" }, "Save this look so future episodes can reuse the same identity while adapting to their own speakers."));
    const nameInput = el("input", { id: "template-name", type: "text", placeholder: "e.g. Founders Show look" });
    const saveError = el("p", { class: "field-error", role: "alert" });
    saveError.style.display = "none";
    saveCard.appendChild(field("Template name", nameInput, null));
    saveCard.appendChild(saveError);
    const saveButton = el("button", { type: "button", class: "primary" }, "Save show template");
    saveButton.addEventListener("click", () => {
      const result = templateStore.save(nameInput.value, design);
      if (result.ok) {
        canvasFlash = `Saved “${result.template.name}” — it's now available for future episodes.`;
        renderCanvas(summary);
      } else {
        saveError.textContent = result.error;
        saveError.style.display = "";
        nameInput.focus();
      }
    });
    saveCard.appendChild(el("div", { class: "actions" }, saveButton));

    // Saved templates available for reuse.
    const saved = templateStore.list();
    if (saved.length) {
      const list = el("div", { class: "template-list" });
      saved.forEach((template) => {
        const useButton = el("button", { type: "button", class: "ghost" }, "Use this template");
        useButton.addEventListener("click", () => {
          canvasDesign = CE.applyTemplate(template, summary);
          canvasFlash = `Reselected “${template.name}” — adapted to this episode's speakers.`;
          renderCanvas(summary);
        });
        list.appendChild(
          el(
            "div",
            { class: "template-row" },
            el(
              "div",
              { class: "template-meta" },
              el("span", { class: "template-name" }, template.name),
              el("span", { class: "hint" }, `${template.presetName} · ${template.layoutLabel}`),
            ),
            useButton,
          ),
        );
      });
      saveCard.appendChild(el("h4", {}, "Saved templates"));
      saveCard.appendChild(list);
    }
    view.appendChild(saveCard);

    // Navigation back to the workspace.
    const done = el("button", { type: "button", class: "primary" }, "Done → workspace");
    done.addEventListener("click", () => renderWorkspace(summary));
    const back = el("button", { type: "button", class: "ghost" }, "← Back to workspace");
    back.addEventListener("click", () => renderWorkspace(summary));
    view.appendChild(el("div", { class: "actions" }, done, back));

    root.appendChild(view);
    view.scrollIntoView({ block: "start" });
  }

  function stat(value, label) {
    return el("div", { class: "stat" }, el("span", { class: "stat-value" }, value), el("span", { class: "stat-label" }, label));
  }

  renderSetup();
}());
