// @composer/typescript — catalog-authoring engine

export {
  loadCatalog,
  hashCatalogSources,
  _resetCatalogCacheForTests,
  type LoadedCatalog,
} from "./loader.js";
export {
  compileCatalog,
  _resetCompiledCatalogCacheForTests,
  type CompiledCatalog,
} from "./compile.js";

export const TS_ENGINE_VERSION = "0.1.0-alpha.0";
