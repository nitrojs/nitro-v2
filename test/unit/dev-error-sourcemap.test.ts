import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { SourceMapGenerator } from "source-map";

const sourceMapStats = vi.hoisted(() => ({ created: 0, destroyed: 0 }));

vi.mock("source-map", async (importOriginal) => {
  const mod = await importOriginal<typeof import("source-map")>();
  function SourceMapConsumer(this: unknown, raw: any) {
    sourceMapStats.created++;
    return (new mod.SourceMapConsumer(raw) as any).then((consumer: any) => {
      const destroy = consumer.destroy.bind(consumer);
      consumer.destroy = () => {
        sourceMapStats.destroyed++;
        destroy();
      };
      return consumer;
    });
  }
  return { ...mod, SourceMapConsumer };
});

const { loadStackTrace } = await import("../../src/runtime/internal/error/dev");

describe("dev error handler: source maps", () => {
  let dir: string;
  let bundle: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "nitro-dev-sourcemap-"));
    bundle = join(dir, "index.mjs");
    await writeFile(bundle, Array.from({ length: 5 }, () => "x();").join("\n"));
    const map = new SourceMapGenerator({ file: "index.mjs" });
    for (let line = 1; line <= 5; line++) {
      map.addMapping({
        source: "../src/handler.ts",
        generated: { line, column: 0 },
        original: { line: line * 10, column: 2 },
      });
    }
    await writeFile(`${bundle}.map`, map.toString());
  });

  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("parses the bundle source map once per error", async () => {
    const error = new Error("boom");
    error.stack = [
      "Error: boom",
      ...Array.from(
        { length: 5 },
        (_, i) => `    at fn${i} (${bundle}:${i + 1}:1)`
      ),
    ].join("\n");

    sourceMapStats.created = 0;
    sourceMapStats.destroyed = 0;
    await loadStackTrace(error);

    expect(sourceMapStats.created).toBe(1);
    expect(sourceMapStats.destroyed).toBe(1);
    const original = join(dir, "../src/handler.ts");
    for (let i = 0; i < 5; i++) {
      // source map column 2 (0-based) -> stack column 3 (1-based)
      expect(error.stack).toContain(`${original}:${(i + 1) * 10}:3`);
    }
  });

  it("converts between 1-based stack columns and 0-based source map columns", async () => {
    // `a(); b();` — `a` at 0-based column 0, `b` at 0-based column 5
    const colBundle = join(dir, "columns.mjs");
    await writeFile(colBundle, "a(); b();");
    const map = new SourceMapGenerator({ file: "columns.mjs" });
    map.addMapping({
      source: "../src/a.ts",
      generated: { line: 1, column: 0 },
      original: { line: 7, column: 4 },
    });
    map.addMapping({
      source: "../src/b.ts",
      generated: { line: 1, column: 5 },
      original: { line: 9, column: 6 },
    });
    await writeFile(`${colBundle}.map`, map.toString());

    const error = new Error("boom");
    error.stack = [
      "Error: boom",
      // 1-based column 5 is the space before `b` (0-based column 4) -> `a` segment
      `    at a (${colBundle}:1:5)`,
      // 1-based column 6 is `b` (0-based column 5) -> `b` segment
      `    at b (${colBundle}:1:6)`,
    ].join("\n");
    await loadStackTrace(error);

    expect(error.stack).toContain(`${join(dir, "../src/a.ts")}:7:5`);
    expect(error.stack).toContain(`${join(dir, "../src/b.ts")}:9:7`);
  });

  it("keeps the original frame when the source map is invalid", async () => {
    const brokenBundle = join(dir, "broken.mjs");
    await writeFile(brokenBundle, "x();");
    await writeFile(`${brokenBundle}.map`, "{ not json");

    const error = new Error("boom");
    error.stack = `Error: boom\n    at fn (${brokenBundle}:1:1)`;
    await expect(loadStackTrace(error)).resolves.toBeUndefined();
    // The stack parser normalizes frame paths to forward slashes (Windows)
    expect(error.stack).toContain(`${brokenBundle.replaceAll("\\", "/")}:1:1`);
  });
});
