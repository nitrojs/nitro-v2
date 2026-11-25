import defu from "defu";
import {
  type H3Event,
  createError,
  eventHandler,
  getResponseHeader,
  proxyRequest,
  sendRedirect,
  setHeaders,
} from "h3";
import type { NitroRouteConfig, NitroRouteRules } from "nitropack/types";
import { createRouter as createRadixRouter, toRouteMatcher } from "radix3";
import { getQuery, joinURL, withQuery, withoutBase } from "ufo";
import { useRuntimeConfig } from "./config";
import {
  getPathReadings,
  isPathInScope,
  isTargetInScope,
  resolveRedirectTarget,
  withoutBaseIgnoreCase,
} from "./route-rules-utils";

const config = useRuntimeConfig();
const _routeRulesMatcher = toRouteMatcher(
  createRadixRouter({ routes: config.nitro.routeRules })
);

type OptOutRule = "cache" | "isr";

// Opt-out rules keyed by lowercase path, matched against lowercase readings
// (for case-insensitive routers such as vue-router). If keys collide when
// lowercased, `false` wins.
const _caseInsensitiveMatcher = toRouteMatcher(
  createRadixRouter({
    routes: createCaseInsensitiveRoutes(config.nitro.routeRules),
  })
);

function createCaseInsensitiveRoutes(
  routeRules: Record<string, NitroRouteConfig> = {}
) {
  const routes: Record<string, Partial<Record<OptOutRule, unknown>>> = {};
  for (const [key, rules] of Object.entries(routeRules)) {
    const route = (routes[key.toLowerCase()] ||= {});
    for (const rule of ["cache", "isr"] as const) {
      if (rules[rule] !== undefined && route[rule] !== false) {
        route[rule] = rules[rule];
      }
    }
  }
  return routes;
}

export function createRouteRulesHandler(ctx: {
  localFetch: typeof globalThis.fetch;
}) {
  return eventHandler((event) => {
    // Match route options against path
    const routeRules = getRouteRules(event);
    // Apply headers options
    if (routeRules.headers) {
      setHeaders(event, routeRules.headers);
      // Remember the rule's cache-control so error responses do not inherit it
      if (
        Object.keys(routeRules.headers).some(
          (name) => name.toLowerCase() === "cache-control"
        )
      ) {
        event.context._nitro.routeRulesCacheControl = getResponseHeader(
          event,
          "cache-control"
        );
      }
    }
    // Apply redirect options
    if (routeRules.redirect) {
      const target = resolveRedirectTarget(
        event.path,
        routeRules.redirect.to,
        (routeRules.redirect as any)._redirectStripBase
      );
      if (target === undefined) {
        throw createError({ statusCode: 400 });
      }
      return sendRedirect(event, target, routeRules.redirect.statusCode);
    }
    // Apply proxy options
    if (routeRules.proxy) {
      const target = resolveRuleTarget(
        event,
        routeRules.proxy.to,
        (routeRules.proxy as any)._proxyStripBase
      );
      return proxyRequest(event, target, {
        fetch: ctx.localFetch,
        ...routeRules.proxy,
      });
    }
  });
}

function resolveRuleTarget(
  event: H3Event,
  to: string,
  stripBase: string | undefined
): string {
  if (!to.endsWith("/**")) {
    if (event.path.includes("?")) {
      return withQuery(to, getQuery(event.path));
    }
    return to;
  }
  const targetBase = to.slice(0, -3);
  let targetPath = event.path;
  if (stripBase) {
    if (!isPathInScope(event.path.split("?")[0], stripBase)) {
      throw createError({ statusCode: 400 });
    }
    targetPath = withoutBase(targetPath, stripBase);
  } else if (targetPath.startsWith("//")) {
    targetPath = targetPath.replace(/^\/+/, "/");
  }
  const target = joinURL(targetBase, targetPath);
  // Validate the final target, not only the incoming path
  if (!isTargetInScope(target, targetBase)) {
    throw createError({ statusCode: 400 });
  }
  return target;
}

