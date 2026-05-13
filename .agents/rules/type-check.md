---
trigger: always_on
---

"## 🛡️ Type-Check Enforcement Rule

Context: This rule applies only to projects using TypeScript (presence of tsconfig.json).

Instruction:
After completing every task and before reporting success, you must run a full type-check to ensure no regressions were introduced.

Required Action:
Check for the existence of a tsconfig.json. If present, proceed to step 2.
Execute npx tsc --noEmit in the terminal.
If errors are found, you must fix them—even if they occur in files you didn't manually edit—until the command returns 0 errors.
Do not consider the task complete until the type-check passes."
