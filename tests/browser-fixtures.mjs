// Shared browser-test fixtures (valid minimal WAV bytes for polish apply paths).
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const audio = require("../app/audio-polish.js");

let cachedBytes = null;
let cachedBase64 = null;

export function minimalWavBytes() {
  if (!cachedBytes) {
    const samples = new Float32Array(4000);
    for (let i = 0; i < samples.length; i += 1) {
      samples[i] = Math.sin(i / 50) * 0.1;
    }
    cachedBytes = Buffer.from(audio.encodeWav(samples, 8000));
  }
  return cachedBytes;
}

export function minimalWavBase64() {
  if (!cachedBase64) {
    cachedBase64 = minimalWavBytes().toString("base64");
  }
  return cachedBase64;
}

export function minimalWavFile(name) {
  return {
    name,
    mimeType: "audio/wav",
    buffer: minimalWavBytes(),
  };
}
