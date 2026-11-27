/**
 * The web client's entry, loaded by `index.html`: the stored theme first, so the page does not
 * flash the other one, then the router in React's strict mode.
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router";

import { router } from "./router";
import "./styles/index.css";
import { applyStoredTheme } from "./ui";

applyStoredTheme();

const root = document.getElementById("root");
if (!root) throw new Error("index.html has no #root");

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
);
