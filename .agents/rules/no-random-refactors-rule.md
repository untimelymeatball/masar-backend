---
trigger: always_on
---

# No Unrequested Refactors Rule

Rules:

- Do not rewrite unrelated files.
- Do not rename existing models, routes, services, or variables unless required.
- Do not change working authentication logic unless the task specifically requires it.
- Keep changes focused on the requested feature.
- Before making large structural changes, explain the reason.
- Preserve existing behavior unless the requested task requires a change.
