/** "How it works" points to the documentation, in a new tab so a turn in progress is not left. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { About } from "../../../../src/pages/home/about";
import { DOCS } from "../../../../src/pages/home/text";

describe("About", () => {
  it("links the contributor guide and the technical page, each in a new tab", () => {
    const html = renderToStaticMarkup(createElement(About));
    expect(DOCS.map((d) => d.href)).toEqual([
      "https://docs.orbinum.network/ceremony/contribute",
      "https://docs.orbinum.network/architecture/trusted-setup",
    ]);
    for (const { href } of DOCS) {
      expect(html).toContain(`href="${href}" target="_blank" rel="noopener noreferrer"`);
    }
  });
});
