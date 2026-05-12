import { prisma } from "../infrastructure/prisma"
import { GamificationService } from "./gamification.service"
import { BadgeService } from "./badge.service"
import { PracticalHoursService } from "./practicalHours.service"
import { XP_RULES } from "../config/gamification"
import { Prisma } from "../generated/prisma/client"

export async function getApprovedOpportunities(userId: string, filters: any) {
    const { search, tag, mode, location, providerId, page = 1, limit = 10 } = filters
    const skip = (page - 1) * limit

    const where: Prisma.OpportunityWhereInput = {
        isApproved: true,
        isPublished: true
    }

    if (search) {
        where.OR = [
            { title: { contains: search, mode: "insensitive" } },
            { description: { contains: search, mode: "insensitive" } }
        ]
    }
    if (tag) {
        where.tags = { some: { name: { contains: tag, mode: "insensitive" } } }
    }
    if (mode) {
        where.workMode = mode
    }
    if (location) {
        where.location = { contains: location, mode: "insensitive" }
    }
    if (providerId) {
        where.providerId = providerId
    }

    const [opportunities, total] = await Promise.all([
        prisma.opportunity.findMany({
            where,
            include: {
                provider: { select: { id: true, organizationName: true, profilePicture: true } },
                tags: true,
                studentInteractions: { where: { userId } }
            },
            skip,
            take: limit,
            orderBy: { createdAt: "desc" }
        }),
        prisma.opportunity.count({ where })
    ])

    return {
        opportunities: opportunities.map(opp => ({
            ...opp,
            isInterested: opp.studentInteractions.length > 0,
            studentInteractions: undefined
        })),
        total,
        page,
        limit
    }
}

export async function getOpportunityDetail(userId: string, opportunityId: string) {
    const opportunity = await prisma.opportunity.findFirst({
        where: { id: opportunityId, isApproved: true, isPublished: true },
        include: {
            provider: { select: { id: true, organizationName: true, description: true, profilePicture: true } },
            tags: true,
            studentInteractions: { where: { userId } }
        }
    })

    if (!opportunity) throw new Error("Opportunity not found or not published")

    const interaction = opportunity.studentInteractions[0]

    return {
        ...opportunity,
        studentInteractions: undefined,
        interactionState: {
            isInterested: !!interaction,
            participationConfirmed: interaction?.status === "PARTICIPATED" || interaction?.status === "NOT_PARTICIPATED" || interaction?.status === "FEEDBACK_SUBMITTED",
            participated: interaction?.participated || false,
            feedbackSubmitted: !!interaction?.feedbackSubmittedAt,
            hoursAwarded: interaction?.status === "FEEDBACK_SUBMITTED"
        }
    }
}

export async function markInterested(userId: string, opportunityId: string) {
    const opportunity = await prisma.opportunity.findFirst({
        where: { id: opportunityId, isApproved: true, isPublished: true }
    })
    if (!opportunity) throw new Error("Opportunity not found")

    const existing = await prisma.studentOpportunityInteraction.findUnique({
        where: { userId_opportunityId: { userId, opportunityId } }
    })

    if (existing) return existing // Idempotency

    return await prisma.studentOpportunityInteraction.create({
        data: { userId, opportunityId, status: "INTERESTED" }
    })
}

export async function getInterestedOpportunities(userId: string) {
    const interactions = await prisma.studentOpportunityInteraction.findMany({
        where: { userId },
        include: {
            opportunity: {
                include: { provider: { select: { id: true, organizationName: true } } }
            }
        },
        orderBy: { interestedAt: "desc" }
    })

    return interactions.map(i => ({
        ...i,
        pendingAction: i.status === "INTERESTED" ? "CONFIRM_PARTICIPATION" : (i.participated && !i.feedbackSubmittedAt ? "SUBMIT_FEEDBACK" : "NONE")
    }))
}

