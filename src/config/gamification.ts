// src/config/gamification.ts

// Centralized XP rules configuration to prevent magic numbers across services
export const XP_RULES = {
    EMAIL_VERIFIED: 10,
    PROFILE_COMPLETED: 20,
    ASSESSMENT_COMPLETED: 50,
    ROADMAP_SELECTED: 10,
    ROADMAP_ITEM_COMPLETED: 25,
    ROADMAP_COMPLETED: 150,
    OPPORTUNITY_FEEDBACK_SUBMITTED: 20,
    VERIFIED_PRACTICAL_HOUR: 10
}
