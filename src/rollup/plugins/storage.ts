import { resolveModulePath } from "exsolve";
import { genImport, genSafeVariableName } from "knitwork";
import type { Nitro } from "nitropack/types";
import { resolve } from "pathe";
import { builtinDrivers } from "unstorage";
import { virtual } from "./virtual";

export function storage(nitro: Nitro) {
  const mounts: { path: string; driver: string; opts: object }[] = [];

  const isDevOrPrerender =
    nitro.options.dev || nitro.options.preset === "nitro-prerender";
  const storageMounts = isDevOrPrerender
    ? { ...nitro.options.storage, ...nitro.options.devStorage }
    : nitro.options.storage;

  for (const path in storageMounts) {
    const mount = storageMounts[path];
    mounts.push({
      path,
      driver:
        builtinDrivers[mount.driver as keyof typeof builtinDrivers] ||
        mount.driver,
      opts: mount,
    });
  }

  assertStorageDriverDeps(mounts, [
    resolve(nitro.options.rootDir) + "/",
    ...nitro.options.nodeModulesDirs,
  ]);

  const driverImports = [...new Set(mounts.map((m) => m.driver))];

  const bundledStorageCode = `
import { prefixStorage } from 'unstorage'
import overlay from 'unstorage/drivers/overlay'
import memory from 'unstorage/drivers/memory'

const bundledStorage = ${JSON.stringify(nitro.options.bundledStorage)}
for (const base of bundledStorage) {
  storage.mount(base, overlay({
    layers: [
      memory(),
      // TODO
      // prefixStorage(storage, base),
      prefixStorage(storage, 'assets:nitro:bundled:' + base)
    ]
  }))
}`;

  return virtual(
    {
      "#nitro-internal-virtual/storage": `
import { createStorage } from 'unstorage'
import { assets } from '#nitro-internal-virtual/server-assets'

${driverImports.map((i) => genImport(i, genSafeVariableName(i))).join("\n")}

export const storage = createStorage({})

storage.mount('/assets', assets)

${mounts
  .map(
    (m) =>
      `storage.mount('${m.path}', ${genSafeVariableName(
        m.driver
      )}(${JSON.stringify(m.opts)}))`
  )
  .join("\n")}

${
  !isDevOrPrerender && nitro.options.bundledStorage.length > 0
    ? bundledStorageCode
    : ""
}
`,
    },
    nitro.vfs
  );
}

/**
 * Fail early when a bundled mount uses the `redis` driver but `ioredis`
 * (an optional peer dependency of unstorage) cannot be resolved.
 *
 * Mounts added at runtime (e.g. `useStorage().mount()` in a plugin) are not checked.
 */
export function assertStorageDriverDeps(
  mounts: { path: string; driver: string }[],
  lookupDirs: string[]
) {
  const redisMount = mounts.find((m) => m.driver === builtinDrivers.redis);
  if (!redisMount) {
    return;
  }
  // Also look next to the driver itself, as rollup resolves imports from the importer
  const driverPath = resolveModulePath(builtinDrivers.redis, {
    from: lookupDirs,
    try: true,
  });
  const ioredisPath = resolveModulePath("ioredis", {
    from: driverPath ? [...lookupDirs, driverPath] : lookupDirs,
    try: true,
  });
  if (!ioredisPath) {
    throw new Error(
      `[nitro] Storage mount "${redisMount.path}" uses the "redis" driver, but the "ioredis" package is not installed. Run \`npm i ioredis\` (it is no longer a dependency of nitropack).`
    );
  }
}
