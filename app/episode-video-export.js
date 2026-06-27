"use strict";

// Assembles a playable episode video from layout, speakers, and export choices (#30).
// Browser path records a short WebM from the arranged canvas layout; node tests cover plans.
(function (global) {
  function safeFileStem(name) {
    const trimmed = typeof name === "string" ? name.trim() : "";
    const stem = trimmed.replace(/[^\w\s-]/g, "").replace(/\s+/g, "-");
    return stem || "episode";
  }

  function resolutionDimensions(resolution) {
    if (resolution === "720p") {
      return { width: 1280, height: 720 };
    }
    return { width: 1920, height: 1080 };
  }

  function speakerInitials(name, role) {
    const source = String(name || role || "?").trim();
    const parts = source.split(/\s+/).filter(Boolean);
    if (!parts.length) {
      return "?";
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  }

  function buildAssemblyPlan(episodeSummary, context, exportState) {
    const episode = episodeSummary || {};
    const ctx = context || {};
    const job = exportState || {};
    const dims = resolutionDimensions(job.resolution || "1080p");
    const style = ctx.appliedStyle || {};
    const speakers = Array.isArray(episode.speakers) ? episode.speakers : [];
    const audio = ctx.audioPolish || {};
    return {
      episodeName: episode.episodeName || "Episode",
      width: dims.width,
      height: dims.height,
      resolution: job.resolution || "1080p",
      background: style.background || "#10131f",
      accent: style.accent || "#6c4cff",
      layoutId: style.layoutId || "split",
      presetName: style.presetName || "Clean",
      captionText: `${speakers[0] && speakers[0].name ? speakers[0].name.split(" ")[0] : "Host"}: Thanks for joining us today.`,
      speakers: speakers.map((speaker) => ({
        role: speaker.role || "Speaker",
        name: speaker.name || "Unnamed speaker",
        initials: speakerInitials(speaker.name, speaker.role),
      })),
      audioLine: audio.polishedTrackLine || audio.assetLine || "",
      durationSec: 2.5,
      fps: 15,
    };
  }

  function frameRects(plan, progress) {
    const w = plan.width;
    const h = plan.height;
    const pad = Math.round(w * 0.04);
    const speakers = plan.speakers.length ? plan.speakers : [{ role: "Host", name: "Host", initials: "H" }];
    const pulse = 0.85 + Math.sin(progress * Math.PI * 2) * 0.05;
    if (plan.layoutId === "grid") {
      const cols = speakers.length >= 3 ? 3 : speakers.length;
      const cellW = (w - pad * 2 - pad * (cols - 1)) / cols;
      const cellH = h * 0.42;
      const top = h * 0.22;
      return speakers.slice(0, cols).map((speaker, index) => ({
        speaker: speaker,
        x: pad + index * (cellW + pad),
        y: top,
        width: cellW * pulse,
        height: cellH * pulse,
      }));
    }
    if (plan.layoutId === "spotlight") {
      return speakers.map((speaker, index) => {
        const active = index === 0;
        const width = active ? w * 0.58 : w * 0.24;
        const height = active ? h * 0.52 : h * 0.3;
        const x = active ? pad : w - width - pad;
        const y = active ? h * 0.18 : h * 0.58;
        return { speaker: speaker, x: x, y: y, width: width * pulse, height: height * pulse, active: active };
      });
    }
    const mainW = w * 0.56;
    const sideW = w * 0.28;
    return speakers.map((speaker, index) => {
      if (index === 0) {
        return {
          speaker: speaker,
          x: pad,
          y: h * 0.18,
          width: mainW * pulse,
          height: h * 0.5 * pulse,
          active: true,
        };
      }
      const sideIndex = index - 1;
      return {
        speaker: speaker,
        x: w - sideW - pad,
        y: h * 0.18 + sideIndex * (h * 0.22),
        width: sideW,
        height: h * 0.18,
        active: false,
      };
    });
  }

  function drawEpisodeFrame(ctx, plan, progress) {
    const w = plan.width;
    const h = plan.height;
    ctx.fillStyle = plan.background;
    ctx.fillRect(0, 0, w, h);

    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.fillRect(0, 0, w, h * 0.12);
    ctx.fillStyle = "#ffffff";
    ctx.font = `700 ${Math.round(h * 0.035)}px system-ui, sans-serif`;
    ctx.fillText(plan.episodeName, Math.round(w * 0.04), Math.round(h * 0.075));
    ctx.fillStyle = plan.accent;
    ctx.font = `600 ${Math.round(h * 0.022)}px system-ui, sans-serif`;
    ctx.fillText(`${plan.presetName} · ${plan.layoutId} layout`, Math.round(w * 0.04), Math.round(h * 0.11));

    frameRects(plan, progress).forEach((rect) => {
      ctx.fillStyle = rect.active ? plan.accent : "rgba(255,255,255,0.12)";
      ctx.globalAlpha = rect.active ? 0.22 : 0.14;
      ctx.fillRect(rect.x, rect.y, rect.width, rect.height);
      ctx.globalAlpha = 1;
      ctx.strokeStyle = rect.active ? plan.accent : "rgba(255,255,255,0.35)";
      ctx.lineWidth = rect.active ? 4 : 2;
      ctx.strokeRect(rect.x, rect.y, rect.width, rect.height);
      ctx.fillStyle = "#ffffff";
      ctx.font = `700 ${Math.round(rect.height * 0.28)}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText(rect.speaker.initials, rect.x + rect.width / 2, rect.y + rect.height * 0.55);
      ctx.font = `600 ${Math.round(rect.height * 0.12)}px system-ui, sans-serif`;
      ctx.fillText(rect.speaker.name, rect.x + rect.width / 2, rect.y + rect.height * 0.78);
      ctx.textAlign = "left";
    });

    const captionY = h * 0.82;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(w * 0.08, captionY, w * 0.84, h * 0.1);
    ctx.fillStyle = "#ffffff";
    ctx.font = `600 ${Math.round(h * 0.03)}px system-ui, sans-serif`;
    ctx.fillText(plan.captionText, w * 0.1, captionY + h * 0.065);

    if (plan.audioLine) {
      ctx.fillStyle = "rgba(255,255,255,0.72)";
      ctx.font = `500 ${Math.round(h * 0.02)}px system-ui, sans-serif`;
      ctx.fillText(plan.audioLine, w * 0.1, h * 0.95);
    }
  }

  function pickRecorderMimeType() {
    if (typeof MediaRecorder === "undefined") {
      return "";
    }
    const candidates = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
    for (let i = 0; i < candidates.length; i += 1) {
      if (MediaRecorder.isTypeSupported(candidates[i])) {
        return candidates[i];
      }
    }
    return "";
  }

  function wait(ms) {
    return new Promise((resolve) => {
      setTimeout(resolve, ms);
    });
  }

  async function recordEpisodeVideo(plan) {
    if (typeof document === "undefined") {
      throw new Error("Video export requires a browser environment.");
    }
    const mimeType = pickRecorderMimeType();
    if (!mimeType) {
      throw new Error("This browser cannot record a playable episode video.");
    }
    const canvas = document.createElement("canvas");
    canvas.width = plan.width;
    canvas.height = plan.height;
    const ctx = canvas.getContext("2d");
    const fps = plan.fps || 15;
    const totalFrames = Math.max(1, Math.ceil((plan.durationSec || 2.5) * fps));
    const stream = canvas.captureStream(fps);
    const recorder = new MediaRecorder(stream, { mimeType: mimeType });
    const chunks = [];
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size) {
        chunks.push(event.data);
      }
    };
    const blobPromise = new Promise((resolve, reject) => {
      recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
      recorder.onerror = () => reject(recorder.error || new Error("Video recording failed."));
    });
    recorder.start(200);
    for (let frame = 0; frame < totalFrames; frame += 1) {
      drawEpisodeFrame(ctx, plan, frame / totalFrames);
      await wait(Math.ceil(1000 / fps));
    }
    recorder.stop();
    const blob = await blobPromise;
    const ext = mimeType.indexOf("webm") >= 0 ? "webm" : "mp4";
    return {
      blob: blob,
      mimeType: mimeType,
      fileName: `${safeFileStem(plan.episodeName)}-${plan.resolution}.${ext}`,
      durationSec: plan.durationSec,
    };
  }

  const api = {
    buildAssemblyPlan,
    drawEpisodeFrame,
    recordEpisodeVideo,
    resolutionDimensions,
    pickRecorderMimeType,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
    return;
  }

  global.PdcEpisodeVideoExport = api;
}(typeof window !== "undefined" ? window : globalThis));
