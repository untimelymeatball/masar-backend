---
trigger: always_on
---

## 🛡️ Zod Schema Integrity Rule

Context: This rule applies when modifying backend data models, DTOs, or API contracts using Zod.

Instruction:
Ensure that any changes to backend logic or database schemas are reflected in the corresponding Zod validation schemas to maintain runtime type safety.

Required Action:
Sync Schemas: If you modify a database model or a TypeScript interface, you must immediately update the associated Zod schema.
Inference Check: Ensure all types derived via z.infer<typeof schema> are still valid across the service.
Validation Test: If the task involves an API endpoint, verify that the Zod middleware or validation logic correctly handles both valid and invalid payloads according to the updated schema.
Consistency: Ensure error messages within .safeParse() or .parse() remain helpful and follow the project's existing error-handling pattern."
