/**
 * Cloudflare Turnstile's widget, its script loaded on first use (explicit rendering). Each solve
 * hands its token to `onToken`, `null` once it expires or fails. A token is spent by one request:
 * remount the widget (a new `key`) for another.
 */
import { useEffect, useRef } from "react";
import { showsLight } from "./theme";

interface TurnstileApi {
  render(
    el: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "dark" | "light";
      size: "normal" | "compact";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ): string;
  remove(id: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

let loading: Promise<TurnstileApi> | undefined;

/** The script, once per page; a failed load is tried again by the next widget. */
function loadTurnstile(): Promise<TurnstileApi> {
  loading ??= new Promise<TurnstileApi>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.addEventListener("load", () =>
      window.turnstile ? resolve(window.turnstile) : reject(new Error("no Turnstile")),
    );
    script.addEventListener("error", () => reject(new Error("Turnstile did not load")));
    document.head.append(script);
  }).catch((error: unknown) => {
    loading = undefined;
    throw error;
  });
  return loading;
}

export function Turnstile(props: {
  siteKey: string;
  action: string;
  onToken: (token: string | null) => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const { siteKey, action, onToken } = props;

  useEffect(() => {
    let live = true;
    let id: string | undefined;
    loadTurnstile().then(
      (api) => {
        if (!live || !box.current) return;
        id = api.render(box.current, {
          sitekey: siteKey,
          action,
          theme: showsLight() ? "light" : "dark",
          size: box.current.clientWidth < 300 ? "compact" : "normal",
          callback: onToken,
          "expired-callback": () => onToken(null),
          "error-callback": () => onToken(null),
        });
      },
      () => live && onToken(null),
    );
    return () => {
      live = false;
      if (id !== undefined) window.turnstile?.remove(id);
    };
  }, [siteKey, action, onToken]);

  return <div ref={box} />;
}
