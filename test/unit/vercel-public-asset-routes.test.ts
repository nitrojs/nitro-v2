import { describe, expect, it } from "vitest";
import type { PublicAssetDir } from "nitropack/types";
import { getPublicAssetRoutes } from "../../src/presets/vercel/utils";

const asset = (dir: Partial<PublicAssetDir>): PublicAssetDir =>
  ({ dir: "public", maxAge: 0, ...dir }) as PublicAssetDir;

describe("getPublicAssetRoutes", () => {
  it("returns no routes without public assets", () => {
    expect(getPublicAssetRoutes([], { baseURL: "/" })).toEqual([]);
  });

  it("skips assets that fall through to the server", () => {
    expect(
      getPublicAssetRoutes([asset({ baseURL: "/build", fallthrough: true })], {
        baseURL: "/",
      })
    ).toEqual([]);
  });

  it.each(["/", "/base/"])("skips the root base (baseURL: %s)", (baseURL) => {
    expect(
      getPublicAssetRoutes(
        [
          asset({ baseURL: "/", fallthrough: false }),
          asset({ fallthrough: false }),
        ],
        { baseURL }
      )
    ).toEqual([]);
  });

  it("matches the base as a path prefix", () => {
    const routes = getPublicAssetRoutes(
      [asset({ baseURL: "/build", fallthrough: false })],
      { baseURL: "/" }
    );
    expect(routes).toEqual([{ src: "^/build/(.*)$" }]);
    const src = new RegExp(routes[0].src);
    expect(src.test("/build/a.js")).toBe(true);
    expect(src.test("/build")).toBe(false);
    expect(src.test("/buildings")).toBe(false);
  });

  it("prefixes sources with the app base URL", () => {
    expect(
      getPublicAssetRoutes([asset({ baseURL: "/build", fallthrough: false })], {
        baseURL: "/base/",
      })
    ).toEqual([{ src: "^/base/build/(.*)$" }]);
  });

  it("escapes regular expression characters in the base", () => {
    expect(
      getPublicAssetRoutes([asset({ baseURL: "/a.b+c", fallthrough: false })], {
        baseURL: "/",
      })
    ).toEqual([{ src: String.raw`^/a\.b\+c/(.*)$` }]);
  });
});
