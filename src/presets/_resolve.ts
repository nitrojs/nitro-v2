import {
  type CompatibilityDateSpec,
  type PlatformName,
  resolveCompatibilityDatesFromEnv,
  formatCompatibilityDate,
} from "compatx";
import type { NitroPreset, NitroPresetMeta } from "nitropack/types";
import { kebabCase } from "scule";
import { type ProviderName, provider } from "std-env";
import presetEntries from "./_all.gen";

// std-env has more specific keys for providers than compatx
const _stdProviderMap: Partial<Record<ProviderName, PlatformName>> = {
  aws_amplify: "aws",
  azure_static: "azure",
  cloudflare_pages: "cloudflare",
};

export async function resolvePreset(
  name: string,
  opts: {
    static?: boolean;
    compatibilityDate?: false | CompatibilityDateSpec;
    dev?: boolean;
  } = {}
): Promise<(NitroPreset & { _meta?: NitroPresetMeta }) | undefined> {
  if (name === ".") {
    return undefined; // invalid input
  }

  const _name = kebabCase(name) || provider;

  const _compatDates = opts.compatibilityDate
    ? resolveCompatibilityDatesFromEnv(opts.compatibilityDate)
    : false;

  const matches = presetEntries
    .filter(({ meta }) => {
      // prettier-ignore
      const names = [meta.name, meta.stdName, ...(meta.aliases || [])].filter(Boolean);
      if (!names.includes(_name)) {
        return false;
      }

      // Match dev|prod
      if ((opts.dev && !meta.dev) || (!opts.dev && meta.dev)) {
        return false;
      }

      if (_compatDates) {
        const _date =
          _compatDates[_stdProviderMap[meta.stdName!] as PlatformName] ||
          _compatDates[meta.stdName as PlatformName] ||
          _compatDates[meta.name as PlatformName] ||
          _compatDates.default;

        if (
          _date &&
          meta.compatibilityDate &&
          new Date(meta.compatibilityDate) > new Date(_date)
        ) {
          return false;
        }
      }

      return true;
    })
    .sort((a, b) => {
      const aDate = new Date(a.meta.compatibilityDate || 0);
      const bDate = new Date(b.meta.compatibilityDate || 0);
      return bDate > aDate ? 1 : -1;
    });

  const match =
    matches.find(
      ({ meta }) => (meta.static || false) === (opts?.static || false)
    ) || matches[0];

  if (match) {
    const preset = await match.load();
    if (typeof preset === "function") {
      return preset();
    }
    return preset;
  }

  // Auto-detect preset
  if (!name) {
    return opts?.static
      ? resolvePreset("static", opts)
      : resolvePreset("node-server", opts);
  }

  // prettier-ignore
  const options = presetEntries
    .filter(({ meta }) => meta.name === name || meta.stdName === name || meta.aliases?.includes(name))
    .sort((a, b) => (a.meta.compatibilityDate || 0) > (b.meta.compatibilityDate || 0) ? 1 : -1);
  if (options.length > 0) {
    let msg = `Preset "${name}" cannot be resolved with current compatibilityDate: ${formatCompatibilityDate(_compatDates || "")}.\n\n`;
    for (const option of options) {
      msg += `\n- ${option.meta.name} (requires compatibilityDate >= ${option.meta.compatibilityDate})`;
    }
    const err = new Error(msg);
    Error.captureStackTrace?.(err, resolvePreset);
    throw err;
  }

  return undefined;
}