// Request path that route rules are matched against (without base and query).
// Memoized on the first call, which happens in the route rules handler before
// any mounted handler strips the base from `event.path`.
function getRouteRulesPath(event: H3Event): string {
  event.context._nitro = event.context._nitro || {};
  if (event.context._nitro.routeRulesPath === undefined) {
    event.context._nitro.routeRulesPath = withoutBase(
      event.path.split("?")[0],
      useRuntimeConfig().app.baseURL
    );
  }
  return event.context._nitro.routeRulesPath;
}

export function getRouteRules(event: H3Event): NitroRouteRules {
  event.context._nitro = event.context._nitro || {};
  if (!event.context._nitro.routeRules) {
    event.context._nitro.routeRules = getRouteRulesForPath(
      getRouteRulesPath(event)
    );
  }
  return event.context._nitro.routeRules;
}

/**
 * Resolve the `cache` route rule for the current request.
 *
 * Returns `undefined` (do not cache) if caching is not enabled for the request
 * path, or if a nested `cache: false` rule matches another reading of it
 * (see `isRouteRuleDisabled`).
 */
export function getRouteCacheRule(
  event: H3Event
): Exclude<NitroRouteRules["cache"], false> | undefined {
  const cache = getRouteRules(event).cache;
  if (!cache || isRouteRuleDisabled(getRouteRulesPath(event), "cache")) {
    return undefined;
  }
  return cache;
}

/**
 * Check whether a rule set to `false` (`cache: false`, `isr: false`) applies to
 * any reading of `path` (decoded, normalized, case-insensitive).
 *
 * Handlers that serve many paths (catch-all routes, server-side renderers) can
 * render the same page for other spellings of an excluded path
 * (`/account%2Fprofile`, `//account/profile`, `/ACCOUNT/profile`), so a nested
 * opt-out must cover them as well. Paths that cannot be read safely count as
 * opted out.
 *
 * @param path - Request path without base URL and query string.
 */
export function isRouteRuleDisabled(path: string, rule: OptOutRule): boolean {
  for (const reading of getPathReadings(path)) {
    if (
      reading === undefined ||
      getRouteRulesForPath(reading)[rule] === false ||
      _getCaseInsensitiveRules(reading)[rule] === false
    ) {
      return true;
    }
  }
  return false;
}

/**
 * Check whether a rule set to `false` (`cache: false`, `isr: false`) applies to
 * a request path that still includes the base URL.
 *
 * Like `isRouteRuleDisabled`, but the base URL is also removed from readings
 * of `pathname` that only match it case-insensitively or after decoding
 * (`/APP/account` for base `/app/`).
 *
 * @param pathname - Request path with base URL, without query string.
 */
export function isRequestRouteRuleDisabled(
  pathname: string,
  rule: OptOutRule
): boolean {
  const { baseURL } = useRuntimeConfig().app;
  return getPathReadings(pathname).some(
    (reading) =>
      reading === undefined ||
      isRouteRuleDisabled(withoutBaseIgnoreCase(reading, baseURL), rule)
  );
}

function _getCaseInsensitiveRules(
  path: string
): Partial<Record<OptOutRule, unknown>> {
  return defu(
    {},
    ..._caseInsensitiveMatcher.matchAll(path.toLowerCase()).reverse()
  );
}

// prettier-ignore
type DeepReadonly<T> = T extends Record<string, any>
  ? { readonly [K in keyof T]: DeepReadonly<T[K]> }
  : T extends Array<infer U>
    ? ReadonlyArray<DeepReadonly<U>>
    : T;

/**
 * @param path - The path to match against route rules. This should not contain a query string.
 */
export function getRouteRulesForPath(
  path: string
): DeepReadonly<NitroRouteRules> {
  return defu({}, ..._routeRulesMatcher.matchAll(path).reverse());
}
