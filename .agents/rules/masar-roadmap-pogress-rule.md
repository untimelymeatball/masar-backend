---
trigger: always_on
---

# Masar Roadmap Progress Rule

Rules:

- Roadmap progress is based on the roadmap array inside careers.json.
- A student can select 1 to 3 roadmaps.
- Each selected roadmap should track completed roadmap points.
- Progress percentage should be calculated as:
  completedPoints / totalPoints \* 100
- Do not store fake roadmap points that do not exist in careers.json.
- Prevent duplicate roadmap point completions.
- Completing all roadmap points should mark the selected roadmap as completed.
- Roadmap point completion should trigger gamification hooks, but badge logic should stay in the gamification/badge service.
