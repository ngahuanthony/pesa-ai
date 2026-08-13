---
name: Pesa AI OpenAPI codegen quirks
description: Known issues and fixes for the Pesa AI OpenAPI spec and Orval codegen
---

**Rule 1: No query parameters on operations** — Orval v8 generates `<OperationIdPascal>Params` as both a Zod schema (in generated/api.ts) and a TypeScript interface (in generated/types/). The `lib/api-zod/src/index.ts` re-exports both causing TS2308 collision. Fix: move query params to path params, or remove them.

**Why:** `export type *` does NOT resolve the collision because Zod schema is a value+type export and TypeScript sees the type name collision regardless.

**Rule 2: No `nullable: true` on object types** — Orval generates `zod.looseObject()` which doesn't exist. Fix: remove nullable from object properties in the spec, or use `anyOf` with null.

**Rule 3: Inline compact YAML (`{ type: number }`)** — Orval's parser fails with "Cannot use 'in' operator to search for 'propertyNames' in number }". Fix: always use multi-line YAML for all property definitions.

**Rule 4: `BusinessWithSubscription`** needs `whatsappPhoneNumberId` field for admin panel to show WhatsApp connection status. Always include it.

**Fix for lib/api-zod/src/index.ts:** Changed `export * from "./generated/types"` to `export type * from "./generated/types"` to separate type-only from value+type exports. This partially helps but doesn't fully resolve query-param name collision — move to path params instead.
