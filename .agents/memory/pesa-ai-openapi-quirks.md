---
name: Pesa AI OpenAPI codegen quirks
description: Known issues and fixes for the Pesa AI OpenAPI spec and Orval codegen
---

**Rule 1: Keep every live frontend-used route in OpenAPI** — Client regeneration deletes hooks for endpoints omitted from the specification, even if a previously generated client still contained hand-maintained code.

**Why:** A Voice-to-Stock regeneration removed an existing admin password-reset hook because its server route was not documented in OpenAPI.

**How to apply:** Before regenerating, compare frontend hook imports and server routes with the specification. Add missing operations to OpenAPI instead of restoring generated code by hand.

**Rule 2: Query parameters need an explicit Zod type re-export** — Orval v8 generates `<OperationIdPascal>Params` as both a Zod schema and a TypeScript interface. Explicitly type-export the params interface in `lib/api-zod/src/index.ts` to disambiguate the star exports.

**Why:** Type-only star exports alone did not resolve the generated schema/interface collision, while the explicit named type re-export does and preserves optional query parameters.

**Rule 3: No `nullable: true` on object types** — Orval generates `zod.looseObject()` which doesn't exist. Fix: remove nullable from object properties in the spec, or use `anyOf` with null.

**Rule 4: Inline compact YAML (`{ type: number }`)** — Orval's parser fails with "Cannot use 'in' operator to search for 'propertyNames' in number }". Fix: always use multi-line YAML for all property definitions.

**Rule 5: `BusinessWithSubscription`** needs `whatsappPhoneNumberId` field for admin panel to show WhatsApp connection status. Always include it.

**Fix for lib/api-zod/src/index.ts:** Keep the generated API exports, explicitly type-export each colliding query-parameter interface, then retain the generated type exports.
