import destr from "destr";
import { snakeCase } from "scule";

export type EnvOptions = {
  prefix?: string;
  altPrefix?: string;
  envExpansion?: boolean;
};

// `useRuntimeConfig(event)` applies env overrides to the whole runtime config on every request, and the
// env name only depends on the key, so it is converted once instead of once per key per request
const envKeys = new Map<string, string>();
const MAX_ENV_KEYS = 5000;

function toEnvKey(key: string) {
  let envKey = envKeys.get(key);
  if (envKey === undefined) {
    envKey = snakeCase(key).toUpperCase();
    if (envKeys.size < MAX_ENV_KEYS) {
      envKeys.set(key, envKey);
    }
  }
  return envKey;
}

export function getEnv(key: string, opts: EnvOptions) {
  const envKey = toEnvKey(key);
  return destr(
    process.env[opts.prefix + envKey] ?? process.env[opts.altPrefix + envKey]
  );
}

function _isObject(input: unknown) {
  return typeof input === "object" && !Array.isArray(input);
}

export function applyEnv(
  obj: Record<string, any>,
  opts: EnvOptions,
  parentKey = ""
) {
  for (const key in obj) {
    const subKey = parentKey ? `${parentKey}_${key}` : key;
    const envValue = getEnv(subKey, opts);
    if (_isObject(obj[key])) {
      // Same as before
      if (_isObject(envValue)) {
        obj[key] = { ...(obj[key] as any), ...(envValue as any) };
        applyEnv(obj[key], opts, subKey);
      }
      // If envValue is undefined
      // Then proceed to nested properties
      else if (envValue === undefined) {
        applyEnv(obj[key], opts, subKey);
      }
      // If envValue is a primitive other than undefined
      // Then set objValue and ignore the nested properties
      else {
        obj[key] = envValue ?? obj[key];
      }
    } else {
      obj[key] = envValue ?? obj[key];
    }
    // Experimental env expansion
    if (opts.envExpansion && typeof obj[key] === "string") {
      obj[key] = _expandFromEnv(obj[key]);
    }
  }
  return obj;
}

const envExpandRx = /\{\{([^{}]*)\}\}/g;

function _expandFromEnv(value: string) {
  return value.replace(envExpandRx, (match, key) => {
    return process.env[key] || match;
  });
}
