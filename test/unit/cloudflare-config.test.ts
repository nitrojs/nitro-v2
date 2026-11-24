import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { createNitro } from "nitropack/core";
import { join, resolve } from "pathe";
import { describe, expect, it, vi } from "vitest";

describe("Cloudflare asset configuration diagnostics", () => {
  it.each([
    {
      title: "routing policy",
      fileAssets: { html_handling: "drop-trailing-slash" as const },
      contextAssets: {},
      warns: false,
    },
    {
      title: "matching generated values",
      fileAssets: { binding: "ASSETS", directory: "./.output/public" },
      contextAssets: {},
      warns: false,
    },
    {
      title: "matching directory with trailing slash",
      fileAssets: { directory: ".output/public/" },
      contextAssets: {},
      warns: false,
    },
    {
      title: "matching directory with Windows separators",
      fileAssets: { directory: ".\\.output\\public" },
      contextAssets: {},
      warns: false,
    },
    {
      title: "unset asset fields from JSON",
      fileAssets: { directory: null, binding: null },
      contextAssets: {},
      warns: false,
    },
    {
      title: "conflicting file binding with context routing policy",
      fileAssets: { binding: "CUSTOM" },
      contextAssets: { html_handling: "drop-trailing-slash" as const },
      warns: "file",
    },
    {
      title: "context binding precedence",
      fileAssets: { binding: "CUSTOM" },
      contextAssets: { binding: "ASSETS" },
      warns: false,
    },
    {
      title: "conflicting context binding",
      fileAssets: {},
      contextAssets: { binding: "CUSTOM" },
      warns: "context",
    },
    {
      title: "conflicting asset directory",
      fileAssets: { directory: "./custom" },
      contextAssets: {},
      warns: "file",
    },
    {
      title: "file directory relative to generated config",
      fileAssets: { directory: "../public" },
      contextAssets: {},
      warns: "file",
    },
    {
      title: "matching context directory",
      fileAssets: {},
      contextAssets: { directory: "../public" },
      warns: false,
    },
    {
      title: "conflicting context directory",
      fileAssets: {},
      contextAssets: { directory: "./.output/public" },
      warns: "context",
    },
  ])(
    "reports $title correctly",
    async ({ fileAssets, contextAssets, warns }) => {
      const rootDir = await mkdtemp(
        join(tmpdir(), "nitro-assets-diagnostics-")
      );
      await writeFile(
        join(rootDir, "wrangler.json"),
        JSON.stringify({ name: "test-worker", assets: fileAssets })
      );
      const nitro = await createNitro({
        rootDir,
        preset: "cloudflare-module",
        compatibilityDate: "2026-09-30",
        cloudflare: { deployConfig: true, wrangler: { assets: contextAssets } },
      });
      const warn = vi.spyOn(nitro.logger, "warn");
      try {
        await nitro.hooks.callHook("compiled", nitro);
        const generated = JSON.parse(
          await readFile(
            join(nitro.options.output.serverDir, "wrangler.json"),
            "utf8"
          )
        );
        expect(generated.assets.binding).toBe("ASSETS");
        expect(
          resolve(nitro.options.output.serverDir, generated.assets.directory)
        ).toBe(resolve(nitro.options.output.publicDir));
        const message = warn.mock.calls
          .map(([message]) => String(message))
          .find((message) => message.includes("Wrangler config `assets`"));
        expect(Boolean(message)).toBe(Boolean(warns));
        if (message) {
          expect(message.includes(" set by config or modules")).toBe(
            warns === "context"
          );
        }
        if ("html_handling" in contextAssets || "html_handling" in fileAssets) {
          expect(generated.assets.html_handling).toBe("drop-trailing-slash");
        }
      } finally {
        warn.mockRestore();
        await nitro.close();
        await rm(rootDir, { recursive: true, force: true });
      }
    }
  );
});

