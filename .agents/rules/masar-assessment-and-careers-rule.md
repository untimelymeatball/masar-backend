---
trigger: always_on
---

# Masar Assessment and Careers Rule

Context:
Masar uses assessment questions and careers data from JSON files.

Rules:

- Do not hardcode career names, career slugs, roadmap points, traits, or assessment tags manually.
- Load career data from careers.json.
- Load assessment questions from the assessment JSON file.
- Validate career slugs against careers.json.
- Career recommendations should use the weighted trait/tag scoring logic already defined in the project.
- Assessment results should recommend up to 5 careers.
- Student roadmap selection should allow minimum 1 and maximum 3 career paths.
