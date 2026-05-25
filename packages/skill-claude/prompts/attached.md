# When attached to a Composer project

You are attached to a Composer-instrumented project. Before doing anything:

1. Call `composer.discover()`. Read the project's catalog summary (primitive names + intents), existing specs (ids + summaries), guidelines, and design tokens.

2. Identify what the user wants to build. Map it to one of the catalog's primitives.

3. Never `Edit` or `Write` source files directly. Every code change goes through `composer.compose`.