describe("Cloudflare wrangler.jsonc", () => {
  it("parses comments and trailing commas", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "nitro-wrangler-jsonc-"));
    await writeFile(
      join(rootDir, "wrangler.jsonc"),
      /* jsonc */ `{
  // Worker name
  "name": "jsonc-worker", /* block comment */
  "compatibility_flags": ["streams_enable_constructors",],
  "vars": { "API_URL": "https://example.com/api", },
}
`
    );
    const nitro = await createNitro({
      rootDir,
      preset: "cloudflare-module",
      compatibilityDate: "2026-09-30",
      cloudflare: { deployConfig: true },
    });
    try {
      await nitro.hooks.callHook("compiled", nitro);
      const generated = JSON.parse(
        await readFile(
          join(nitro.options.output.serverDir, "wrangler.json"),
          "utf8"
        )
      );
      expect(generated.name).toBe("jsonc-worker");
      expect(generated.compatibility_flags).toContain(
        "streams_enable_constructors"
      );
      expect(generated.vars).toEqual({ API_URL: "https://example.com/api" });
    } finally {
      await nitro.close();
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe("Cloudflare module assets directory", () => {
  it.each(["/", "/foo/", "/foo/bar/", "/foo/bar/baz/"])(
    "points to public root with baseURL %s",
    async (baseURL) => {
      const rootDir = await mkdtemp(join(tmpdir(), "nitro-assets-baseurl-"));
      const nitro = await createNitro({
        rootDir,
        baseURL,
        preset: "cloudflare-module",
        compatibilityDate: "2026-09-30",
        cloudflare: { deployConfig: true },
      });
      try {
        await nitro.hooks.callHook("compiled", nitro);
        const generated = JSON.parse(
          await readFile(
            join(nitro.options.output.serverDir, "wrangler.json"),
            "utf8"
          )
        );
        expect(generated.assets.directory).not.toContain("\\");
        expect(generated.assets.directory).toBe("../public");
      } finally {
        await nitro.close();
        await rm(rootDir, { recursive: true, force: true });
      }
    }
  );
});

describe("Cloudflare module wrangler entry", () => {
  it.each([
    { static: false, main: "index.mjs", binding: "ASSETS" },
    { static: true, main: undefined, binding: undefined },
  ])("static: $static", async ({ static: isStatic, main, binding }) => {
    const rootDir = await mkdtemp(join(tmpdir(), "nitro-wrangler-static-"));
    const nitro = await createNitro({
      rootDir,
      static: isStatic,
      preset: "cloudflare-module",
      compatibilityDate: "2026-09-30",
      cloudflare: { deployConfig: true },
    });
    try {
      await nitro.hooks.callHook("compiled", nitro);
      const generated = JSON.parse(
        await readFile(
          join(nitro.options.output.serverDir, "wrangler.json"),
          "utf8"
        )
      );
      expect(generated.main).toBe(main);
      expect(generated.assets.binding).toBe(binding);
      expect(generated.assets.directory).toBe("../public");
    } finally {
      await nitro.close();
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});

describe("Cloudflare wrangler.toml compatibility_date", () => {
  it("infers node compat from an unquoted date on or after 2026-08-04", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "nitro-wrangler-toml-"));
    await writeFile(
      join(rootDir, "wrangler.toml"),
      `name = "toml-worker"\ncompatibility_date = 2026-09-01\n`
    );
    const nitro = await createNitro({
      rootDir,
      preset: "cloudflare-module",
      compatibilityDate: "2026-09-30",
    });
    try {
      await nitro.hooks.callHook("build:before", nitro);
      expect(nitro.options.cloudflare?.nodeCompat).toBe(true);
      nitro.options.cloudflare!.deployConfig = true;
      await nitro.hooks.callHook("compiled", nitro);
      const generated = JSON.parse(
        await readFile(
          join(nitro.options.output.serverDir, "wrangler.json"),
          "utf8"
        )
      );
      expect(generated.compatibility_date).toBe("2026-09-01");
      expect(generated.compatibility_flags).not.toContain("nodejs_compat");
      expect(generated.compatibility_flags).toContain("no_nodejs_compat_v2");
    } finally {
      await nitro.close();
      await rm(rootDir, { recursive: true, force: true });
    }
  });

  it("adds nodejs_compat for an unquoted date before 2026-08-04", async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "nitro-wrangler-toml-"));
    await writeFile(
      join(rootDir, "wrangler.toml"),
      `name = "toml-worker"\ncompatibility_date = 2025-01-01\n`
    );
    const nitro = await createNitro({
      rootDir,
      preset: "cloudflare-module",
      compatibilityDate: "2026-09-30",
      cloudflare: { deployConfig: true, nodeCompat: true },
    });
    try {
      await nitro.hooks.callHook("compiled", nitro);
      const generated = JSON.parse(
        await readFile(
          join(nitro.options.output.serverDir, "wrangler.json"),
          "utf8"
        )
      );
      expect(generated.compatibility_date).toBe("2025-01-01");
      expect(generated.compatibility_flags).toContain("nodejs_compat");
    } finally {
      await nitro.close();
      await rm(rootDir, { recursive: true, force: true });
    }
  });
});
