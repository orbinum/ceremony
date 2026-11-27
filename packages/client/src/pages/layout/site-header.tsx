/**
 * The header every ceremony page shares, aligned with the page's content (same width and gutter).
 * From sm up: the brand and the pages on the left; the account, the network and the theme on the
 * right, every control 32 px high. On a phone: the brand, the theme and a menu holding the pages,
 * the network and the account. `account` null: signed out; undefined: not known (yet, or on a page
 * that does not ask).
 */
import { useRef, useState } from "react";
import { Link, NavLink } from "react-router";
import type { Config } from "../../api";
import { useDismiss } from "../../hooks";
import { Button, Logo, ThemeToggle } from "../../ui";
import { PAGES } from "./constants";
import { NetworkSelector } from "./network-selector";
import { PhoneMenu } from "./phone-menu";
import type { Account } from "./types";

export function SiteHeader(props: {
  network: Config["network"] | undefined;
  account?: Account | null;
}) {
  const [open, setOpen] = useState(false);
  const area = useRef<HTMLElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  useDismiss(open, setOpen, area, trigger);
  const close = () => setOpen(false);

  return (
    <header ref={area} className="sticky top-0 z-30 border-b border-border bg-bg">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between gap-3 px-4 sm:h-16">
        <div className="flex min-w-0 items-center gap-6">
          <Link to="/" aria-label="Orbinum Trusted Setup Ceremony" className="shrink-0">
            <Logo />
          </Link>
          <nav aria-label="Pages" className="hidden items-center gap-1 sm:flex">
            {PAGES.map((p) => (
              <NavLink
                key={p.to}
                to={p.to}
                end
                className={({ isActive }) =>
                  `inline-flex h-8 items-center px-3 text-xs transition-colors ${
                    isActive
                      ? "bg-overlay-active font-medium text-text"
                      : "text-muted hover:bg-overlay-hover hover:text-text"
                  }`
                }
              >
                {p.label}
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {props.account && (
            <div className="hidden items-center gap-2 sm:flex">
              <span className="hidden max-w-40 truncate text-xs text-muted md:inline">
                @{props.account.login}
              </span>
              <Button variant="secondary" size="compact" onClick={props.account.signOut}>
                Sign out
              </Button>
            </div>
          )}
          <div className="hidden sm:block">
            <NetworkSelector network={props.network} />
          </div>
          <ThemeToggle />
          <button
            ref={trigger}
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls="site-menu"
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-10 w-10 items-center justify-center text-text transition-colors hover:bg-overlay-hover sm:hidden"
          >
            <svg
              viewBox="0 0 24 24"
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>

      {open && <PhoneMenu network={props.network} account={props.account} close={close} />}
    </header>
  );
}
