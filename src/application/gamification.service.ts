import { prisma } from "../infrastructure/prisma"
import { XP_RULES } from "../config/gamification"
import { BadgeService } from "./badge.service"

// ─── Level Calculation ──────────────────────────────────────────────────────

/**
 * Calculates the current level, current level XP, and next level XP based on total XP.
 * Formula: level = floor(totalXp / 100) + 1
 */
export function calculateLevel(totalXp: number) {
    const xpPerLevel = 100
    const level = Math.floor(totalXp / xpPerLevel) + 1
    const currentLevelXp = totalXp % xpPerLevel
    const nextLevelXp = xpPerLevel

    return {
        level,
        currentLevelXp,
        nextLevelXp,
        xpToNextLevel: nextLevelXp - currentLevelXp,
        progressPercent: parseFloat(((currentLevelXp / nextLevelXp) * 100).toFixed(1))
    }
}

/**
 * Checks if a student profile is complete enough to award XP.
 */
export async function checkProfileCompleteness(userId: string) {
    const profile = await prisma.studentProfile.findUnique({
        where: { userId },
        include: { skills: true, user: true }
    })

    if (!profile) return false

    // Criteria: required registration fields exist plus some optional ones
    const hasRequired = !!(profile.firstName && profile.lastName && profile.phone && profile.province && profile.birthdate && profile.major && profile.educationLevel && profile.graduationYear)
    const hasOptional = !!(profile.bio || (profile.skills && profile.skills.length > 0) || (profile.hobbies && profile.hobbies.length > 0) || (profile.interests && profile.interests.length > 0))

    if (hasRequired && hasOptional) {
        await awardXp(userId, "PROFILE_COMPLETED", userId, XP_RULES.PROFILE_COMPLETED, "Profile completeness criteria reached")
        return true
    }
    return false
}

// ─── Gamification Core Methods ──────────────────────────────────────────────

/**
 * Ensures a student has a gamification record, returning it.
 */
export async function getOrCreateStudentGamification(userId: string) {
    let gamification = await prisma.studentGamification.findUnique({
        where: { userId }
    })

    if (!gamification) {
        gamification = await prisma.studentGamification.create({
            data: { userId }
        })
    }

    return gamification
}

/**
 * Awards XP to a student for a specific action, ensuring no duplicates.
 */
export async function awardXp(
    userId: string,
    sourceType: string,
    sourceId: string,
    xpAmount: number,
    reason: string
) {
    // Attempt to create the XP event
    try {
        await prisma.studentXpEvent.create({
            data: {
                userId,
                sourceType,
                sourceId,
                xpAmount,
                reason
            }
        })
    } catch (error: any) {
        // If it's a unique constraint violation (P2002), the event already exists.
        // We safely ignore it to prevent duplicate XP.
        if (error.code === "P2002") {
            return null
        }
        throw error
    }

    // Recalculate gamification stats after successful event insertion
    const updatedGamification = await recalculateStudentGamification(userId)

    await BadgeService.evaluateStudentBadges(userId)

    return updatedGamification
}

/**
 * Recalculates the student's total XP and level from the event log.
 */
export async function recalculateStudentGamification(userId: string) {
    const events = await prisma.studentXpEvent.findMany({
        where: { userId },
        select: { xpAmount: true }
    })

    const totalXp = events.reduce((sum, event) => sum + event.xpAmount, 0)
    const { level, currentLevelXp, nextLevelXp } = calculateLevel(totalXp)

    const gamification = await prisma.studentGamification.upsert({
        where: { userId },
        create: {
            userId,
            totalXp,
            level,
            currentLevelXp,
            nextLevelXp
        },
        update: {
            totalXp,
            level,
            currentLevelXp,
            nextLevelXp
        }
    })

    return gamification
}

/**
 * Retrieves the full gamification profile, including recent events.
 */
export async function getStudentGamification(userId: string) {
    const gamification = await getOrCreateStudentGamification(userId)

    const recentXpEvents = await prisma.studentXpEvent.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        take: 10,
        select: {
            id: true,
            sourceType: true,
            xpAmount: true,
            reason: true,
            createdAt: true
        }
    })

    return {
        totalXp: gamification.totalXp,
        level: gamification.level,
        currentLevelXp: gamification.currentLevelXp,
        nextLevelXp: gamification.nextLevelXp,
        verifiedPracticalHours: gamification.verifiedPracticalHours,
        recentXpEvents
    }
}

// ─── Legacy/Integration Hooks ───────────────────────────────────────────────

async function handleRoadmapPointCompleted(
    userId: string,
    careerSlug: string,
    pointKey: string
): Promise<void> {
    // This is called by slugRoadmap.service.ts
    // For proper source ID, we should really be using the UserRoadmapItemProgress ID.
    // The explicit instruction handles this inside roadmapProgress.service.ts, 
    // but we leave this hook for badges/trophies.
    // TODO: Evaluate badge conditions from badges.json:
    //   - skill_completed (e.g. "skill_html_completed")
    //   - any_active_roadmap_progress_percentage (25%, 50%, 75%, 100%)
    //   - completed_roadmaps_count (if all points in roadmap are done)
}

async function handleRoadmapCompleted(
    userId: string,
    careerSlug: string
): Promise<void> {
    // TODO: Evaluate badge conditions from badges.json:
    //   - career_roadmap_completed (e.g. "career_frontend_completed")
    //   - roadmap_finisher, double_path_achiever, triple_path_achiever, etc.
}

async function handleRoadmapPointUncompleted(
    userId: string,
    careerSlug: string,
    pointKey: string
): Promise<void> {
    // TODO: Re-evaluate progress-percentage badges if needed.
}

export const GamificationService = {
    calculateLevel,
    getOrCreateStudentGamification,
    awardXp,
    recalculateStudentGamification,
    getStudentGamification,
    handleRoadmapPointCompleted,
    handleRoadmapCompleted,
    handleRoadmapPointUncompleted,
    checkProfileCompleteness
}
