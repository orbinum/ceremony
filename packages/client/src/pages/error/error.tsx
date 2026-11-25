/**
 * What a visitor sees on a path the page does not have, or when rendering fails: the brand, what
 * happened in plain words and the way back. Never the error itself.
 */
import { useEffect } from "react";
import { isRouteErrorResponse, useRouteError } from "react-router";
import { SiteHeader } from "../layout";

function ErrorPage(props: { code: string; title: string; text: string; reload?: boolean }) {
  useEffect(() => {
    const previous = document.title;
    document.title = `${props.title} · Orbinum Trusted Setup Ceremony`;
    return () => {
      document.title = previous;
    };
  }, [props.title]);

  return (
    <>
      <SiteHeader network={undefined} />
      <main className="mx-auto flex min-h-[calc(100dvh-4rem)] max-w-xl flex-col justify-center gap-4 px-4 py-12">
        <p className="text-[10px] font-medium uppercase tracking-widest text-muted">{props.code}</p>
        <h1 className="wordmark text-3xl leading-tight sm:text-5xl">{props.title}</h1>
        <p className="text-sm leading-relaxed text-muted">{props.text}</p>
        <div className="flex flex-wrap gap-3 pt-2">
          {/* A full navigation: a fresh start, whatever state broke the page. */}
          <a href="/" className="btn-primary px-4 py-2 text-xs font-bold">
            Back to the ceremony
          </a>
          {props.reload && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="btn-ghost px-4 py-2 text-xs font-medium"
            >
              Reload
            </button>
          )}
        </div>
      </main>
    </>
  );
}

export function NotFound() {
  return (
    <ErrorPage
      code="404"
      title="Page not found"
      text="This address is not part of the ceremony. The whole contribution happens on the main page."
    />
  );
}

/** The router's error element: a 404 it raised, or anything a page threw while rendering. */
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
