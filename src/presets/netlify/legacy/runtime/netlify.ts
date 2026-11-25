import "#nitro-internal-pollyfills";
import type { Handler } from "@netlify/functions";
import { useRuntimeConfig } from "nitropack/runtime";
import {
  getRouteRulesForPath,
  isRequestRouteRuleDisabled,
} from "nitropack/runtime/internal";
import { withoutBase } from "ufo";
import { lambda } from "./netlify-lambda";

export const handler: Handler = async function handler(event, context) {
  // Route rules are matched against the path only (without base URL or
  // query), as in `getRouteRules`
  const path = withoutBase(event.path, useRuntimeConfig().app.baseURL);
  const routeRules = getRouteRulesForPath(path);

  // A nested `isr: false` rule also covers other spellings of the path
  if (routeRules.isr && !isRequestRouteRuleDisabled(event.path, "isr")) {
    const builder = await import("@netlify/functions").then(
      (r) => r.builder || (r as any).default.builder
    );
    const ttl = typeof routeRules.isr === "number" ? routeRules.isr : false;
    const builderHandler = ttl
      ? (((event, context) =>
          lambda(event, context).then((r) => ({ ...r, ttl }))) as Handler)
      : lambda;
    return builder(builderHandler)(event, context) as any;
  }

  return lambda(event, context);
};
