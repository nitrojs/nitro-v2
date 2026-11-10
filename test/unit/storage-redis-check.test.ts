import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import type { Nitro } from "nitropack/types";
import { join } from "pathe";
import { afterEach, describe, expect, it } from "vitest";
import { storage } from "../../src/rollup/plugins/storage";

describe("storage: redis driver requires ioredis", () => {
  const dirs: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true }))
    );
  });

  async function createDir(withIoredis: boolean) {
    const dir = await mkdtemp(join(tmpdir(), "nitro-storage-redis-"));
    dirs.push(dir);
    if (withIoredis) {
      const pkgDir = join(dir, "node_modules/ioredis");
      await mkdir(pkgDir, { recursive: true });
      await writeFile(
        join(pkgDir, "package.json"),
        JSON.stringify({ name: "ioredis", version: "5.0.0", main: "index.js" })
      );
      await writeFile(join(pkgDir, "index.js"), "module.exports = {};");
    }
    return dir;
  }

  function createNitro(
    rootDir: string,
    opts: Partial<Nitro["options"]> = {}
  ): Nitro {
    return {
      options: {
        dev: false,
        preset: "node-server",
        storage: {},
        devStorage: {},
        bundledStorage: [],
        rootDir,
        nodeModulesDirs: [join(rootDir, "node_modules") + "/"],
        ...opts,
      },
      vfs: {},
    } as unknown as Nitro;
  }

  it("does not throw when ioredis can be resolved", async () => {
    const rootDir = await createDir(true);
    const nitro = createNitro(rootDir, {
      storage: { cache: { driver: "redis" } },
    });
    expect(() => storage(nitro)).not.toThrow();
  });

  it("resolves ioredis from other node_modules dirs (hoisted install)", async () => {
    const rootDir = await createDir(false);
    const workspaceDir = await createDir(true);
    const nitro = createNitro(rootDir, {
      storage: { cache: { driver: "redis" } },
      nodeModulesDirs: [
        join(workspaceDir, "node_modules") + "/",
        join(rootDir, "node_modules") + "/",
      ],
    });
    expect(() => storage(nitro)).not.toThrow();
  });

  it("throws a clear error naming the mount when ioredis is missing", async () => {
    const rootDir = await createDir(false);
    const nitro = createNitro(rootDir, {
      storage: { cache: { driver: "redis" } },
    });
    expect(() => storage(nitro)).toThrowError(
      '[nitro] Storage mount "cache" uses the "redis" driver, but the "ioredis" package is not installed. Run `npm i ioredis` (it is no longer a dependency of nitropack).'
    );
  });

  it("detects the driver when given as `unstorage/drivers/redis`", async () => {
    const rootDir = await createDir(false);
    const nitro = createNitro(rootDir, {
      storage: { kv: { driver: "unstorage/drivers/redis" } },
    });
    expect(() => storage(nitro)).toThrowError('Storage mount "kv"');
  });

  it("checks devStorage only in dev", async () => {
    const rootDir = await createDir(false);
    const devStorage = { redis: { driver: "redis" } };
    expect(() =>
      storage(createNitro(rootDir, { dev: false, devStorage }))
    ).not.toThrow();
    expect(() =>
      storage(createNitro(rootDir, { dev: true, devStorage }))
    ).toThrowError('Storage mount "redis"');
  });

  it("does not check when no mount uses the redis driver", async () => {
    const rootDir = await createDir(false);
    const nitro = createNitro(rootDir, {
      storage: { data: { driver: "fs", base: "./data" } },
    });
    expect(() => storage(nitro)).not.toThrow();
  });
});
