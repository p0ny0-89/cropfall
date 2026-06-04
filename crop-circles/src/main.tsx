import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

// When embedded in an iframe (e.g. Framer), the parent page stops receiving
// mouse events while the cursor is over us — so a custom cursor on the host
// site freezes. Forward pointer positions up so the host can keep tracking.
if (window.parent !== window) {
  window.addEventListener(
    "pointermove",
    (e) => {
      window.parent.postMessage(
        { type: "cropfall:pointermove", x: e.clientX, y: e.clientY },
        "*"
      );
    },
    { passive: true }
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
