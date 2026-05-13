---
trigger: always_on
---

# Backend Error Handling Rule

Rules:

- Use clear error messages.
- Return appropriate status codes:
  - 400 for validation errors
  - 401 for unauthenticated users
  - 403 for unauthorized access
  - 404 for missing resources
  - 409 for duplicate/conflict cases
  - 500 for unexpected server errors
- Do not leak internal stack traces to the client.
- Use centralized error handling if the project already has it.
