import { prisma } from "../infrastructure/prisma"

export interface ActivityItem {
    id: string
    type: string
    title: string
    description: string
    createdAt: Date
    metadata: any
}

export interface ActivityFilter {
    limit?: number | undefined
    type?: string | undefined
}

async function getStudentRecentActivity(userId: string, filter: ActivityFilter = {}): Promise<ActivityItem[]> {
    const limit = Math.min(filter.limit || 10, 50)
    const typeFilter = filter.type

    // Fetch from all sources in parallel with the given limit
    const [xpEvents, badges, itemProgress, interactions, practicalHours] = await Promise.all([
        prisma.studentXpEvent.findMany({
            where: { 
                userId, 
                ...(typeFilter ? { sourceType: typeFilter } : {})
            },
            orderBy: { createdAt: "desc" },
            take: limit
        }),
        prisma.studentBadge.findMany({
            where: { userId },
            orderBy: { earnedAt: "desc" },
            take: limit
        }),
        prisma.userRoadmapItemProgress.findMany({
            where: { userId, status: "COMPLETED" },
            include: { 
                roadmapItem: { 
                    include: { 
                        topic: true,
                        career: true
                    } 
                } 
            },
            orderBy: { completedAt: "desc" },
            take: limit
        }),
        prisma.studentOpportunityInteraction.findMany({
            where: { userId, status: { not: "INTERESTED" } },
            include: { opportunity: true },
            orderBy: { updatedAt: "desc" },
            take: limit
        }),
        prisma.practicalHourEvent.findMany({
            where: { userId },
            include: { opportunity: true },
            orderBy: { createdAt: "desc" },
            take: limit
        })
    ])

    const activity: ActivityItem[] = []

    // 1. XP Events
    xpEvents.forEach(e => {
        activity.push({
            id: `XP:${e.id}`,
            type: "XP_EARNED",
            title: formatXpTitle(e.sourceType),
            description: e.reason || `Earned ${e.xpAmount} XP`,
            createdAt: e.createdAt,
            metadata: {
                sourceType: e.sourceType,
                sourceId: e.sourceId,
                xpAmount: e.xpAmount
            }
        })
    })

    // 2. Badges
    badges.forEach(b => {
        // TODO: Load names/descriptions from a shared badge config if available on backend
        activity.push({
            id: `BADGE:${b.id}`,
            type: "BADGE_EARNED",
            title: "Badge earned",
            description: `You earned the ${b.badgeId.replace(/_/g, " ")} badge`,
            createdAt: b.earnedAt,
            metadata: {
                badgeId: b.badgeId
            }
        })
    })

    // 3. Roadmap Items
    itemProgress.forEach(p => {
        const topicName = p.roadmapItem.topic.name
        const careerName = p.roadmapItem.career.name
        activity.push({
            id: `ROADMAP_ITEM:${p.id}`,
            type: "ROADMAP_ITEM_COMPLETED",
            title: "Roadmap item completed",
            description: `Completed ${topicName} in ${careerName} roadmap`,
            createdAt: p.completedAt || p.updatedAt,
            metadata: {
                roadmapItemId: p.roadmapItemId,
                topicName,
                careerName,
                careerSlug: p.roadmapItem.career.slug
            }
        })
    })

    // 4. Opportunity Interactions (Participation/Feedback)
    interactions.forEach(i => {
        let title = "Opportunity update"
        let type = "OPPORTUNITY_UPDATE"
        if (i.feedbackSubmittedAt) {
            title = "Feedback submitted"
            type = "OPPORTUNITY_FEEDBACK_SUBMITTED"
        } else if (i.participated) {
            title = "Participation confirmed"
            type = "PARTICIPATION_CONFIRMED"
        }

        activity.push({
            id: `INTERACTION:${i.id}`,
            type,
            title,
            description: `Update for: ${i.opportunity.title}`,
            createdAt: i.updatedAt,
            metadata: {
                opportunityId: i.opportunityId,
                status: i.status
            }
        })
    })

    // 5. Practical Hours
    practicalHours.forEach(h => {
        activity.push({
            id: `HOURS:${h.id}`,
            type: "PRACTICAL_HOURS_ADDED",
            title: "Practical hours added",
            description: `Awarded ${h.hours} hours from ${h.opportunity?.title || h.sourceType}`,
            createdAt: h.createdAt,
            metadata: {
                hours: h.hours,
                sourceType: h.sourceType,
                opportunityId: h.opportunityId
            }
        })
    })

    // Sort by createdAt descending and apply final limit
    return activity
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        .slice(0, limit)
}

function formatXpTitle(sourceType: string): string {
    switch (sourceType) {
        case "ASSESSMENT_COMPLETED": return "Assessment completed"
        case "ROADMAP_SELECTED": return "Roadmap selected"
        case "ROADMAP_ITEM_COMPLETED": return "Roadmap item completed"
        case "ROADMAP_COMPLETED": return "Roadmap completed"
        case "OPPORTUNITY_FEEDBACK_SUBMITTED": return "Feedback submitted"
        case "PRACTICAL_HOURS_ADDED": return "Practical hours added"
        case "PROFILE_COMPLETED": return "Profile completed"
        case "EMAIL_VERIFIED": return "Email verified"
        default: return "XP earned"
    }
}

export const StudentActivityService = {
    getStudentRecentActivity
}
