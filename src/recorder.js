// Enregistreur audio universel : produit un WAV 16 kHz mono (16-bit).
// Le WAV se lit sur Android ET iOS (contrairement au WebM de MediaRecorder).
let ctx, source, processor, stream, buffers = [], srcRate = 44100;

export async function demarrerEnregistrement() {
  stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  ctx = new (window.AudioContext || window.webkitAudioContext)();
  if (ctx.state === "suspended") { try { await ctx.resume(); } catch { /* ignore */ } }
  srcRate = ctx.sampleRate;
  source = ctx.createMediaStreamSource(stream);
  processor = ctx.createScriptProcessor(4096, 1, 1);
  buffers = [];
  processor.onaudioprocess = (e) => buffers.push(new Float32Array(e.inputBuffer.getChannelData(0)));
  source.connect(processor);
  processor.connect(ctx.destination);
}

// Arrête et renvoie un Blob WAV (ou null si rien). Si `annuler`, ne renvoie rien.
export async function arreterEnregistrement(annuler) {
  try { processor && processor.disconnect(); source && source.disconnect(); } catch { /* ignore */ }
  if (stream) stream.getTracks().forEach(t => t.stop());
  const ctxLocal = ctx; const bufs = buffers; const rate = srcRate;
  processor = null; source = null; ctx = null; buffers = [];
  try { ctxLocal && ctxLocal.close(); } catch { /* ignore */ }
  if (annuler || !bufs.length) return null;

  const total = bufs.reduce((s, b) => s + b.length, 0);
  const data = new Float32Array(total);
  let off = 0; for (const b of bufs) { data.set(b, off); off += b.length; }
  const cible = 16000;
  const down = sousEchantillon(data, rate, cible);
  return new Blob([encoderWav(down, cible)], { type: "audio/wav" });
}

function sousEchantillon(buf, de, vers) {
  if (vers >= de) return buf;
  const ratio = de / vers;
  const lng = Math.round(buf.length / ratio);
  const res = new Float32Array(lng);
  let oi = 0, bi = 0;
  while (oi < lng) {
    const next = Math.round((oi + 1) * ratio);
    let sum = 0, c = 0;
    for (let i = bi; i < next && i < buf.length; i++) { sum += buf[i]; c++; }
    res[oi] = sum / (c || 1); oi++; bi = next;
  }
  return res;
}

function encoderWav(samples, rate) {
  const buffer = new ArrayBuffer(44 + samples.length * 2);
  const view = new DataView(buffer);
  const w = (o, s) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  w(0, "RIFF"); view.setUint32(4, 36 + samples.length * 2, true); w(8, "WAVE");
  w(12, "fmt "); view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, rate, true); view.setUint32(28, rate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  w(36, "data"); view.setUint32(40, samples.length * 2, true);
  let o = 44;
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7FFF, true); o += 2;
  }
  return view;
}
