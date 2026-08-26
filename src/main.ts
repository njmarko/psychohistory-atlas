import "./styles.css";
import { installPreviewHostBridge } from "./lib/preview-host-bridge";
import { boot } from "./boot";

// Grok live-preview chrome (noop when not embedded).
installPreviewHostBridge();

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<p style="padding:2rem;color:#fca5a5">Failed to start: ${String(err.message || err)}</p>`;
});