export async function confirmParticipation(userId: string, opportunityId: string, participated: boolean) {
    const interaction = await prisma.studentOpportunityInteraction.findUnique({
        where: { userId_opportunityId: { userId, opportunityId } },
        include: { opportunity: true }
    })

    if (!interaction) throw new Error("Must mark as interested first")
    if (interaction.status === "FEEDBACK_SUBMITTED") throw new Error("Feedback already submitted")

    // Check if opportunity has passed
    const now = new Date()
    const endDate = interaction.opportunity.endDate || interaction.opportunity.deadline
    if (endDate && now < endDate) {
        throw new Error("Opportunity has not passed yet")
    }

    return await prisma.studentOpportunityInteraction.update({
        where: { id: interaction.id },
        data: {
            participated,
            status: participated ? "PARTICIPATED" : "NOT_PARTICIPATED",
            attendanceConfirmedAt: now
        }
    })
}

export async function submitFeedback(userId: string, opportunityId: string, data: any) {
    const interaction = await prisma.studentOpportunityInteraction.findUnique({
        where: { userId_opportunityId: { userId, opportunityId } },
        include: { opportunity: true }
    })

    if (!interaction || !interaction.participated) throw new Error("Must confirm participation first")
    if (interaction.feedbackSubmittedAt) throw new Error("Feedback already submitted")

    const result = await prisma.$transaction(async (tx) => {
        const feedback = await tx.opportunityFeedback.create({
            data: {
                userId,
                opportunityId,
                providerId: interaction.opportunity.providerId,
                ratingOverall: data.ratingOverall,
                ratingContent: data.ratingContent,
                ratingOrganization: data.ratingOrganization,
                ratingCommunication: data.ratingCommunication,
                comment: data.comment,
                isAnonymous: data.isAnonymous ?? true
            }
        })

        const updatedInteraction = await tx.studentOpportunityInteraction.update({
            where: { id: interaction.id },
            data: { status: "FEEDBACK_SUBMITTED", feedbackSubmittedAt: new Date() }
        })

        return { feedback, updatedInteraction }
    })

    const expectedHours = interaction.opportunity.expectedHours || 0
    let awardResult = { awarded: false }
    
    if (expectedHours > 0) {
        awardResult = await PracticalHoursService.awardPracticalHours({
            userId,
            hours: expectedHours,
            sourceType: "OPPORTUNITY_FEEDBACK",
            sourceId: interaction.opportunity.id, // safest sourceId to prevent duplicate per opportunity
            opportunityId: interaction.opportunity.id,
            feedbackId: result.feedback.id,
            description: `Feedback submitted for ${interaction.opportunity.title}`
        })
    }

    // XP & Badges
    await GamificationService.awardXp(userId, "OPPORTUNITY_FEEDBACK_SUBMITTED", result.feedback.opportunityId, XP_RULES.OPPORTUNITY_FEEDBACK_SUBMITTED || 50, "Feedback submitted")
    await BadgeService.evaluateStudentBadges(userId)

    return result.feedback
}

export async function getPendingActions(userId: string) {
    const now = new Date()
    const interactions = await prisma.studentOpportunityInteraction.findMany({
        where: { userId },
        include: { opportunity: true }
    })

    return interactions.filter(i => {
        const endDate = i.opportunity.endDate || i.opportunity.deadline
        const hasPassed = !endDate || now > endDate
        
        const needsParticipation = i.status === "INTERESTED" && hasPassed
        const needsFeedback = i.participated && !i.feedbackSubmittedAt

        return needsParticipation || needsFeedback
    }).map(i => ({
        opportunityId: i.opportunityId,
        title: i.opportunity.title,
        action: i.status === "INTERESTED" ? "CONFIRM_PARTICIPATION" : "SUBMIT_FEEDBACK"
    }))
}

export const StudentOpportunityService = {
    getApprovedOpportunities,
    getOpportunityDetail,
    markInterested,
    getInterestedOpportunities,
    confirmParticipation,
    submitFeedback,
    getPendingActions
}
