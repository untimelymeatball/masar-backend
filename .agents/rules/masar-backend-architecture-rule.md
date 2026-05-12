---
trigger: always_on
---

# Masar Backend Architecture Rule

Context:
This project is Masar, a career-path and opportunity platform for students, providers, academic staff, and admins.

The backend uses:

- Express.js
- Prisma
- PostgreSQL
- Zod
- TypeScript

Rules:

- Keep backend code modular.
- Use this structure when possible:
  - routes/
  - controllers/
  - services/
  - validations/
  - utils/
  - config/
- Controllers should only handle request/response logic.
- Services should contain business logic.
- Validation schemas should be kept separate using Zod.
- Do not place Prisma queries directly inside route files.
- Do not duplicate logic across controllers.
- Reuse existing services where possible.
- Follow the existing naming conventions in the project.
- Do not introduce a new framework or major dependency unless explicitly requested.
