/** The page for a path the site does not have. */
import { ErrorPage } from "./error-page";

export function NotFound() {
  return (
    <ErrorPage
      code="404"
      title="Page not found"
      text="This address is not part of the ceremony. The whole contribution happens on the main page."
    />
  );
}
