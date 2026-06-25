"use strict";

// Browser UI for the canvas editor step (#11). Renders the layout element controls,
// a live canvas preview, save-as-template form, and saved-template list. Loaded as a
// classic script; exposes window.PdcCanvasEditorUI. Depends on PdcCanvasEditor.
(function (global) {
  const CE = global.PdcCanvasEditor;
  if (!CE) { return; }

  // Tiny DOM helper matching the one in episode-setup.ui.js.
  function el(tag, attrs) {
    const node = document.createElement(tag);
    const props = attrs || {};
    Object.keys(props).forEach((key) => {
      const value = props[key];
      if (value == null || value === false) { return; }
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
      const child = arguments[i];
      if (child == null || child === false) { continue; }
      if (typeof child === "string") {
        node.appendChild(document.createTextNode(child));
      } else {
        node.appendChild(child);
      }
    }
    return node;
  }

  // Render the canvas preview using the current template's customisations on top of the
  // base style. Updates in-place every time an element is changed.
  function renderPreviewInto(stage, template, styleApplied) {
    stage.innerHTML = "";
    const bg = (template.elements.find((e) => e.id === "background") || {}).customizations || {};
    const frame = (template.elements.find((e) => e.id === "speaker-frame") || {}).customizations || {};
    const caption = (template.elements.find((e) => e.id === "caption-bar") || {}).customizations || {};
    const title = (template.elements.find((e) => e.id === "title-text") || {}).customizations || {};
    const overlay = (template.elements.find((e) => e.id === "overlay") || {}).customizations || {};

    const baseBg = styleApplied ? styleApplied.background : "#1b1c2e";
    const baseAccent = styleApplied ? styleApplied.accent : "#6c4cff";

    stage.style.background = bg.color || baseBg;

    // Overlay layer
    if (overlay.opacity && overlay.opacity > 0) {
      const ov = el("div", { class: "ce-preview-overlay" });
      ov.style.background = overlay.color || "#000000";
      ov.style.opacity = String(Math.min(1, (overlay.opacity || 0) / 100));
      stage.appendChild(ov);
    }

    // Speaker frame area
    const frameWrap = el("div", { class: "ce-preview-frames" });
    const frameEl = el("div", { class: "ce-preview-frame" });
    frameEl.style.borderRadius = `${frame.borderRadius != null ? frame.borderRadius : 10}px`;
    frameEl.style.borderColor = frame.borderColor || baseAccent;
    frameEl.style.borderWidth = frame.frameSize === "lg" ? "3px" : frame.frameSize === "sm" ? "1px" : "2px";
    frameEl.appendChild(el("span", { class: "ce-preview-frame-label" }, "Speaker frames"));
    frameWrap.appendChild(frameEl);
    stage.appendChild(frameWrap);

    // Title text
    const titleContent = title.content || "Episode title";
    const titleEl = el("div", { class: "ce-preview-title" }, titleContent);
    titleEl.style.fontSize = `${title.fontSize || 14}px`;
    titleEl.style.color = title.color || (styleApplied ? styleApplied.accent : "#ffffff");
    stage.appendChild(titleEl);

    // Caption bar
    const captionBar = el("div", { class: "ce-preview-caption" }, "Sample caption text");
    captionBar.style.fontSize = `${caption.fontSize || 13}px`;
    captionBar.style.opacity = String(caption.bgOpacity != null ? Math.min(1, caption.bgOpacity / 100) : 0.9);
    captionBar.style.background = baseAccent;
    captionBar.style.marginTop = caption.position === "top" ? "0" : "auto";
    stage.appendChild(captionBar);
  }

  // Build the controls section for a single element type.
  function buildElementControls(type, template, onUpdate) {
    const el_data = template.elements.find((e) => e.id === type.id) || { customizations: {} };
    const cust = el_data.customizations;

    const card = el("div", { class: "ce-element-card" });
    card.appendChild(el("h4", { class: "ce-element-label" }, type.label));

    type.props.forEach((prop) => {
      const controlId = `ce-${type.id}-${prop}`;
      const row = el("div", { class: "ce-control-row" });
      row.appendChild(el("label", { for: controlId, class: "ce-control-label" }, prop));

      let input;
      if (prop === "color" || prop === "borderColor") {
        input = el("input", { id: controlId, type: "color", value: cust[prop] || "#6c4cff" });
        input.addEventListener("input", (e) => { onUpdate(type.id, { [prop]: e.target.value }); });
      } else if (prop === "opacity" || prop === "bgOpacity") {
        input = el("input", { id: controlId, type: "range", min: "0", max: "100", value: String(cust[prop] != null ? cust[prop] : 0) });
        input.addEventListener("input", (e) => { onUpdate(type.id, { [prop]: Number(e.target.value) }); });
      } else if (prop === "fontSize") {
        input = el("input", { id: controlId, type: "number", min: "10", max: "72", value: String(cust[prop] || 14) });
        input.addEventListener("input", (e) => { onUpdate(type.id, { [prop]: Number(e.target.value) }); });
      } else if (prop === "borderRadius") {
        input = el("input", { id: controlId, type: "number", min: "0", max: "50", value: String(cust[prop] != null ? cust[prop] : 10) });
        input.addEventListener("input", (e) => { onUpdate(type.id, { [prop]: Number(e.target.value) }); });
      } else if (prop === "frameSize") {
        input = el("select", { id: controlId });
        ["sm", "md", "lg"].forEach((opt) => {
          input.appendChild(el("option", { value: opt, selected: cust[prop] === opt ? true : null }, opt));
        });
        input.addEventListener("change", (e) => { onUpdate(type.id, { [prop]: e.target.value }); });
      } else if (prop === "position") {
        input = el("select", { id: controlId });
        ["bottom", "top"].forEach((opt) => {
          input.appendChild(el("option", { value: opt, selected: cust[prop] === opt ? true : null }, opt));
        });
        input.addEventListener("change", (e) => { onUpdate(type.id, { [prop]: e.target.value }); });
      } else if (prop === "content") {
        input = el("input", { id: controlId, type: "text", value: cust[prop] || "", placeholder: "Episode title" });
        input.addEventListener("input", (e) => { onUpdate(type.id, { [prop]: e.target.value }); });
      } else {
        input = el("input", { id: controlId, type: "text", value: cust[prop] || "" });
        input.addEventListener("input", (e) => { onUpdate(type.id, { [prop]: e.target.value }); });
      }

      row.appendChild(input);
      card.appendChild(row);
    });

    return card;
  }

  // Main entry point. Called from episode-setup.ui.js when the creator clicks
  // "Open canvas editor →".
  //
  // rootEl      — the #app container
  // summary     — episode summary from PdcEpisodeSetup.summarize()
  // styleApplied — result of PdcEpisodeStyle.summarizeStyle() already applied
  // store       — plain object used as the template store (caller owns lifetime)
  // onSave      — callback(template, store) called after a successful save
  // onBack      — callback() to return to the previous view
  function renderCanvasEditor(rootEl, summary, styleApplied, store, onSave, onBack) {
    rootEl.innerHTML = "";

    // Initialise or carry forward the template being edited.
    let template = CE.createTemplate(
      (summary && summary.episodeName) || "My Show Layout",
      styleApplied
        ? { presetId: styleApplied.presetId, layout: styleApplied.layoutId, pacing: styleApplied.pacingId }
        : null
    );

    let templateNameValue = template.name;
    let saveError = "";

    function rebuild() {
      renderCanvasEditor(rootEl, summary, styleApplied, store, onSave, onBack);
    }

    const view = el("div", { class: "ce-view" });

    // Header
    view.appendChild(
      el("div", { class: "workspace-head" },
        el("p", { class: "eyebrow" }, "Canvas editor"),
        el("h2", {}, `Customise: ${styleApplied ? styleApplied.presetName : "Layout"}`),
        el("p", { class: "hint" }, "Adjust each layout element, then save as a named show template for reuse."),
      )
    );

    const body = el("div", { class: "ce-body" });

    // Left column: element controls
    const controls = el("section", { class: "card ce-controls" });
    controls.appendChild(el("h3", {}, "Layout elements"));

    CE.ELEMENT_TYPES.forEach((type) => {
      controls.appendChild(
        buildElementControls(type, template, (elementId, changes) => {
          CE.updateElement(template, elementId, changes);
          const stage = rootEl.querySelector(".ce-preview-stage");
          if (stage) { renderPreviewInto(stage, template, styleApplied); }
        })
      );
    });

    body.appendChild(controls);

    // Right column: live preview
    const previewCard = el("section", { class: "card ce-preview-card" });
    previewCard.appendChild(el("h3", {}, "Live preview"));
    const stage = el("div", { class: "ce-preview-stage" });
    renderPreviewInto(stage, template, styleApplied);
    previewCard.appendChild(stage);
    body.appendChild(previewCard);

    view.appendChild(body);

    // Save form
    const saveCard = el("section", { class: "card ce-save-card" });
    saveCard.appendChild(el("h3", {}, "Save as show template"));
    saveCard.appendChild(el("p", { class: "hint" }, "Give this layout a name to reuse it for future episodes."));

    const nameInput = el("input", { id: "ce-template-name", type: "text", value: templateNameValue, placeholder: "e.g. Design Matters Layout" });
    nameInput.addEventListener("input", (e) => { templateNameValue = e.target.value; });

    const nameField = el("div", { class: "field" },
      el("label", { for: "ce-template-name" }, "Template name"),
      nameInput,
    );
    saveCard.appendChild(nameField);

    if (saveError) {
      saveCard.appendChild(el("p", { class: "field-error", role: "alert" }, saveError));
    }

    const saveBtn = el("button", { type: "button", class: "primary" }, "Save template →");
    saveBtn.addEventListener("click", () => {
      template.name = templateNameValue.trim();
      const result = CE.saveTemplate(store, template);
      if (!result.ok) {
        saveError = result.error;
        rebuild();
        return;
      }
      onSave(CE.getTemplate(store, result.name), store);
    });

    saveCard.appendChild(el("div", { class: "actions" }, saveBtn));
    view.appendChild(saveCard);

    // Saved templates list
    const saved = CE.listTemplates(store);
    if (saved.length > 0) {
      const listCard = el("section", { class: "card ce-saved-list" });
      listCard.appendChild(el("h3", {}, "Saved show templates"));
      saved.forEach((tmpl) => {
        const row = el("div", { class: "ce-saved-row" });
        row.appendChild(el("span", { class: "ce-saved-name" }, tmpl.name));
        row.appendChild(el("span", { class: "ce-saved-preset" }, tmpl.presetId || ""));
        const loadBtn = el("button", { type: "button", class: "ghost ce-load-btn" }, "Load");
        loadBtn.addEventListener("click", () => {
          template = JSON.parse(JSON.stringify(tmpl));
          templateNameValue = template.name;
          rebuild();
        });
        row.appendChild(loadBtn);
        listCard.appendChild(row);
      });
      view.appendChild(listCard);
    }

    // Back action
    const backBtn = el("button", { type: "button", class: "ghost" }, "← Back to workspace");
    backBtn.addEventListener("click", onBack);
    view.appendChild(el("div", { class: "actions ce-back" }, backBtn));

    rootEl.appendChild(view);
    view.scrollIntoView({ block: "start" });
  }

  global.PdcCanvasEditorUI = { renderCanvasEditor };
}(typeof window !== "undefined" ? window : globalThis));
