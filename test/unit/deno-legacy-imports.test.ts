import { describe, expect, it } from "vitest";
import { denoServerLegacy } from "../../src/presets/deno/preset-legacy";

function getRenderChunk() {
  const plugins = (denoServerLegacy.rollupConfig?.plugins || []) as any[];
  const plugin = plugins.find((p) => p?.name === "rollup-plugin-node-deno");
  return plugin.renderChunk as (code: string) => { code: string } | undefined;
}

describe("deno-server-legacy: import rewriting", () => {
  it("rewrites bare and builtin specifiers", () => {
    const result = getRenderChunk()(
      [`import x from 'some-pkg';`, `import { join } from "path";`].join("\n")
    );
    expect(result?.code).toBe(
      [
        `import x from "npm:some-pkg";`,
        `import { join } from "node:path";`,
      ].join("\n")
    );
  });

  it("inserts rewritten imports literally (no `$` pattern expansion)", () => {
    const code = [
      `import { $ as $$1 } from 'zx';`,
      `import { $$ } from "x";`,
      `const $ = 1;`,
      `console.log($$1, $$, $);`,
    ].join("\n");
    const result = getRenderChunk()(code);
    expect(result?.code).toBe(
      [
        `import { $ as $$1 } from "npm:zx";`,
        `import { $$ } from "npm:x";`,
        `const $ = 1;`,
        `console.log($$1, $$, $);`,
      ].join("\n")
    );
  });
});
