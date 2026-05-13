---
trigger: always_on
---

# Student Ownership and Authorization Rule

Rules:

- Any student route must only allow the authenticated student to access or modify their own data.
- Never trust studentId from the request body for protected student routes.
- Use the authenticated user/session data to identify the student.
- Routes like /students/me/... should always resolve the student from the authenticated user.
- Prevent students from modifying another student's assessment, roadmap progress, badges, XP, opportunities, or profile.
- Return clear 403 responses when access is denied.
