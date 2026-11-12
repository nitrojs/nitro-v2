import { afterEach, describe, expect, it } from "vitest";
import { applyEnv } from "../../src/runtime/internal/utils.env";

describe("env utils", () => {
  describe("applyEnv", () => {
    const tests = [
      {
        config: { a: 1, b: 2 },
        env: { NITRO_A: "123" },
        expected: { a: 123, b: 2 },
      },
      {
        config: { feature: { options: { optionA: true, optionB: true } } },
        env: { NITRO_FEATURE: false },
        expected: { feature: false },
      },
      {
        config: { feature: { options: { optionA: true, optionB: true } } },
        env: { NITRO_FEATURE_OPTIONS: false },
        expected: { feature: { options: false } },
      },
    ];
    for (const test of tests) {
      it(`Config: ${JSON.stringify(test.config)} Env: { ${Object.entries(
        test.env
      )
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(" ")} }`, () => {
        for (const key in test.env) {
          process.env[key] = test.env[key as keyof typeof test.env] as string;
        }
        expect(applyEnv(test.config, { prefix: "NITRO_" })).toEqual(
          test.expected
        );
        for (const key in test.env) {
          delete process.env[key];
        }
      });
    }
  });

  // Env names of config keys are cached, env values must not be
  describe("env changes between calls", () => {
    const envKeys = [
      "NITRO_API_BASE_URL",
      "APP_API_BASE_URL",
      "NITRO_PUBLIC_NESTED",
      "NITRO_PUBLIC_NESTED_DEEP_KEY",
    ];
    const opts = { prefix: "NITRO_", altPrefix: "APP_" };
    const config = () => ({
      apiBaseUrl: "default",
      public: { nested: { deepKey: "default" } },
    });

    afterEach(() => {
      for (const key of envKeys) {
        delete process.env[key];
      }
    });

    it("reads the current env value on every call", () => {
      process.env.NITRO_API_BASE_URL = "first";
      expect(applyEnv(config(), opts).apiBaseUrl).toBe("first");
      process.env.NITRO_API_BASE_URL = "second";
      expect(applyEnv(config(), opts).apiBaseUrl).toBe("second");
      delete process.env.NITRO_API_BASE_URL;
      process.env.APP_API_BASE_URL = "alt";
      expect(applyEnv(config(), opts).apiBaseUrl).toBe("alt");
      delete process.env.APP_API_BASE_URL;
      expect(applyEnv(config(), opts)).toEqual(config());
    });

    it("does not keep nested or object overrides after env is removed", () => {
      process.env.NITRO_PUBLIC_NESTED_DEEP_KEY = "deep";
      expect(applyEnv(config(), opts).public.nested.deepKey).toBe("deep");
      delete process.env.NITRO_PUBLIC_NESTED_DEEP_KEY;
      process.env.NITRO_PUBLIC_NESTED = JSON.stringify({ deepKey: "obj" });
      expect(applyEnv(config(), opts).public.nested.deepKey).toBe("obj");
      delete process.env.NITRO_PUBLIC_NESTED;
      expect(applyEnv(config(), opts)).toEqual(config());
    });
  });

  describe("envExpansion", () => {
    const tests = [
      // envExpansion is false by default
      {
        config: { mail: "{{MAIL_HOST}}:3366" },
        envOptions: {},
        env: { MAIL_HOST: "http://localhost" },
        expected: { mail: "{{MAIL_HOST}}:3366" },
      },
      // Fallback to the original string
      {
        config: { mail: "{{MAIL_HOST}}:3366" },
        envOptions: { envExpansion: true },
        env: {},
        expected: { mail: "{{MAIL_HOST}}:3366" },
      },
      // Base usage
      {
        config: { mail: "{{MAIL_HOST}}" },
        envOptions: { envExpansion: true },
        env: { MAIL_HOST: "http://localhost" },
        expected: { mail: "http://localhost" },
      },
      // With multiple envs
      {
        config: { mail: "{{MAIL_SCHEME}}://{{MAIL_HOST}}:{{MAIL_PORT}}" },
        envOptions: { envExpansion: true },
        env: { MAIL_SCHEME: "http", MAIL_HOST: "localhost", MAIL_PORT: "3366" },
        expected: { mail: "http://localhost:3366" },
      },
    ];
    for (const test of tests) {
      it(`Config: ${JSON.stringify(test.config)} ${JSON.stringify(
        test.envOptions
      )} Env: { ${Object.entries(test.env)
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join(" ")} }`, () => {
        for (const key in test.env) {
          process.env[key] = test.env[key as keyof typeof test.env];
        }
        expect(applyEnv(test.config, test.envOptions)).toEqual(test.expected);
        for (const key in test.env) {
          delete process.env[key];
        }
      });
    }
  });
});
