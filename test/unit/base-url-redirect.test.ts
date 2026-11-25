import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build, createDevServer, createNitro, prepare } from "nitropack/core";
import type { Nitro } from "nitropack/types";

type Fetch = (path: string) => Promise<Response>;

describe("base URL redirect", () => {
  let rootDir: string;
  const cleanup: Array<() => unknown> = [];

  beforeAll(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "nitro-base-url-"));
    await mkdir(join(rootDir, "routes/account"), { recursive: true });
    for (const [file, body] of [
      ["account/index.ts", "account"],
      ["account/settings.ts", "settings"],
      ["shop.ts", "shop"],
    ]) {
      await writeFile(
        join(rootDir, "routes", file),
        `export default defineEventHandler(() => ${JSON.stringify(body)});\n`
      );
    }
  });

  afterAll(async () => {
    for (const fn of cleanup.reverse()) {
      await fn();
    }
    await rm(rootDir, { recursive: true, force: true });
  });

  async function setup(preset: string): Promise<Nitro> {
    const nitro = await createNitro({
      compatibilityDate: "latest",
      rootDir,
      preset,
      dev: preset === "nitro-dev",
      logLevel: 0,
      baseURL: "/app/",
      buildDir: join(rootDir, preset, ".nitro"),
      output: { dir: join(rootDir, preset, ".output") },
      routeRules: {
        "/**": {
          isr: 60,
          headers: { "cache-control": "public, s-maxage=60" },
        },
        "/account/**": {
          isr: false,
          cache: false,
          headers: { "cache-control": "private, no-store" },
        },
      },
    });
    cleanup.push(() => nitro.close());
    if (!nitro.options.dev) {
      await prepare(nitro);
      await build(nitro);
    }
    return nitro;
  }

  async function setupNode(preset: string): Promise<Fetch> {
    const nitro = await setup(preset);
    let url: string;
    if (nitro.options.dev) {
      const server = await createDevServer(nitro).listen(
        {},
        { hostname: "127.0.0.1" }
      );
      url = server.url.replace("localhost", "127.0.0.1");
      const ready = new Promise<void>((resolve) => {
        nitro.hooks.hook("dev:reload", () => resolve());
      });
      await prepare(nitro);
      await build(nitro);
      await ready;
    } else {
      const { listener } = await import(
        join(nitro.options.output.serverDir, "index.mjs")
      );
      const server = createServer(listener);
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve)
      );
      cleanup.push(() => server.close());
      url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    }
    return (path) => fetch(new URL(path, url), { redirect: "manual" });
  }

  describe.each(["node-listener", "nitro-dev"])("%s", (preset) => {
    let fetchPath: Fetch;
    beforeAll(async () => {
      fetchPath = await setupNode(preset);
    }, 60_000);

    it.each(["/APP/account", "/APP/account/settings", "/APP/shop"])(
      "redirects %s without route rule cache headers",
      async (path) => {
        const res = await fetchPath(path);
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(`/app${path}`);
        expect(res.headers.get("cache-control")).toBe("no-cache");
      }
    );

    it("applies route rule headers under the base URL", async () => {
      const account = await fetchPath("/app/account");
      expect(account.status).toBe(200);
      expect(account.headers.get("cache-control")).toBe("private, no-store");
      const shop = await fetchPath("/app/shop");
      expect(shop.status).toBe(200);
      expect(shop.headers.get("cache-control")).toBe("public, s-maxage=60");
    });
  });

  describe("netlify", () => {
    let fetchPath: Fetch;
    beforeAll(async () => {
      const nitro = await setup("netlify");
      const { default: handler } = await import(
        join(nitro.options.output.serverDir, "main.mjs")
      );
      fetchPath = (path) =>
        handler(new Request(`https://example.com${path}`), {});
    }, 60_000);

    it.each(["/APP/account", "/APP/account/settings", "/%41PP/account"])(
      "does not add isr cache headers to the %s redirect",
      async (path) => {
        const res = await fetchPath(path);
        expect(res.status).toBe(302);
        expect(res.headers.get("location")).toBe(`/app${path}`);
        expect(res.headers.get("netlify-cdn-cache-control")).toBeNull();
        expect(res.headers.get("cache-control")).toBe("no-cache");
      }
    );

    it("redirects /APP/shop", async () => {
      const res = await fetchPath("/APP/shop");
      expect(res.status).toBe(302);
      expect(res.headers.get("location")).toBe("/app/APP/shop");
      expect(res.headers.get("cache-control")).toBe("no-cache");
    });

    it("applies isr under the base URL", async () => {
      const account = await fetchPath("/app/account");
      expect(account.status).toBe(200);
      expect(account.headers.get("netlify-cdn-cache-control")).toBeNull();
      expect(account.headers.get("cache-control")).toBe("private, no-store");
      const shop = await fetchPath("/app/shop");
      expect(shop.status).toBe(200);
      expect(shop.headers.get("netlify-cdn-cache-control")).toBe(
        "public, max-age=60, stale-while-revalidate=31536000, durable"
      );
    });
  });

  describe("netlify-legacy", () => {
    let callPath: (path: string) => Promise<any>;
    beforeAll(async () => {
      const nitro = await setup("netlify-legacy");
      const { handler } = await import(
        join(nitro.options.output.serverDir, "server.mjs")
      );
      callPath = (path) =>
        handler({ path, httpMethod: "GET", headers: {}, body: "" }, {});
    }, 60_000);

    it.each(["/APP/account", "/APP/account/settings"])(
      "does not use isr for the %s redirect",
      async (path) => {
        const res = await callPath(path);
        expect(res.statusCode).toBe(302);
        expect(res.ttl).toBeUndefined();
      }
    );

    it("uses isr under the base URL", async () => {
      expect((await callPath("/app/account")).ttl).toBeUndefined();
      expect((await callPath("/app/shop")).ttl).toBe(60);
    });
  });
});
