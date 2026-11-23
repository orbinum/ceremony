import type { RouteObject } from "react-router";
import { NotFound, RouteError } from "../pages/error";
import { Home } from "../pages/home";

/** Every path the page has; any other is "not found", and any render failure the error page. */
export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <Home /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];
