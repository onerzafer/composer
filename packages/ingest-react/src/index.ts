// @composer/ingest-react — IngesterPlugin scaffold.
//
// The real implementation (T008) walks a React component's prop types via the
// TS-compiler backend, derives a Zod schema from the resolved prop interface,
// and emits a draft `.tsx.hbs` template that round-trips through the engine.
// Lives in a separate package so it can be added to a project as
// `@composer/ingest-react` without expanding the engine.

import type { IngesterContext, IngesterPlugin } from "@composer/ingest-kit";

export const reactIngester: IngesterPlugin = {
  name: "react",
  async ingest(_sourcePath: string, _ctx: IngesterContext) {
    throw new Error(
      "@composer/ingest-react: not yet implemented (003 T008). " +
        "Scaffold present; real codec lands with the React-prop-types extractor.",
    );
  },
};

export default reactIngester;
