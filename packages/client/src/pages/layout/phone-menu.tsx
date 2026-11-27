/**
 * The phone menu: everything the header holds from sm up (the pages, the network, the account),
 * as rows with 40 px+ targets.
 */
import { NavLink } from "react-router";
import type { Config } from "../../api";
import { Button } from "../../ui";
import { PAGES } from "./constants";
import { MenuLabel } from "./menu-label";
import { NetworkList } from "./network-list";
import type { Account } from "./types";

export function PhoneMenu(props: {
  network: Config["network"] | undefined;
  account: Account | null | undefined;
  close: () => void;
}) {
  return (
    <div
      id="site-menu"
      className="absolute inset-x-0 top-full border-b border-border bg-bg pb-3 shadow-lg sm:hidden"
    >
      <nav aria-label="Pages" className="mx-auto max-w-6xl px-1">
        <MenuLabel>Pages</MenuLabel>
        {PAGES.map((p) => (
          <NavLink
            key={p.to}
            to={p.to}
            end
            onClick={props.close}
            className={({ isActive }) =>
              `flex h-11 items-center px-3 text-sm transition-colors ${
                isActive ? "bg-overlay-active text-text" : "text-muted hover:bg-overlay-hover"
              }`
            }
          >
            {p.label}
          </NavLink>
        ))}
      </nav>
      {props.network && (
        <div className="mx-auto max-w-6xl px-1">
          <MenuLabel>Network</MenuLabel>
          <NetworkList network={props.network} onPick={props.close} />
        </div>
      )}
      {props.account && (
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 pt-4">
          <span className="truncate text-xs text-muted">Signed in as @{props.account.login}</span>
          <Button
            variant="secondary"
            size="compact"
            onClick={() => {
              props.close();
              props.account?.signOut();
            }}
          >
            Sign out
          </Button>
        </div>
      )}
    </div>
  );
}
