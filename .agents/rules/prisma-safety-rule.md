---
trigger: always_on
---

# Prisma Safety Rule

Rules:

- Always check existing Prisma models before creating new ones.
- Do not create duplicate models for the same concept.
- Use relations properly instead of storing unrelated raw IDs when a relation is appropriate.
- Use unique constraints where duplicate records should be prevented.
- Add createdAt and updatedAt fields to new persistent models unless there is a clear reason not to.
- After editing schema.prisma, remind me to run:
  npx prisma migrate dev
  npx prisma generate
- Do not assume the database schema. Inspect the existing Prisma schema first.
