// Public adapter entry — aggregates the catalog + output map + audit.
import { defineAdapter } from "@composer/adapter-kit";
import { Config, ConfigMeta, PrimitiveNode } from "./catalog/index.js";
import outputMap from "./output.map.js";
import audit from "./audit.js";

export default defineAdapter({
  name: "@composer-test/adapter-keyvalue",
  version: "0.1.0",
  catalog: {
    primitives: { Config: { schema: Config, meta: ConfigMeta } },
    slotRegistry: {},
    index: PrimitiveNode,
  },
  outputMap,
  audit,
  bootstrap: null,
});

export { Config, ConfigMeta, PrimitiveNode };
