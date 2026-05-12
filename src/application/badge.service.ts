import fs from "fs"
import path from "path"
import { prisma } from "../infrastructure/prisma"

// ─── Load Badge Rules ───────────────────────────────────────────────────────

const badgesJsonPath = path.join(__dirname, "../../prisma/data/badges.json")
const badgeRulesData = JSON.parse(fs.readFileSync(badgesJsonPath, "utf-8"))

export interface BadgeRule {
    id: string
    kind: string
    category: string
    rarity: string
    condition: {
        type: string
        operator?: "gte" | "lte" | "eq"
        value?: number
        careerSlug?: string
        skillName?: string
        skillSlug?: string
    }
}

const BADGE_RULES: BadgeRule[] = badgeRulesData.badges

// ─── Interfaces ─────────────────────────────────────────────────────────────

interface StudentState {
    user: any
    profile: any
    assessments: any[]
    selectedCareers: any[]
    completedRoadmapIds: Set<string>
    completedItemIds: string[]
    gamification: any
}

// ─── Evaluation Engine ──────────────────────────────────────────────────────

async function getStudentState(userId: string): Promise<StudentState> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            studentProfile: true,
            assessmentResults: true,
            gamification: true,
            selectedCareers: {
                include: {
                    careerPath: { select: { id: true, slug: true, roadmapItems: { select: { id: true } } } }
                }
            },
            roadmapItemProgress: {
                where: { status: "COMPLETED" },
                include: {
                    roadmapItem: { select: { id: true, topic: { select: { name: true, slug: true } } } }
                }
            }
        }
    })

    if (!user) throw new Error("User not found")

    // Precompute completed roadmaps
    const completedRoadmapIds = new Set<string>()
    for (const sc of user.selectedCareers) {
        const itemIds = sc.careerPath.roadmapItems.map(i => i.id)
        if (itemIds.length > 0) {
            const completedItemsForCareer = user.roadmapItemProgress.filter(p => itemIds.includes(p.roadmapItemId))
            if (completedItemsForCareer.length === itemIds.length) {
                completedRoadmapIds.add(sc.careerPath.slug)
            }
        }
    }

    return {
        user,
        profile: user.studentProfile,
        assessments: user.assessmentResults,
        selectedCareers: user.selectedCareers,
        completedRoadmapIds,
        completedItemIds: user.roadmapItemProgress.map(p => p.roadmapItemId),
        gamification: user.gamification
    }
}

function evaluateCondition(rule: BadgeRule, state: StudentState): { earned: boolean, progress?: { current: number, target: number, percentage: number } } {
    const condition = rule.condition
    let current = 0
    let target = condition.value || 1

    switch (condition.type) {
        case "account_created":
            return { earned: true }

        case "email_verified":
            return { earned: state.user.isEmailVerified }

        case "profile_completed":
            if (!state.profile) return { earned: false }
            const p = state.profile
            // A profile is completed if required fields are filled. We check a few basics.
            // Since mergeEnrichmentData fills hobbies, talents, interests...
            const isComplete = p.hobbies.length > 0 || p.interests.length > 0
            return { earned: isComplete }

        case "assessment_completed":
            return { earned: state.assessments.length > 0 }

        case "selected_roadmaps_count":
            current = state.selectedCareers.length
            return evaluateNumericCondition(current, condition)

        case "completed_roadmaps_count":
            current = state.completedRoadmapIds.size
            return evaluateNumericCondition(current, condition)

        case "career_roadmap_completed":
            if (!condition.careerSlug) return { earned: false }
            return { earned: state.completedRoadmapIds.has(condition.careerSlug) }

        case "roadmap_items_completed_count":
            current = state.completedItemIds.length
            return evaluateNumericCondition(current, condition)

        case "skill_completed":
            if (!condition.skillSlug && !condition.skillName) return { earned: false }
            const hasSkill = state.user.roadmapItemProgress.some((p: any) => 
                (condition.skillSlug && p.roadmapItem.topic.slug === condition.skillSlug) ||
                (condition.skillName && p.roadmapItem.topic.name.toLowerCase() === condition.skillName.toLowerCase())
            )
            return { earned: hasSkill }

        case "verified_hours":
            current = state.gamification?.verifiedPracticalHours || 0
            return evaluateNumericCondition(current, condition)

        case "trait_points":
            // TODO: Implement trait points tracking in the future
            return { earned: false }

        // Fallback for types not strictly defined (like affiliation_code_used)
        default:
            return { earned: false }
    }
}

function evaluateNumericCondition(current: number, condition: any): { earned: boolean, progress: { current: number, target: number, percentage: number } } {
    const target = condition.value || 1
    let earned = false

    if (condition.operator === "gte") earned = current >= target
    else if (condition.operator === "lte") earned = current <= target
    else earned = current === target // default to eq

    let percentage = target > 0 ? Math.round((current / target) * 100) : 0
    if (percentage > 100) percentage = 100

    return { earned, progress: { current, target, percentage } }
}

// ─── Service Methods ────────────────────────────────────────────────────────

async function evaluateStudentBadges(userId: string) {
    const state = await getStudentState(userId)
    
    // Get currently earned badges
    const existingBadges = await prisma.studentBadge.findMany({
        where: { userId },
        select: { badgeId: true }
    })
    const earnedBadgeIds = new Set(existingBadges.map(b => b.badgeId))

    const newlyEarnedIds: string[] = []

    for (const rule of BADGE_RULES) {
        if (earnedBadgeIds.has(rule.id)) continue

        const { earned } = evaluateCondition(rule, state)

        if (earned) {
            newlyEarnedIds.push(rule.id)
        }
    }

    if (newlyEarnedIds.length > 0) {
        await prisma.studentBadge.createMany({
            data: newlyEarnedIds.map(badgeId => ({
                userId,
                badgeId
            })),
            skipDuplicates: true // Just in case
        })
    }

    return { newlyEarned: newlyEarnedIds }
}

async function getStudentBadges(userId: string) {
    const state = await getStudentState(userId)
    
    const existingBadges = await prisma.studentBadge.findMany({
        where: { userId },
        select: { badgeId: true, earnedAt: true }
    })
    
    const earnedMap = new Map(existingBadges.map(b => [b.badgeId, b.earnedAt]))

    const earnedBadges = []
    const lockedBadges = []

    for (const rule of BADGE_RULES) {
        if (earnedMap.has(rule.id)) {
            earnedBadges.push({
                id: rule.id,
                earned: true,
                earnedAt: earnedMap.get(rule.id)
            })
        } else {
            const { progress } = evaluateCondition(rule, state)
            lockedBadges.push({
                id: rule.id,
                earned: false,
                progress // Might be undefined if not measurable
            })
        }
    }

    return { earnedBadges, lockedBadges }
}

async function awardBadge(userId: string, badgeId: string) {
    try {
        await prisma.studentBadge.create({
            data: { userId, badgeId }
        })
        return true
    } catch (e: any) {
        if (e.code === "P2002") return false
        throw e
    }
}

async function hasBadge(userId: string, badgeId: string) {
    const badge = await prisma.studentBadge.findUnique({
        where: { userId_badgeId: { userId, badgeId } }
    })
    return !!badge
}

export const BadgeService = {
    evaluateStudentBadges,
    getStudentBadges,
    awardBadge,
    hasBadge
}
