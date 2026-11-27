/** The router's error element: a 404 it raised, or anything a page threw while rendering. */
import { isRouteErrorResponse, useRouteError } from "react-router";
import { ErrorPage } from "./error-page";
import { NotFound } from "./not-found";

export function RouteError() {
  const error = useRouteError();
  if (isRouteErrorResponse(error) && error.status === 404) return <NotFound />;
  console.error(error);
  return (
    <ErrorPage
      code="Error"
      title="Something went wrong"
      text="The page hit an unexpected problem. Reload it; if you were contributing, your place in line is kept for a short while."
      reload
    />
  );
}
