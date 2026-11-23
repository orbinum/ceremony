import { matchRoutes } from "react-router";
import { describe, expect, it } from "vitest";
import { routes } from "../../src/router/routes";

const leaf = (path: string) => matchRoutes(routes, path)?.at(-1)?.route.path;

describe("routes", () => {
  it("shows the ceremony at the root and not-found on any other path", () => {
    expect(leaf("/")).toBe("/");
    for (const path of ["/nope", "/admin", "/a/b/c", "/%2e%2e/x"]) expect(leaf(path)).toBe("*");
  });

  it("has an error element above every page", () => {
    expect(routes[0]?.errorElement).toBeDefined();
  });
});
