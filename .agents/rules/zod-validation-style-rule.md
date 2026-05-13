---
trigger: always_on
---

# Zod Validation Style Rule

Rules:

- Every route with a request body must have a Zod schema.
- Every route with params should validate params with Zod.
- Every route with query parameters should validate query parameters with Zod.
- Keep Zod schemas in validations/ or schemas/ files.
- Do not perform manual validation in controllers when Zod can handle it.
- Zod errors should return clear 400 responses.
- Use enums when values are limited, such as provider type, work mode, opportunity type, verification status, and user role.
