---
trigger: always_on
---

# Masar Gamification Rule

Context:
Masar has XP, levels, badges, practical hours, and roadmap progress.

Rules:

- XP and levels are backend/database-driven.
- Badges are awarded by the backend, not the frontend.
- The frontend only displays badge metadata and earned status.
- XP must be stored as events to prevent duplicate rewards.
- Use sourceType + sourceId + studentId uniqueness to prevent duplicate XP.
- After XP is awarded, recalculate the student's level.
- After relevant actions, call a gamification service instead of placing XP logic directly in controllers.
- Badge evaluation should be centralized in BadgeService.
- Do not hardcode badge display text in the backend.
