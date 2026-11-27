/**
 * What a visitor sees on a path the page does not have, or when rendering fails: the brand, what
 * happened in plain words and the way back, never the error itself. The way back is a full
 * navigation: a fresh start, whatever state broke the page.
 */
import { useEffect } from "react";
import { SiteHeader } from "../layout";

export function ErrorPage(props: { code: string; title: string; text: string; reload?: boolean }) {
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
