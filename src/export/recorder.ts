export async function exportPaintedVideo({
  canvas,
  frameCount,
  yearForIndex = (i: number) => i,
  renderFrame,
  yearsPerSecond = 5,
  fps = 30,
  mimePreference = "webm",
  onProgress = () => {},
  signal,
}: {
  canvas: HTMLCanvasElement;
  frameCount: number;
  yearForIndex?: (i: number) => number | string;
  renderFrame: (index: number, canvas: HTMLCanvasElement) => Promise<void>;
  yearsPerSecond?: number;
  fps?: number;
  mimePreference?: string;
  onProgress?: (info: { year: number | string; frameIndex: number; totalFrames: number; percent: number }) => void;
  signal?: AbortSignal;
}) {
  if (!frameCount || frameCount < 1) throw new Error("No frames to export");
  const mimeType = pickMimeType(mimePreference);
  if (!mimeType) {
    throw new Error("This browser cannot record video (MediaRecorder / WebM/MP4 unsupported). Try Chrome or Edge.");
  }

  const offscreen = document.createElement("canvas");
  offscreen.width = canvas.width;
  offscreen.height = canvas.height;
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];
  const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 8_000_000 });
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (e) => reject((e as any).error || new Error("MediaRecorder error"));
  });

  const commitFrame = async (fi: number) => {
    const octx = offscreen.getContext("2d")!;
    octx.fillStyle = "#0F172A";
    octx.fillRect(0, 0, offscreen.width, offscreen.height);
    await renderFrame(fi, offscreen);
    const ctx = canvas.getContext("2d")!;
    ctx.drawImage(offscreen, 0, 0);
    if ((track as any).requestFrame) (track as any).requestFrame();
  };

  await commitFrame(0);
  await sleep(80);
  recorder.start(100);

  const holdFrames = Math.max(1, Math.round(fps / Math.max(0.1, yearsPerSecond)));
  for (let fi = 0; fi < frameCount; fi++) {
    if (signal?.aborted) {
      try { recorder.stop(); } catch { /* */ }
      track.stop();
      throw new DOMException("Export cancelled", "AbortError");
    }
    await commitFrame(fi);
    onProgress({
      year: yearForIndex(fi),
      frameIndex: fi,
      totalFrames: frameCount,
      percent: Math.min(100, ((fi + 1) / frameCount) * 100),
    });
    const nHold = fi === frameCount - 1 ? Math.max(2, Math.floor(holdFrames / 2)) : holdFrames;
    for (let h = 0; h < nHold; h++) {
      if ((track as any).requestFrame) (track as any).requestFrame();
      await sleep(1000 / Math.max(1, fps));
    }
  }
  await sleep(200);
  recorder.stop();
  track.stop();
  await stopped;
  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  return { blob: new Blob(chunks, { type: mimeType }), ext, mimeType };
}

function pickMimeType(pref: string) {
  const candidates =
    pref === "mp4"
      ? ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"]
      : ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm", "video/mp4"];
  if (typeof MediaRecorder === "undefined") return null;
  for (const m of candidates) if (MediaRecorder.isTypeSupported(m)) return m;
  return null;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function exportSize(opts: {
  resolution: string;
  aspect: string;
  customWidth: number;
  customHeight: number;
}) {
  const aspect: Record<string, number> = {
    "16:9": 16 / 9,
    "9:16": 9 / 16,
    "1:1": 1,
    "4:3": 4 / 3,
    "21:9": 21 / 9,
  };
  const heights: Record<string, number> = { "720p": 720, "1080p": 1080, "1440p": 1440, "4k": 2160 };
  if (opts.resolution === "custom") {
    return { width: opts.customWidth || 1920, height: opts.customHeight || 1080 };
  }
  const h = heights[opts.resolution] || 1080;
  const r = aspect[opts.aspect] || 16 / 9;
  return { width: Math.round(h * r), height: h };
}
