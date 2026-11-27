/** The page's browser router over its routes, created once when the app loads. */
import { createBrowserRouter } from "react-router";
import { routes } from "./routes";

export const router = createBrowserRouter(routes);
