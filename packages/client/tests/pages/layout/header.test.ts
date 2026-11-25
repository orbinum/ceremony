/** The shared header: the pages with the current one marked, the account, the network, the menu. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StaticRouter } from "react-router";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { type Account, SiteHeader } from "../../../src/pages/layout";

const render = (path: string, account?: Account | null) =>
  renderToStaticMarkup(
    createElement(
      StaticRouter,
      { location: path },
      createElement(SiteHeader, { network: "testnet", account }),
    ),
  );

// The theme switch reads the page's theme: a dark one, as `data-theme` would force it.
beforeAll(() => vi.stubGlobal("document", { documentElement: { dataset: { theme: "dark" } } }));
afterAll(() => vi.unstubAllGlobals());

const signedIn: Account = { login: "octocat", signOut: () => {} };

describe("SiteHeader", () => {
  it("links every page and marks the current one", () => {
    const html = render("/archive");
    expect(html).toContain('href="/"');
    expect(html).toMatch(
      /aria-current="page"[^>]*href="\/archive"|href="\/archive"[^>]*aria-current="page"/,
    );
    expect(html).not.toMatch(/href="\/"[^>]*aria-current="page"/);
  });

  it("shows the account and a way out only to someone signed in", () => {
    expect(render("/", signedIn)).toContain("@octocat");
    expect(render("/", signedIn)).toContain("Sign out");
    for (const account of [null, undefined]) {
      expect(render("/", account)).not.toContain("Sign out");
    }
  });

  it("names the network, and offers a closed phone menu that says what it controls", () => {
    const html = render("/");
    expect(html).toContain('aria-label="Network: Testnet"');
    expect(html).toContain('aria-label="Open menu"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-controls="site-menu"');
    // Closed: its panel is not rendered.
    expect(html).not.toContain('id="site-menu"');
  });
});
