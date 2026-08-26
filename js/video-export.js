import { drawPyramid } from "./pyramid.js";

/**
 * Export a sequence of pyramid frames as a video file using MediaRecorder.
 * Renders offline at the given FPS while advancing years according to
 * yearsPerSecond of wall-clock playback.
 */
export async function exportVideo({
  canvas,
  frames,
  optionsForFrame,
  yearsPerSecond = 5,
  fps = 30,
  mimePreference = "webm",
  onProgress = () => {},
  signal,
}) {
  if (!frames.length) throw new Error("No frames to export");

  const mimeType = pickMimeType(mimePreference);
  if (!mimeType) {
    throw new Error(
      "This browser cannot record video (MediaRecorder / WebM/MP4 unsupported). Try Chrome or Edge."
    );
  }

  // captureStream(fps) keeps a steady frame clock; we redraw between years.
  const stream = canvas.captureStream(fps);
  const track = stream.getVideoTracks()[0];

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (e) => reject(e.error || new Error("MediaRecorder error"));
  });

  // Draw first frame before recording starts
  {
    const frame0 = frames[0];
    const opts0 = typeof optionsForFrame === "function" ? optionsForFrame(frame0) : optionsForFrame;
    drawPyramid(canvas, frame0, opts0);
  }

  recorder.start(200);

  // yearsPerSecond wall-clock in the exported video
  const msPerYear = 1000 / Math.max(0.1, yearsPerSecond);
  const totalYears = frames.length;

  for (let fi = 0; fi < frames.length; fi++) {
    if (signal?.aborted) {
      try {
        recorder.stop();
      } catch (_) {}
      track.stop();
      throw new DOMException("Export cancelled", "AbortError");
    }

    const frame = frames[fi];
    const opts = typeof optionsForFrame === "function" ? optionsForFrame(frame) : optionsForFrame;
    drawPyramid(canvas, frame, opts);
    if (track.requestFrame) track.requestFrame();

    onProgress({
      year: frame.year,
      frameIndex: fi,
      totalFrames: frames.length,
      percent: Math.min(100, ((fi + 1) / totalYears) * 100),
    });

    // Hold this year on screen for msPerYear (last frame gets a short hold)
    const hold = fi === frames.length - 1 ? Math.min(400, msPerYear) : msPerYear;
    await sleep(hold);
  }

  // Tail so encoder flushes the last frames
  await sleep(300);
  recorder.stop();
  track.stop();
  await stopped;

  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const blob = new Blob(chunks, { type: mimeType });
  return { blob, ext, mimeType };
}

function pickMimeType(pref) {
  const candidates =
    pref === "mp4"
      ? [
          "video/mp4;codecs=avc1",
          "video/mp4",
          "video/webm;codecs=vp9",
          "video/webm;codecs=vp8",
          "video/webm",
        ]
      : [
          "video/webm;codecs=vp9",
          "video/webm;codecs=vp8",
          "video/webm",
          "video/mp4;codecs=avc1",
          "video/mp4",
        ];

  if (typeof MediaRecorder === "undefined") return null;
  for (const m of candidates) {
    if (MediaRecorder.isTypeSupported(m)) return m;
  }
  return null;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/**
 * Record a video by calling an async painter for each year-index onto a canvas.
 * Used for world-map export (map + stats bar painted each frame).
 *
 * @param {object} opts
 * @param {HTMLCanvasElement} opts.canvas
 * @param {number} opts.frameCount - number of years/frames
 * @param {(index: number) => number|string} [opts.yearForIndex]
 * @param {(index: number, canvas: HTMLCanvasElement) => Promise<void>} opts.renderFrame
 * @param {number} [opts.yearsPerSecond]
 * @param {number} [opts.fps]
 * @param {string} [opts.mimePreference]
 * @param {function} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 */
export async function exportPaintedVideo({
  canvas,
  frameCount,
  yearForIndex = (i) => i,
  renderFrame,
  yearsPerSecond = 5,
  fps = 30,
  mimePreference = "webm",
  onProgress = () => {},
  signal,
}) {
  if (!frameCount || frameCount < 1) throw new Error("No frames to export");

  const mimeType = pickMimeType(mimePreference);
  if (!mimeType) {
    throw new Error(
      "This browser cannot record video (MediaRecorder / WebM/MP4 unsupported). Try Chrome or Edge."
    );
  }

  // Double-buffer: paint offscreen first, then copy to the recording canvas
  // in one drawImage so captureStream never sees a cleared/black intermediate.
  const offscreen = document.createElement("canvas");
  offscreen.width = canvas.width;
  offscreen.height = canvas.height;

  // Manual frame clock — avoids black frames while async paint is in progress
  const stream = canvas.captureStream(0);
  const track = stream.getVideoTracks()[0];

  const recorder = new MediaRecorder(stream, {
    mimeType,
    videoBitsPerSecond: 8_000_000,
  });

  const chunks = [];
  recorder.ondataavailable = (e) => {
    if (e.data && e.data.size > 0) chunks.push(e.data);
  };

  const stopped = new Promise((resolve, reject) => {
    recorder.onstop = () => resolve();
    recorder.onerror = (e) => reject(e.error || new Error("MediaRecorder error"));
  });

  const commitFrame = async (fi) => {
    // Clear only the offscreen buffer
    const octx = offscreen.getContext("2d");
    octx.fillStyle = "#0F172A";
    octx.fillRect(0, 0, offscreen.width, offscreen.height);
    await renderFrame(fi, offscreen);
    // Atomic copy onto the recorded canvas
    const ctx = canvas.getContext("2d");
    ctx.drawImage(offscreen, 0, 0);
    if (track.requestFrame) track.requestFrame();
  };

  // Prime first frame before recorder starts
  await commitFrame(0);
  await sleep(80);
  recorder.start(100);

  const msPerYear = 1000 / Math.max(0.1, yearsPerSecond);
  // How many times to re-emit the same painted frame so captureStream fills
  // the timeline at the requested fps while we hold each year.
  const holdFrames = Math.max(1, Math.round(fps / Math.max(0.1, yearsPerSecond)));

  for (let fi = 0; fi < frameCount; fi++) {
    if (signal?.aborted) {
      try {
        recorder.stop();
      } catch (_) {}
      track.stop();
      throw new DOMException("Export cancelled", "AbortError");
    }

    // Frame 0 already committed before start; still re-commit for clean timeline
    await commitFrame(fi);

    onProgress({
      year: yearForIndex(fi),
      frameIndex: fi,
      totalFrames: frameCount,
      percent: Math.min(100, ((fi + 1) / frameCount) * 100),
    });

    // Re-request the same pixels for hold duration (no clear between)
    const nHold = fi === frameCount - 1 ? Math.max(2, Math.floor(holdFrames / 2)) : holdFrames;
    for (let h = 0; h < nHold; h++) {
      if (track.requestFrame) track.requestFrame();
      await sleep(1000 / Math.max(1, fps));
    }
  }

  await sleep(200);
  recorder.stop();
  track.stop();
  await stopped;

  const ext = mimeType.includes("mp4") ? "mp4" : "webm";
  const blob = new Blob(chunks, { type: mimeType });
  return { blob, ext, mimeType };
}
