"use strict";

// Browser wiring for preset style selection (#4). Renders preset cards, layout/pacing
// controls, and a live speaker-aware preview. Loaded after episode-setup scripts.
(function () {
  const PS = window.PdcPresetStyles;
  const root = document.getElementById("app");
  const stepPill = document.querySelector(".step-pill");
  const intro = document.querySelector(".intro");

  if (!PS || !root) {
    return;
  }

  let episodeSummary = null;
  let styleDraft = PS.createDraft();
  let errors = {};
  let showErrors = false;
  let onApplied = null;

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

  function setStepLabel(text) {
    if (stepPill) {
      stepPill.textContent = text;
    }
  }

  function setIntro(title, body) {
    if (!intro) {
      return;
    }
    const h1 = intro.querySelector("h1");
    const p = intro.querySelector("p");
    if (h1) {
      h1.textContent = title;
    }
    if (p) {
      p.textContent = body;
    }
  }

  function renderPreviewStage(preview) {
    const preset = preview.preset;
    if (!preset) {
      return el(
        "div",
        { class: "preview-stage preview-stage--empty" },
        el("p", {}, "Choose a preset to see how your speakers will appear."),
      );
    }

    const stage = el("div", {
      class: `preview-stage preview-stage--${preset.key} preview-stage--${preset.frameStyle}`,
      style: `--preview-accent: ${preset.accent}; --preview-surface: ${preset.surface};`,
      "data-layout": preview.layout,
      "data-pacing": preview.pacing,
    });

    stage.appendChild(
      el(
        "div",
        { class: "preview-meta" },
        el("span", { class: "preview-preset-name" }, preset.label),
        el("span", { class: "preview-pacing-tag" }, preview.pacingLabel),
      ),
    );

    const grid = el("div", { class: "preview-grid" });
    preview.frames.forEach((frame) => {
      const tile = el(
        "div",
        {
          class: `preview-frame preview-frame--${frame.emphasis}`,
          style: `grid-column: ${frame.col} / span ${frame.colSpan}; grid-row: ${frame.row} / span ${frame.rowSpan};`,
        },
        el("span", { class: "preview-initials", "aria-hidden": "true" }, frame.initials),
        el("span", { class: "preview-role" }, frame.role),
        el("span", { class: "preview-name" }, frame.name),
      );
      grid.appendChild(tile);
    });
    stage.appendChild(grid);

    return stage;
  }

  function render() {
    root.innerHTML = "";
    const preview = PS.buildPreview(styleDraft, episodeSummary);

    const view = el("div", { class: "style-picker" });

    if (showErrors && errors.presetKey) {
      view.appendChild(
        el("div", { class: "banner", role: "alert" },
          el("strong", {}, "One thing to finish:"),
          el("p", {}, errors.presetKey),
        ),
      );
    }

    // Preset cards
    const presetsCard = el("section", { class: "card" },
      el("h2", {}, "Visual style presets"),
      el("p", { class: "hint" }, "Pick a look that fits your show — you can tune layout and pacing below."),
    );

    const presetGrid = el("div", { class: "preset-grid", role: "radiogroup", "aria-label": "Visual style presets" });
    PS.PRESETS.forEach((preset) => {
      const id = `preset-${preset.key}`;
      const selected = styleDraft.presetKey === preset.key;
      const input = el("input", {
        id,
        type: "radio",
        name: "presetKey",
        value: preset.key,
        checked: selected ? true : null,
      });
      input.addEventListener("change", () => {
        styleDraft.presetKey = preset.key;
        showErrors = false;
        render();
      });

      const swatch = el("span", {
        class: "preset-swatch",
        style: `background: linear-gradient(135deg, ${preset.accent}, ${preset.surface});`,
        "aria-hidden": "true",
      });

      presetGrid.appendChild(
        el("label", { class: "preset-card" + (selected ? " preset-card--selected" : ""), for: id },
          input,
          swatch,
          el("span", { class: "preset-label" }, preset.label),
          el("span", { class: "preset-desc" }, preset.description),
        ),
      );
    });
    presetsCard.appendChild(presetGrid);
    view.appendChild(presetsCard);

    // Layout + pacing
    const optionsCard = el("section", { class: "card style-options" },
      el("h2", {}, "Layout & pacing"),
    );

    const optionRow = el("div", { class: "option-row" });

    const layoutSelect = el("select", { id: "style-layout" });
    PS.LAYOUT_OPTIONS.forEach((opt) => {
      layoutSelect.appendChild(
        el("option", { value: opt.key, selected: styleDraft.layout === opt.key ? true : null }, opt.label),
      );
    });
    layoutSelect.addEventListener("change", (e) => {
      styleDraft.layout = e.target.value;
      render();
    });
    optionRow.appendChild(
      el("div", { class: "field" },
        el("label", { for: "style-layout" }, "Layout"),
        layoutSelect,
        el("p", { class: "hint" }, hintFor(PS.LAYOUT_OPTIONS, styleDraft.layout)),
      ),
    );

    const pacingSelect = el("select", { id: "style-pacing" });
    PS.PACING_OPTIONS.forEach((opt) => {
      pacingSelect.appendChild(
        el("option", { value: opt.key, selected: styleDraft.pacing === opt.key ? true : null }, opt.label),
      );
    });
    pacingSelect.addEventListener("change", (e) => {
      styleDraft.pacing = e.target.value;
      render();
    });
    optionRow.appendChild(
      el("div", { class: "field" },
        el("label", { for: "style-pacing" }, "Pacing"),
        pacingSelect,
        el("p", { class: "hint" }, hintFor(PS.PACING_OPTIONS, styleDraft.pacing)),
      ),
    );

    optionsCard.appendChild(optionRow);
    view.appendChild(optionsCard);

    // Live preview
    view.appendChild(
      el("section", { class: "card preview-card" },
        el("h2", {}, "Live preview"),
        el("p", { class: "hint" }, "How your Host and guest buckets will appear with this style."),
        renderPreviewStage(preview),
      ),
    );

    view.appendChild(
      el("div", { class: "actions" },
        el("button", { type: "button", class: "primary", onclick: onApply }, "Apply style & continue →"),
        el("button", { type: "button", class: "ghost", onclick: onBack }, "← Back to workspace"),
      ),
    );

    root.appendChild(view);
  }

  function hintFor(options, key) {
    const found = options.find((o) => o.key === key);
    return found ? found.hint : "";
  }

  function onApply() {
    const result = PS.validateDraft(styleDraft);
    errors = result.errors;
    showErrors = true;
    if (result.ok && typeof onApplied === "function") {
      onApplied({
        styleDraft: Object.assign({}, styleDraft),
        styleSummary: PS.summarize(styleDraft, episodeSummary),
      });
    } else {
      render();
    }
  }

  function onBack() {
    if (typeof onApplied === "function") {
      onApplied(null);
    }
  }

  window.PdcPresetStylesUI = {
    open(summary, appliedStyle, callback) {
      episodeSummary = summary;
      styleDraft = appliedStyle && appliedStyle.presetKey
        ? Object.assign(PS.createDraft(), appliedStyle)
        : PS.createDraft();
      errors = {};
      showErrors = false;
      onApplied = callback;
      setStepLabel("Step 2 of 6 · Choose a style");
      setIntro(
        "Choose your episode look",
        "Pick a preset visual style, adjust layout and pacing, and preview how your speakers will appear before you continue.",
      );
      render();
      root.scrollIntoView({ block: "start" });
    },
  };
}());
