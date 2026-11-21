import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "pathe";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createNitro, prepare, prerender } from "nitropack/core";

describe("prerender", () => {
  let rootDir: string;

  beforeAll(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "nitro-prerender-"));
    await mkdir(join(rootDir, "routes/api"), { recursive: true });
    await writeFile(
      join(rootDir, "routes/api/[...id].ts"),
      `export default defineEventHandler((event) => ({ id: event.context.params.id }));\n`
    );
  });

  afterAll(async () => {
    await rm(rootDir, { recursive: true, force: true });
  });

  it("prerenders filenames containing `..` but not `..` segments", async () => {
    const nitro = await createNitro({
      rootDir,
      preset: "static",
      logLevel: 0,
      prerender: {
        crawlLinks: false,
        routes: [
          "/api/hello..png",
          "/api/7/../8",
          "/api/7\\..\\9",
          "/api/7/%2e%2e/10",
        ],
      },
    });
    try {
      await prepare(nitro);
      await prerender(nitro);
      const publicDir = nitro.options.output.publicDir;
      expect(
        JSON.parse(await readFile(join(publicDir, "api/hello..png"), "utf8"))
      ).toMatchObject({ id: "hello..png" });
      expect(existsSync(join(publicDir, "api/8"))).toBe(false);
      expect(existsSync(join(publicDir, "api/9"))).toBe(false);
      expect(existsSync(join(publicDir, "api/10"))).toBe(false);
      expect(existsSync(join(publicDir, "api/7"))).toBe(false);
    } finally {
      await nitro.close();
    }
  });

  it("sets linking pages on failed routes", async () => {
    const linkedRootDir = await mkdtemp(
      join(tmpdir(), "nitro-prerender-linked-")
    );
    await mkdir(join(linkedRootDir, "routes"), { recursive: true });
    await writeFile(
      join(linkedRootDir, "routes/links.ts"),
      `export default defineEventHandler(() => \`<!DOCTYPE html><html><body><a href="/missing">missing</a></body></html>\`);\n`
    );
    const nitro = await createNitro({
      rootDir: linkedRootDir,
      preset: "static",
      logLevel: 0,
      prerender: {
        crawlLinks: true,
        routes: ["/missing", "/links"],
      },
    });
    const routed: Record<string, string[] | undefined> = {};
    const failedRoutes: { route: string; linkedFrom?: string[] }[] = [];
    nitro.hooks.hook("prerender:route", (route) => {
      routed[route.route] = route.linkedFrom
        ? [...route.linkedFrom]
        : route.linkedFrom;
    });
    nitro.hooks.hook("prerender:done", (ctx) => {
      for (const route of ctx.failedRoutes) {
        failedRoutes.push({
          route: route.route,
          linkedFrom: route.linkedFrom,
        });
      }
    });
    try {
      await prepare(nitro);
      await prerender(nitro);
      expect(routed["/missing"]).toEqual([]);
      expect(
        failedRoutes.find((route) => route.route === "/missing")?.linkedFrom
      ).toEqual(["/links"]);
    } finally {
      await nitro.close();
      await rm(linkedRootDir, { recursive: true, force: true });
    }
  });

  it("does not leak linking pages between prerender runs", async () => {
    const firstRootDir = await mkdtemp(
      join(tmpdir(), "nitro-prerender-leak-1-")
    );
    await mkdir(join(firstRootDir, "routes"), { recursive: true });
    await writeFile(
      join(firstRootDir, "routes/links.ts"),
      `export default defineEventHandler(() => \`<!DOCTYPE html><html><body><a href="/missing">missing</a></body></html>\`);\n`
    );
    const first = await createNitro({
      rootDir: firstRootDir,
      preset: "static",
      logLevel: 0,
      prerender: { crawlLinks: true, routes: ["/links"] },
    });
    try {
      await prepare(first);
      await prerender(first);
    } finally {
      await first.close();
      await rm(firstRootDir, { recursive: true, force: true });
    }

    const secondRootDir = await mkdtemp(
      join(tmpdir(), "nitro-prerender-leak-2-")
    );
    const second = await createNitro({
      rootDir: secondRootDir,
      preset: "static",
      logLevel: 0,
      prerender: { crawlLinks: false, routes: ["/missing"] },
    });
    const failedRoutes: { route: string; linkedFrom?: string[] }[] = [];
    second.hooks.hook("prerender:done", (ctx) => {
      for (const route of ctx.failedRoutes) {
        failedRoutes.push({
          route: route.route,
          linkedFrom: route.linkedFrom,
        });
      }
    });
    try {
      await prepare(second);
      await prerender(second);
      expect(
        failedRoutes.find((route) => route.route === "/missing")?.linkedFrom
      ).toEqual([]);
    } finally {
      await second.close();
      await rm(secondRootDir, { recursive: true, force: true });
    }
  });

  it("tracks linking pages for encoded routes", async () => {
    const encodedRootDir = await mkdtemp(
      join(tmpdir(), "nitro-prerender-encoded-")
    );
    await mkdir(join(encodedRootDir, "routes"), { recursive: true });
    await writeFile(
      join(encodedRootDir, "routes/links.ts"),
      `export default defineEventHandler(() => \`<!DOCTYPE html><html><body><a href="/caf%C3%A9">café</a></body></html>\`);\n`
    );
    const nitro = await createNitro({
      rootDir: encodedRootDir,
      preset: "static",
      logLevel: 0,
      prerender: { crawlLinks: true, routes: ["/links"] },
    });
    const failedRoutes: { route: string; linkedFrom?: string[] }[] = [];
    nitro.hooks.hook("prerender:done", (ctx) => {
      for (const route of ctx.failedRoutes) {
        failedRoutes.push({
          route: route.route,
          linkedFrom: route.linkedFrom,
        });
      }
    });
    try {
      await prepare(nitro);
      await prerender(nitro);
      expect(
        failedRoutes.find((route) => route.route === "/café")?.linkedFrom
      ).toEqual(["/links"]);
    } finally {
      await nitro.close();
      await rm(encodedRootDir, { recursive: true, force: true });
    }
  });

  it("does not abort on links that fail to decode", async () => {
    const headerRootDir = await mkdtemp(
      join(tmpdir(), "nitro-prerender-header-")
    );
    await mkdir(join(headerRootDir, "routes"), { recursive: true });
    await writeFile(
      join(headerRootDir, "routes/header.ts"),
      `import { appendHeader } from "h3";
export default defineEventHandler((event) => {
  appendHeader(event, "x-nitro-prerender", "/ignored%25");
  return "<!DOCTYPE html><html><body></body></html>";
});\n`
    );
    const nitro = await createNitro({
      rootDir: headerRootDir,
      preset: "static",
      logLevel: 0,
      prerender: { crawlLinks: false, routes: ["/header"] },
    });
    const routed: string[] = [];
    nitro.hooks.hook("prerender:route", (route) => {
      routed.push(route.route);
    });
    try {
      await prepare(nitro);
      await prerender(nitro);
      expect(routed).toContain("/header");
    } finally {
      await nitro.close();
      await rm(headerRootDir, { recursive: true, force: true });
    }
  });
});
