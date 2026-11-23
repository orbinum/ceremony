/** A dialog over the page: closes on Escape and on the backdrop, and holds the page still. */
import { type ReactNode, useEffect } from "react";
import { createPortal } from "react-dom";

export function Modal(props: { title: string; onClose: () => void; children: ReactNode }) {
  const { onClose } = props;

  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previous;
      window.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-overlay-backdrop backdrop-blur-sm sm:items-center sm:p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={props.title}
        className="flex max-h-[92dvh] w-full max-w-md flex-col overflow-hidden border border-border bg-bg shadow-2xl sm:max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-border px-4 py-3 sm:px-5 sm:py-4">
          <h2 className="text-base font-bold tracking-tight text-accent">{props.title}</h2>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="px-2 text-xl leading-none text-muted transition-colors hover:bg-overlay-hover hover:text-text"
          >
            ×
          </button>
        </div>
        <div className="space-y-3 overflow-y-auto p-4 text-sm text-text sm:p-5">
          {props.children}
        </div>
      </div>
    </div>,
    document.body,
  );
}
