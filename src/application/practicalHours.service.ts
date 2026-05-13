import { prisma } from "../infrastructure/prisma"
import { GamificationService } from "./gamification.service"
import { XP_RULES } from "../config/gamification"

export interface PracticalHourAwardInput {
    userId: string
    hours: number
    sourceType: string
    sourceId: string
    opportunityId?: string
    feedbackId?: string
    description?: string
}

export function calculateStudentLevel(totalHours: number) {
    const hoursPerLevel = 20
    const level = Math.floor(totalHours / hoursPerLevel) + 1
    const currentLevelStart = (level - 1) * hoursPerLevel
    const nextLevelAt = level * hoursPerLevel
    const hoursToNextLevel = nextLevelAt - totalHours
    const progressPercent = Math.min(100, Math.max(0, ((totalHours - currentLevelStart) / hoursPerLevel) * 100))

    return {
        level,
        currentLevelStart,
        nextLevelAt,
        hoursToNextLevel,
        progressPercent: parseFloat(progressPercent.toFixed(1))
    }
}

async function awardPracticalHours(input: PracticalHourAwardInput) {
    const { userId, hours, sourceType, sourceId, opportunityId, feedbackId, description } = input

    if (!hours || hours <= 0) {
        return { awarded: false, reason: "Invalid hours amount" }
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            // 1. Check for existing event (Idempotency)
            const existing = await tx.practicalHourEvent.findUnique({
                where: {
                    userId_sourceType_sourceId: { userId, sourceType, sourceId }
                }
            })

            if (existing) {
                return { awarded: false, reason: "Hours already awarded for this source", event: existing }
            }

            // 2. Create the event
            const event = await tx.practicalHourEvent.create({
                data: {
                    userId,
                    hours,
                    sourceType,
                    sourceId,
                    opportunityId: opportunityId ?? null,
                    feedbackId: feedbackId ?? null,
                    description: description ?? null
                }
            })

            // 3. Update total hours in StudentGamification
            const gamification = await tx.studentGamification.upsert({
                where: { userId },
                update: { verifiedPracticalHours: { increment: hours } },
                create: { userId, verifiedPracticalHours: hours }
            })

            return { awarded: true, totalHours: gamification.verifiedPracticalHours, event }
        })

        if (result.awarded && result.event) {
            await GamificationService.awardXp(
                userId,
                "PRACTICAL_HOURS_ADDED",
                result.event.id,
                hours * (XP_RULES.VERIFIED_PRACTICAL_HOUR || 10),
                `Awarded ${hours} practical hours`
            )
        }

        return result
    } catch (error: any) {
        console.error("Award practical hours error:", error)
        throw error
    }
}

async function getPracticalHoursHistory(userId: string) {
    const gamification = await prisma.studentGamification.findUnique({
        where: { userId },
        select: { verifiedPracticalHours: true }
    })

    const events = await prisma.practicalHourEvent.findMany({
        where: { userId },
        include: {
            opportunity: { select: { id: true, title: true, provider: { select: { organizationName: true } } } }
        },
        orderBy: { createdAt: "desc" }
    })

    return {
        totalHours: gamification?.verifiedPracticalHours || 0,
        events: events.map(e => ({
            ...e,
            opportunity: e.opportunity ? {
                id: e.opportunity.id,
                title: e.opportunity.title,
                provider: e.opportunity.provider.organizationName
            } : null
        }))
    }
}

async function getPracticalHoursSummary(userId: string) {
    const gamification = await prisma.studentGamification.findUnique({
        where: { userId },
        select: { verifiedPracticalHours: true }
    })

    const totalHours = gamification?.verifiedPracticalHours || 0
    const levelStats = calculateStudentLevel(totalHours)

    return {
        totalHours,
        ...levelStats
    }
}

export const PracticalHoursService = {
    awardPracticalHours,
    getPracticalHoursHistory,
    getPracticalHoursSummary,
    calculateStudentLevel
}
