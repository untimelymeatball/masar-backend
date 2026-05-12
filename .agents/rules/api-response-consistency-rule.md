---
trigger: always_on
---

# API Response Consistency Rule

Rules:

- Use consistent API response shapes.
- Successful responses should follow:
  {
  "success": true,
  "message": "...",
  "data": ...
  }

- Error responses should follow:
  {
  "success": false,
  "message": "...",
  "errors": ...
  }

- Do not return raw Prisma errors to the client.
- Do not expose sensitive fields such as password hashes, reset tokens, verification tokens, or internal admin-only fields.
