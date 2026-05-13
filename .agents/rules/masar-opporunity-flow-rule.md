---
trigger: always_on
---

# Masar Opportunity Flow Rule

Context:
Students can view opportunities, mark interest, confirm participation, submit feedback, and earn practical hours.

Rules:

- Interested opportunities should be stored in the database.
- A student should not be able to duplicate the same interested opportunity.
- Students can only submit feedback if they participated in the opportunity.
- Practical hours should only be added after participation is confirmed and feedback rules are satisfied.
- Practical hours should come from the provider's estimated completion hours.
- Feedback should be anonymous when shown to providers.
- Opportunity interactions should trigger gamification hooks where appropriate.
