/** Step 1 waits for the session and the ceremony's status before it offers anything. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Journey } from "../../../../src/pages/home/journey";
import { NOT_ANNOUNCED } from "../../../../src/pages/home/text";

const render = (me: null | undefined, announced: boolean | undefined) =>
  renderToStaticMarkup(
    createElement(Journey, { me, config: undefined, announced, reloadMe: () => {} }),
  );

describe("the sign-in step", () => {
  it("shows a placeholder, not a sign-in, while the session or the status is loading", () => {
    for (const [me, announced] of [
      [undefined, undefined],
      [undefined, true],
      [null, undefined],
    ] as const) {
      const html = render(me, announced);
      expect(html).toContain('aria-busy="true"');
      expect(html).not.toContain('href="/auth/github"');
      expect(html).not.toContain(NOT_ANNOUNCED);
    }
  });

  it("then offers the sign-in, or says the ceremony is not announced yet", () => {
    expect(render(null, true)).toContain('href="/auth/github"');
    const notAnnounced = render(null, false);
    expect(notAnnounced).toContain(NOT_ANNOUNCED);
    expect(notAnnounced).not.toContain('href="/auth/github"');
    expect(notAnnounced).not.toContain('aria-busy="true"');
  });
});
