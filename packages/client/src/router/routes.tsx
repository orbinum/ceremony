/**
 * Every path the page has: the ceremony at the root and the archive; any other is "not found", and
 * any render failure the error page.
 */
import type { RouteObject } from "react-router";
import { Archive } from "../pages/archive";
import { NotFound, RouteError } from "../pages/error";
import { Home } from "../pages/home";

export const routes: RouteObject[] = [
  {
    errorElement: <RouteError />,
    children: [
      { path: "/", element: <Home /> },
      { path: "/archive", element: <Archive /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];
