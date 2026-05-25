import type { Adapter } from "./types.js";

/**
 * Identity-type-helper for declaring an adapter. Returns input unchanged at runtime;
 * exists so adapter authors get strict structural type-checking against `Adapter`.
 *
 * @example
 *   export default defineAdapter({
 *     name: "@acme/composer-adapter-rails",
 *     version: "0.1.0",
 *     catalog: { ... },
 *     outputMap: { ... },
 *   });
 */
export function defineAdapter<T extends Adapter>(adapter: T): T {
  return adapter;
}
