import { defineEventHandler, getCookie, getRouterParam } from "h3";
import type { NitroRouteConfig } from "nitropack/types";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { normalizeRouteRules } from "../../src/core/config/resolvers/route-rules";

// A nested `cache: false` rule must apply to every request it covers, not only
// to requests the router sends to a handler registered at the rule's path.

const { runtimeConfig, storage } = vi.hoisted(() => {
  const data = new Map<string, unknown>();
  return {
    runtimeConfig: {
      app: { baseURL: "/" },
      nitro: { routeRules: {} as Record<string, unknown> },
    },
    storage: {
      getItem: async (key: string) => data.get(key) ?? null,
      setItem: async (key: string, value: unknown) =>
        void data.set(key, structuredClone(value)),
      removeItem: async (key: string) => void data.delete(key),
    },
  };
});

vi.mock("../../src/runtime/internal/config", () => ({
  useRuntimeConfig: () => runtimeConfig,
}));

vi.mock("../../src/runtime/internal/storage", () => ({
  useStorage: () => storage,
}));

vi.mock("#nitro-internal-virtual/error-handler", () => ({
  default: (error: any, event: any) => {
    event.node.res.statusCode = error.statusCode || 500;
    event.node.res.end(String(error.message));
  },
}));

vi.mock("#nitro-internal-virtual/plugins", () => ({ plugins: [] }));

vi.mock("#nitro-internal-virtual/server-handlers", () => ({
  handlers: [
    // Per-user state resolved before the route handler runs
    {
      route: "",
      middleware: true,
      handler: defineEventHandler((event) => {
        event.context.user = getCookie(event, "session") || "anonymous";
      }),
    },
    // Dynamic route
    {
      route: "/api/:id",
      handler: defineEventHandler(
        (event) =>
          `api:${getRouterParam(event, "id")} user=${event.context.user}`
      ),
    },
    // Catch-all renderer resolving paths loosely (decoded, dot segments,
    // case-insensitive), like a client-side router would
    {
      route: "/**",
      handler: defineEventHandler((event) => {
        const segments: string[] = [];
        const path = decodeURIComponent(event.path.split("?")[0]);
        for (const segment of path.toLowerCase().split("/")) {
          if (segment === "..") {
            segments.pop();
          } else if (segment && segment !== ".") {
            segments.push(segment);
          }
        }
        return `page:/${segments.join("/")} user=${event.context.user}`;
      }),
    },
  ],
}));

async function createApp(routeRules: Record<string, NitroRouteConfig>) {
  runtimeConfig.nitro.routeRules = normalizeRouteRules({ routeRules });
  vi.resetModules();
  const { nitroApp } = await import("../../src/runtime/internal/app");
  return async (user: string, url: string) => {
    const res = await nitroApp.localCall({
      url,
      method: "GET",
      headers: { cookie: `session=${user}` },
    });
    return { body: String(res.body), headers: res.headers };
  };
}

// Request `url` as two users, return what the second one gets
async function fetchTwice(
  fetchAs: Awaited<ReturnType<typeof createApp>>,
  url: string
) {
  await fetchAs("alice", url);
  return fetchAs("bob", url);
}

describe("route rules: nested `cache: false`", async () => {
  const fetchAs = await createApp({
    "/**": { swr: 60 },
    "/account/**": { cache: false },
    "/Admin/**": { cache: false },
    "/nosw/**": { swr: false },
    "/api/**": { cache: { maxAge: 60 } },
    "/api/me": { cache: false },
  });

  it.each([
    "/account/profile",
    // Base path of `/account/**`
    "/account",
    "/account/",
    "/account?x=1",
    // Other spellings of `/account/profile`
    "/account%2Fprofile",
    "/account%2fprofile",
    "/account%252Fprofile",
    "//account/profile",
    "/x/..%2Faccount%2Fprofile",
    "/x/../account/profile",
    "/ACCOUNT/profile",
    // Rule key with uppercase letters
    "/Admin/x",
    "/admin/x",
    "/ADMIN/x",
    // `swr: false`
    "/nosw/x",
    // Concrete path served by a dynamic route
    "/api/me",
  ])("does not cache %s", async (url) => {
    const { body, headers } = await fetchTwice(fetchAs, url);
    expect(body).toContain("user=bob");
    expect(headers["cache-control"]).toBeUndefined();
  });

  it("serves excluded paths with the matching route handler", async () => {
    const { body } = await fetchAs("bob", "/api/me");
    expect(body).toBe("api:me user=bob");
  });

  it.each(["/home", "/accounts", "/api/other"])("caches %s", async (url) => {
    const { body, headers } = await fetchTwice(fetchAs, url);
    expect(body).toContain("user=alice");
    expect(headers["cache-control"]).toBeDefined();
  });
});

describe("route rules: `cache` rules with uppercase keys", async () => {
  const fetchAs = await createApp({
    "/api/getUsers": { cache: { maxAge: 60 } },
    "/Blog/**": { swr: 60 },
  });

  it.each(["/api/getUsers", "/Blog/post"])("caches %s", async (url) => {
    const { body, headers } = await fetchTwice(fetchAs, url);
    expect(body).toContain("user=alice");
    expect(headers["cache-control"]).toBeDefined();
  });
});

// Used by the Netlify presets for platform-level (ISR) caching
describe("route rules: nested `isr: false`", async () => {
  runtimeConfig.nitro.routeRules = normalizeRouteRules({
    routeRules: {
      "/**": { isr: 60 },
      "/account/**": { isr: false },
      "/Admin/**": { isr: false },
    },
  });
  vi.resetModules();
  const { isRouteRuleDisabled } =
    await import("../../src/runtime/internal/route-rules");

  it.each([
    "/account",
    "/account/profile",
    "/account%2Fprofile",
    "//account/profile",
    "/x/..%2Faccount%2Fprofile",
    "/ACCOUNT/profile",
    "/admin/x",
  ])("disables isr for %s", (path) => {
    expect(isRouteRuleDisabled(path, "isr")).toBe(true);
  });

  it.each(["/home", "/accounts", "/x/account"])("keeps isr for %s", (path) => {
    expect(isRouteRuleDisabled(path, "isr")).toBe(false);
  });
});

describe("route rules: nested `isr: false` with base URL", async () => {
  runtimeConfig.nitro.routeRules = normalizeRouteRules({
    routeRules: {
      "/**": { isr: 60 },
      "/account/**": { isr: false },
    },
  });
  vi.resetModules();
  const { isRequestRouteRuleDisabled } =
    await import("../../src/runtime/internal/route-rules");

  beforeAll(() => {
    runtimeConfig.app.baseURL = "/app/";
  });
  afterAll(() => {
    runtimeConfig.app.baseURL = "/";
  });

  it.each([
    "/app/account",
    "/app/ACCOUNT/profile",
    "/APP/account",
    "/APP/account/profile",
    "/%41PP/account",
    "//APP/account",
    "/x/../APP/account",
  ])("disables isr for %s", (path) => {
    expect(isRequestRouteRuleDisabled(path, "isr")).toBe(true);
  });

  it.each([
    "/app/shop",
    "/APP/shop",
    "/app/app/account",
    "/APP/APP/account",
    "/application/account",
  ])("keeps isr for %s", (path) => {
    expect(isRequestRouteRuleDisabled(path, "isr")).toBe(false);
  });
});
