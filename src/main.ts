import "./styles.css";
import { boot } from "./boot";

boot().catch((err) => {
  console.error(err);
  document.body.innerHTML = `<p style="padding:2rem;color:#fca5a5">Failed to start: ${String(err.message || err)}</p>`;
});
