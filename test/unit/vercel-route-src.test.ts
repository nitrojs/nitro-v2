import { createRouter, toRouteMatcher } from "radix3";
import { joinURL, withoutBase } from "ufo";
import { describe, expect, it } from "vitest";
import type { Nitro } from "nitropack/types";
import {
  getObservabilityRoutes,
  getRedirectLocation,
  normalizeRouteSrc,
  routeToVercelSrc,
} from "../../src/presets/vercel/utils";

const patterns = [
  "/",
  "/**",
  "/api/**",
  "/x/*",
  "/x/:id",
  "/x/:id/edit",
  "/x/*/y/**",
  "/exact",
  "/exact/nested",
  "/dot.v1/**",
  "/a+b(c)/[d]",
];

const paths = [
  "/",
  "/api",
  "/api/",
  "/api/a",
  "/api/a/b/",
  "/apix",
  "/x",
  "/x/",
  "/x/1",
  "/x/1/",
  "/x/1/2",
  "/x/1/edit",
  "/x/1/y",
  "/x/1/y/z/",
  "/exact",
  "/exact/",
  "/exactly",
  "/exact/nested",
  "/prefix/exact",
  "/dot.v1",
  "/dot.v1/a",
  "/dotxv1/a",
  "/a+b(c)/[d]",
  "/aab(c)/[d]",
];

describe("routeToVercelSrc", () => {
  for (const baseURL of ["/", "/base/"]) {
    it(`matches the same paths as the runtime matcher (baseURL: ${baseURL})`, () => {
      for (const pattern of patterns) {
        const matcher = toRouteMatcher(
          createRouter({ routes: { [pattern]: { pattern } } })
        );
        const src = new RegExp(`^${routeToVercelSrc(pattern, { baseURL })}$`);
        for (const path of paths) {
          const fullPath = joinURL(baseURL, path);
          expect
            .soft(src.test(fullPath), `${pattern} ~ ${fullPath}`)
            .toBe(matcher.matchAll(path).length > 0);
        }
      }
    });
  }

  it("does not widen patterns that the runtime matcher does not support", () => {
    for (const pattern of ["/api/:id.json", "/a/**/b", "/api/**:name"]) {
      const matcher = toRouteMatcher(
        createRouter({ routes: { [pattern]: { pattern } } })
      );
      const src = new RegExp(`^${routeToVercelSrc(pattern)}$`);
      for (const path of [
        "/api",
        "/api/x",
        "/api/x.json",
        "/api/x/y",
        "/api.json/x",
        "/a/b",
        "/a/z/b",
      ]) {
        if (src.test(path)) {
          expect
            .soft(matcher.matchAll(path).length, `${pattern} ~ ${path}`)
            .toBeGreaterThan(0);
        }
      }
    }
  });

  it("does not match paths outside of the baseURL", () => {
    const src = new RegExp(
      `^${routeToVercelSrc("/api/**", { baseURL: "/base/" })}$`
    );
    expect(src.test("/api/a")).toBe(false);
    expect(src.test("/base/api/a")).toBe(true);
  });

  it("generates readable sources", () => {
    expect(routeToVercelSrc("/")).toBe("/");
    expect(routeToVercelSrc("/", { baseURL: "/base/" })).toBe("/base/?");
    expect(routeToVercelSrc("/**")).toBe("(?:/(.*))?");
    expect(routeToVercelSrc("/api/**")).toBe("/api(?:/(.*))?");
    expect(routeToVercelSrc("/x/:id")).toBe("/x/[^/]+/?");
    expect(routeToVercelSrc("/dot.v1/**", { baseURL: "/base/" })).toBe(
      String.raw`/base/dot\.v1(?:/(.*))?`
    );
    expect(routeToVercelSrc("/old/**", { requireCatchAll: true })).toBe(
      "/old/(.+)"
    );
    expect(routeToVercelSrc("/api/:id.json")).toBe(
      String.raw`/api/:id\.json/?`
    );
  });
});

