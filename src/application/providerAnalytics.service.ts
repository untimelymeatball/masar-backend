import { prisma } from "../infrastructure/prisma"

// ─── Helpers ───────────────────────────────────────────────────────────────

async function getProviderProfile(userId: string) {
    const provider = await prisma.providerProfile.findUnique({
        where: { userId }
    })
    if (!provider) {
        const error = new Error("Provider profile not found") as any
        error.statusCode = 403
        throw error
    }
    return provider
}

async function assertProviderOwnsOpportunity(userId: string, opportunityId: string) {
    const provider = await getProviderProfile(userId)
    const opportunity = await prisma.opportunity.findUnique({
        where: { id: opportunityId }
    })

    if (!opportunity) {
        const error = new Error("Opportunity not found") as any
        error.statusCode = 404
        throw error
    }

    if (opportunity.providerId !== provider.id) {
        const error = new Error("Access denied: You do not own this opportunity") as any
        error.statusCode = 403
        throw error
    }

    return { provider, opportunity }
}

// ─── Service Methods ────────────────────────────────────────────────────────

async function getOpportunityAnalytics(userId: string, opportunityId: string) {
    const { opportunity } = await assertProviderOwnsOpportunity(userId, opportunityId)

    // 1. Get counts from interactions
    const interactionStats = await prisma.studentOpportunityInteraction.groupBy({
        by: ['status'],
        where: { opportunityId },
        _count: true
    })

    const statsMap = interactionStats.reduce((acc, curr) => {
        acc[curr.status] = curr._count
        return acc
    }, {} as Record<string, number>)

    const interestedCount = statsMap['INTERESTED'] || 0
    const participatedCount = statsMap['PARTICIPATED'] || 0
    const feedbackCount = statsMap['FEEDBACK_SUBMITTED'] || 0

    // 2. Aggregate feedback ratings
    const feedbackAggr = await prisma.opportunityFeedback.aggregate({
        where: { opportunityId },
        _avg: {
            ratingOverall: true,
            ratingContent: true,
            ratingOrganization: true,
            ratingCommunication: true
        },
        _count: true
    })

    // 3. Get recent anonymous feedback
    const recentFeedback = await prisma.opportunityFeedback.findMany({
        where: { opportunityId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
            ratingOverall: true,
            ratingContent: true,
            ratingOrganization: true,
            ratingCommunication: true,
            comment: true,
            createdAt: true
        }
    })

    // 4. Calculate hours (expected hours * number of feedback submitted interactions)
    const totalVerifiedHoursGenerated = (opportunity.expectedHours || 0) * feedbackCount

    return {
        opportunityId: opportunity.id,
        title: opportunity.title,
        interestedCount,
        participatedCount,
        feedbackCount,
        averageRating: feedbackAggr._avg.ratingOverall ? parseFloat(feedbackAggr._avg.ratingOverall.toFixed(1)) : 0,
        averageLearningValueRating: feedbackAggr._avg.ratingContent ? parseFloat(feedbackAggr._avg.ratingContent.toFixed(1)) : 0,
        averageOrganizationRating: feedbackAggr._avg.ratingOrganization ? parseFloat(feedbackAggr._avg.ratingOrganization.toFixed(1)) : 0,
        averageRelevanceRating: feedbackAggr._avg.ratingCommunication ? parseFloat(feedbackAggr._avg.ratingCommunication.toFixed(1)) : 0,
        estimatedHours: opportunity.expectedHours,
        totalVerifiedHoursGenerated,
        recentAnonymousFeedback: recentFeedback
    }
}

async function getProviderAnalyticsSummary(userId: string) {
    const provider = await getProviderProfile(userId)

    const opportunities = await prisma.opportunity.findMany({
        where: { providerId: provider.id },
        include: {
            _count: {
                select: {
                    studentInteractions: true, // total interested
                    opportunityFeedback: true   // total feedback
                }
            }
        }
    })

    const opportunityIds = opportunities.map(o => o.id)

    // Aggregate overall participation
    const totalParticipatedAggr = await prisma.studentOpportunityInteraction.count({
        where: {
            opportunityId: { in: opportunityIds },
            status: { in: ["PARTICIPATED", "FEEDBACK_SUBMITTED"] }
        }
    })

    // Aggregate overall ratings
    const overallFeedbackAggr = await prisma.opportunityFeedback.aggregate({
        where: { opportunityId: { in: opportunityIds } },
        _avg: { ratingOverall: true },
        _count: true
    })

    // Aggregate total verified hours
    // We sum (opportunity.expectedHours * count of feedback per opportunity)
    let totalVerifiedHoursGenerated = 0
    const feedbackCounts = await prisma.opportunityFeedback.groupBy({
        by: ['opportunityId'],
        where: { opportunityId: { in: opportunityIds } },
        _count: true
    })

    const feedbackCountMap = feedbackCounts.reduce((acc, curr) => {
        acc[curr.opportunityId] = curr._count
        return acc
    }, {} as Record<string, number>)

    for (const opp of opportunities) {
        const count = feedbackCountMap[opp.id] || 0
        totalVerifiedHoursGenerated += (opp.expectedHours || 0) * count
    }

    // Top opportunities by interest
    const topByInterest = [...opportunities]
        .sort((a, b) => b._count.studentInteractions - a._count.studentInteractions)
        .slice(0, 3)
        .map(o => ({ id: o.id, title: o.title, count: o._count.studentInteractions }))

    // Recent global anonymous feedback
    const recentGlobalFeedback = await prisma.opportunityFeedback.findMany({
        where: { opportunityId: { in: opportunityIds } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
            ratingOverall: true,
            comment: true,
            createdAt: true,
            opportunity: { select: { title: true } }
        }
    })

    return {
        totalOpportunities: opportunities.length,
        totalInterested: opportunities.reduce((acc, curr) => acc + curr._count.studentInteractions, 0),
        totalParticipated: totalParticipatedAggr,
        totalFeedback: overallFeedbackAggr._count,
        averageRating: overallFeedbackAggr._avg.ratingOverall ? parseFloat(overallFeedbackAggr._avg.ratingOverall.toFixed(1)) : 0,
        totalVerifiedHoursGenerated,
        topOpportunitiesByInterest: topByInterest,
        recentAnonymousFeedback: recentGlobalFeedback.map(f => ({
            ...f,
            ratingOverall: f.ratingOverall,
            opportunityTitle: f.opportunity.title,
            opportunity: undefined
        }))
    }
}

export const ProviderAnalyticsService = {
    getOpportunityAnalytics,
    getProviderAnalyticsSummary
}
