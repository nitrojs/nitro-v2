import { expectTypeOf } from "expect-type";
import type { $Fetch } from "nitropack/types";

// 400 typed routes: enough for generic `$fetch` calls to fail with
// `TS2589: Type instantiation is excessively deep and possibly infinite` when
// `TypedInternalResponse` / `AvailableRouterMethod` distribute over every route.
type Digit = "0" | "1" | "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9";
type N = `${Digit}${Digit}`;
type StressRoutes = {
  [K in `/api/param/${N}/:id`]: { get: { route: K } };
} & {
  [K in `/api/methods/${N}`]: { default: { route: K }; post: { posted: K } };
} & {
  [K in `/api/glob/${N}/**`]: { default: { route: K } };
} & {
  [K in `/api/get/${N}`]: { get: { route: K } };
};

declare module "nitropack/types" {
  interface InternalApi extends StressRoutes {}
}

declare const $fetch: $Fetch;

interface TestResponse {
  message: string;
}

async function getGeneric<T>(url: string) {
  return await $fetch<T>(url);
}
async function getCast<T>(url: string): Promise<T> {
  return (await $fetch(url)) as T;
}

// Only type-checked, never run
export function typeTests() {
  expectTypeOf(getGeneric<TestResponse>("/test")).toEqualTypeOf<
    Promise<TestResponse>
  >();
  expectTypeOf(getCast<TestResponse>("/test")).toEqualTypeOf<
    Promise<TestResponse>
  >();

  // The routes above are registered and still resolve
  expectTypeOf($fetch("/api/methods/42")).toEqualTypeOf<
    Promise<{ route: "/api/methods/42" }>
  >();
  expectTypeOf($fetch("/api/methods/42", { method: "POST" })).toEqualTypeOf<
    Promise<{ posted: "/api/methods/42" }>
  >();
  expectTypeOf($fetch("/api/param/42/abc")).toEqualTypeOf<
    Promise<{ route: "/api/param/42/:id" }>
  >();
}