describe("normalizeRouteSrc", () => {
  const matches = (route: string, path: string) =>
    new RegExp(`^${normalizeRouteSrc(route)}$`).exec(path)?.groups;

  it("matches an optional segment when present or omitted", () => {
    expect(matches("/x/:id?", "/x")).toEqual({ id: undefined });
    expect(matches("/x/:id?", "/x/42")).toEqual({ id: "42" });
    expect(matches("/x/:id?", "/x/42/y")).toBeUndefined();
    expect(matches("/x/:id?/edit", "/x/edit")).toEqual({ id: undefined });
    expect(matches("/x/:id?/edit", "/x/42/edit")).toEqual({ id: "42" });
    expect(matches("/x/:id?", "/xy")).toBeUndefined();
    expect(matches("/x/pre-:p/:id?/*", "/x/pre-a/tail")).toEqual({
      p: "a",
      id: undefined,
      _0: "tail",
    });
    expect(matches("/x/pre-:p/:id?/*", "/x/pre-a/42/tail")).toEqual({
      p: "a",
      id: "42",
      _0: "tail",
    });
    expect(matches("/:id?", "/")).toEqual({ id: undefined });
    expect(matches("/:id?", "/42")).toEqual({ id: "42" });
    expect(matches("/:org?/x", "/x")).toEqual({ org: undefined });
    expect(matches("/:org?/x", "/acme/x")).toEqual({ org: "acme" });
    expect(matches("/:org?/x", "//x")).toBeUndefined();
    expect(matches("/:a?/:b?/x", "/x")).toEqual({ a: undefined, b: undefined });
    expect(matches("/:a?/:b?/x", "/1/2/x")).toEqual({ a: "1", b: "2" });
    const withBase = new RegExp(
      `^${joinURL("/base/", normalizeRouteSrc("/:org?/x"))}$`
    );
    expect(withBase.test("/base/x")).toBe(true);
    expect(withBase.test("/base/acme/x")).toBe(true);
  });

  it("matches a `(.*)` catch-all over zero or more segments", () => {
    for (const route of ["/x/:slug(.*)", "/x/:slug(.*)?"]) {
      expect(matches(route, "/x"), route).toEqual({ slug: undefined });
      expect(matches(route, "/x/"), route).toEqual({ slug: "" });
      expect(matches(route, "/x/a"), route).toEqual({ slug: "a" });
      expect(matches(route, "/x/a/b"), route).toEqual({ slug: "a/b" });
      expect(matches(route, "/xy"), route).toBeUndefined();
    }
    expect(matches("/:slug(.*)", "/")).toEqual({ slug: "" });
    expect(matches("/:slug(.*)", "/a/b")).toEqual({ slug: "a/b" });
    expect(matches("/:slug(.*)/x", "/x")).toEqual({ slug: undefined });
    expect(matches("/:slug(.*)/x", "/a/b/x")).toEqual({ slug: "a/b" });
  });

  it("keeps the output of other segments", () => {
    expect(normalizeRouteSrc("/x/:id")).toBe("/x/(?<id>[^/]+)");
    expect(normalizeRouteSrc("/x/*/y")).toBe("/x/(?<_0>[^/]*)/y");
    expect(normalizeRouteSrc("/x/**")).toBe("/x/(?:.*)");
    expect(normalizeRouteSrc("/x/**:slug")).toBe("/x/?(?<slug>.+)");
    expect(normalizeRouteSrc("/x/:id-a.json")).toBe(
      String.raw`/x/(?<id>[^/]+)-a\.json`
    );
    expect(normalizeRouteSrc("/x/pre-:id?")).toBe("/x/pre-(?<id>[^/]+)?");
    expect(normalizeRouteSrc("/x//y")).toBe("/x//y");
  });

  it("orders `(.*)` catch-alls after other dynamic routes", () => {
    const nitro = {
      options: {
        compatibilityDate: { default: "2025-07-15" },
        ssrRoutes: ["/x/:slug(.*)", "/x/:id/edit", "/x/:id?"],
        handlers: [],
      },
      scannedHandlers: [],
    } as unknown as Nitro;
    const firstMatch = (path: string) =>
      getObservabilityRoutes(nitro).find(({ src }) =>
        new RegExp(`^${src}$`).test(path)
      )?.dest;
    expect(firstMatch("/x")).toBe("x/[id-]");
    expect(firstMatch("/x/1")).toBe("x/[id-]");
    expect(firstMatch("/x/1/edit")).toBe("x/[id]/edit");
    expect(firstMatch("/x/1/2")).toBe("x/[slug-.--]");
  });
});

describe("getRedirectLocation", () => {
  it("keeps targets without a wildcard", () => {
    expect(getRedirectLocation("/old/**", "/new")).toBe("/new");
    expect(getRedirectLocation("/old", "https://nitro.build/")).toBe(
      "https://nitro.build/"
    );
  });

  it("expands a trailing wildcard like the runtime", () => {
    const route = "/old/**";
    const src = new RegExp(
      `^${routeToVercelSrc(route, { requireCatchAll: true })}$`
    );
    for (const target of ["/new", ""]) {
      const location = getRedirectLocation(route, `${target}/**`)!;
      for (const path of ["/old/a", "/old/a/b", "/old/a/"]) {
        const runtime = joinURL(target, withoutBase(path, "/old"));
        expect(path.replace(src, location)).toBe(runtime);
      }
    }
    // The bare base is left to the server function
    expect(src.test("/old")).toBe(false);
    expect(src.test("/old/")).toBe(false);
  });

  it("leaves targets the edge cannot expand to the server function", () => {
    expect(getRedirectLocation("/old/*", "/new/**")).toBeUndefined();
    expect(getRedirectLocation("/old/**", "/new/**/a")).toBeUndefined();
    expect(getRedirectLocation("/old/**", "/new?path=/**")).toBeUndefined();
  });
});
