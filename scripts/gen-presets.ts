import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { consola } from "consola";
import { createJiti } from "jiti";
import { findTypeExports } from "mlly";
import type { NitroPreset, NitroPresetMeta } from "nitropack/types";
import { camelCase, kebabCase, pascalCase, snakeCase } from "scule";
import { subpaths } from "../build.config";

const autoGenHeader = /* ts */ `// Auto-generated using gen-presets script\n`;

// --- Scan presets/ directory ---
const presetsDir = fileURLToPath(new URL("../src/presets", import.meta.url));
const presetDirs: string[] = readdirSync(presetsDir, { withFileTypes: true })
  .filter(
    (dir) =>
      dir.isDirectory() &&
      existsSync(resolve(presetsDir, dir.name, "preset.ts"))
  )
  .map((dir) => dir.name);

// --- Load presets ---
const jiti = createJiti(presetsDir, {
  alias: {
    nitropack: fileURLToPath(new URL("../src/core/index.ts", import.meta.url)),
    ...Object.fromEntries(
      subpaths.map((pkg) => [
        `nitropack/${pkg}`,
        fileURLToPath(new URL(`../src/${pkg}/index.ts`, import.meta.url)),
      ])
    ),
  },
});
const allPresets: (NitroPreset & { _meta?: NitroPresetMeta })[] = [];
const presetEntries: { dir: string; index: number }[] = [];
for (const preset of presetDirs) {
  const presetPath = resolve(presetsDir, preset, "preset.ts");
  const _presets = await jiti
    .import(presetPath)
    .then((mod) => (mod as any).default || mod);
  const list = Array.isArray(_presets) ? _presets : [_presets];
  for (const [index, presetEntry] of list.entries()) {
    presetEntries.push({ dir: preset, index });
    allPresets.push(presetEntry);
  }
}

// --- Validate names ---
const _names = new Set<string>();
for (const preset of allPresets) {
  if (!preset._meta?.name) {
    consola.warn(`Preset ${preset} does not have a name`);
    continue;
  }
  const names = [preset._meta.name, ...(preset._meta.aliases || [])];
  for (const name of names) {
    if (_names.has(name)) {
      if (!preset._meta.compatibilityDate && !preset._meta.dev) {
        consola.warn(`Preset ${name} is duplicated`);
      }
      continue;
    }
    if (kebabCase(name) !== name) {
      consola.warn(`Preset ${name} is not kebab-case`);
    }
    _names.add(name);
  }
}
const names = [..._names].sort();
consola.log(names.join(", "));

// --- Generate presets/_all.gen.ts ---
const presetEntryLines = presetEntries
  .map(({ dir, index }, i) => {
    const meta = allPresets[i]?._meta;
    const fields = {
      name: meta?.name,
      stdName: meta?.stdName,
      aliases: meta?.aliases,
      static: meta?.static,
      dev: meta?.dev,
      compatibilityDate: meta?.compatibilityDate,
    };
    return `  { meta: ${JSON.stringify(fields)}, load: () => import("./${dir}/preset").then((m) => m.default[${index}]) },`;
  })
  .join("\n");
writeFileSync(
  resolve(presetsDir, "_all.gen.ts"),
  /* ts */ `${autoGenHeader}
import type { NitroPreset, NitroPresetMeta } from "nitropack/types";

type PresetMeta = Omit<NitroPresetMeta, "url">;

export interface PresetEntry {
  meta: PresetMeta;
  load: () => Promise<NitroPreset>;
}

const presetEntries: PresetEntry[] = [
${presetEntryLines}
];

export default presetEntries;
`
);
// --- Generate presets/_types.gen.ts ---
const presetsWithType = presetDirs.filter((presetDir) => {
  const presetPath = resolve(presetsDir, presetDir, "preset.ts");
  const content = readFileSync(presetPath, "utf8");
  const typeExports = findTypeExports(content);
  return typeExports.some((type) => type.name === "PresetOptions");
});
writeFileSync(
  resolve(presetsDir, "_types.gen.ts"),
  /* ts */ `${autoGenHeader}
${presetsWithType
  .map(
    (preset) =>
      `import type { PresetOptions as ${pascalCase(
        preset
      )}Options } from "./${preset}/preset";`
  )
  .join("\n")}

export interface PresetOptions {
${presetsWithType
  .map((preset) => `  ${camelCase(preset)}?: ${pascalCase(preset)}Options;`)
  .join("\n")}
}

export const presetsWithConfig = ${JSON.stringify(presetsWithType.map((p) => camelCase(p)))} as const;

export type PresetName = ${names.map((name) => `"${name}"`).join(" | ")};

export type PresetNameInput = ${names
    .flatMap((name) =>
      [...new Set([kebabCase(name), camelCase(name), snakeCase(name)])].map(
        (n) => `"${n}"`
      )
    )
    .join(" | ")} | (string & {});
`
);
