import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./versions/v0.2/App";
import "./index.css";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
