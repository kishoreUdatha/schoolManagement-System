// Offline Kokoro v1.0 voice: node say.mjs <voice> <speed> <text-file> <out.wav>
import fs from "fs";
import * as ort from "onnxruntime-node";
import { KokoroTTS } from "kokoro-js";
const [voice = "hf_alpha", speed = "1.05", inFile, outFile] = process.argv.slice(2);
const DIR = new URL(".", import.meta.url).pathname;
const vocab = new Map(fs.readFileSync(DIR + "tokens.txt", "utf8").split("\n").filter(Boolean).map((l) => { const i = l.lastIndexOf(" "); return [l.slice(0, i), Number(l.slice(i + 1))]; }));
const session = await ort.InferenceSession.create(DIR + "model_quantized.onnx");
const tokenizer = (phonemes) => {
  const ids = [0]; for (const ch of phonemes) { if (vocab.has(ch)) ids.push(vocab.get(ch)); } ids.push(0);
  const data = BigInt64Array.from(ids.slice(0, 512).map(BigInt));
  return { input_ids: { data, dims: [1, data.length] } };
};
const model = async ({ input_ids, style, speed }) => {
  const out = await session.run({
    input_ids: new ort.Tensor("int64", input_ids.data, input_ids.dims),
    style: new ort.Tensor("float32", Float32Array.from(style.data), style.dims),
    speed: new ort.Tensor("float32", Float32Array.from(speed.data), speed.dims),
  });
  return { waveform: out[Object.keys(out)[0]] };
};
const tts = new KokoroTTS(model, tokenizer);
tts._validate_voice = () => (process.env.KOKORO_LANG || "a");
const text = fs.readFileSync(inFile, "utf8").trim();
// Long lines are voiced sentence by sentence and joined, with a short breath between.
const parts = text.match(/[^.!?]+[.!?]*/g).map((s) => s.trim()).filter(Boolean);
const chunks = [];
for (const p of parts) { const a = await tts.generate(p, { voice, speed: Number(speed) }); chunks.push(a.audio); chunks.push(new Float32Array(Math.round(24000 * 0.12))); }
const total = chunks.reduce((n, c) => n + c.length, 0), pcm = new Float32Array(total); let o = 0; for (const c of chunks) { pcm.set(c, o); o += c.length; }
let peak = 0; for (const v of pcm) peak = Math.max(peak, Math.abs(v)); const gain = peak > 0 ? 0.89 / peak : 1; for (let i = 0; i < total; i++) pcm[i] *= gain;
const buf = Buffer.alloc(44 + total * 2); buf.write("RIFF", 0); buf.writeUInt32LE(36 + total * 2, 4); buf.write("WAVEfmt ", 8); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(24000, 24); buf.writeUInt32LE(48000, 28); buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write("data", 36); buf.writeUInt32LE(total * 2, 40);
for (let i = 0; i < total; i++) buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(pcm[i] * 32767))), 44 + i * 2);
fs.writeFileSync(outFile, buf);
console.log(`${voice} ${(total / 24000).toFixed(1)}s`);
