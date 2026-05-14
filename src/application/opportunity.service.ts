import { prisma } from "../infrastructure/prisma"

// ─── getStudentOpportunities ─────────────────────────────────────────────────
// Returns all published+approved opportunities with the calling student's
// current interaction status (INTERESTED / PARTICIPATED / FEEDBACK_SUBMITTED / null).
async function getStudentOpportunities(userId: string) {
    const opportunities = await prisma.opportunity.findMany({
        where: { isPublished: true, isApproved: true },
        include: {
            provider: { select: { organizationName: true, profilePicture: true } },
            tags: { select: { name: true } },
            studentInteractions: { where: { userId } }
        },
        orderBy: { createdAt: "desc" }
    })

    return opportunities.map(op => ({
        id: op.id,
        title: op.title,
        description: op.description,
        type: op.type,
        workMode: op.workMode,
        expectedHours: op.expectedHours,
        location: op.location,
        deadline: op.deadline ? op.deadline.toISOString().split("T")[0] : null,
        capacity: op.capacity,
        externalLink: op.externalLink,
        tags: op.tags.map(t => t.name),
        providerName: op.provider.organizationName,
        providerLogo: op.provider.profilePicture,
        isApproved: op.isApproved,
        createdAt: op.createdAt.toISOString(),
        interactionStatus: op.studentInteractions[0]?.status ?? null
    }))
}

// ─── toggleOpportunityInterest ───────────────────────────────────────────────
// Creates an INTERESTED interaction if none exists, or removes it if the
// student is currently INTERESTED. Throws if they have already participated
// — you cannot un-interest after that point.
async function toggleOpportunityInterest(userId: string, opportunityId: string) {
    const existing = await prisma.studentOpportunityInteraction.findUnique({
        where: { userId_opportunityId: { userId, opportunityId } }
    })

    if (existing) {
        if (existing.status !== "INTERESTED") {
            throw new Error("Cannot remove interest after participating")
        }
        await prisma.studentOpportunityInteraction.delete({
            where: { userId_opportunityId: { userId, opportunityId } }
        })
        return { interactionStatus: null }
    }

    await prisma.studentOpportunityInteraction.create({
        data: { userId, opportunityId, status: "INTERESTED" }
    })
    return { interactionStatus: "INTERESTED" }
}

// ─── markOpportunityParticipation ───────────────────────────────────────────
// Upserts the student's interaction record to PARTICIPATED and records when
// attendance was confirmed. This is the "mark as completed" action from the
// student's perspective.
async function markOpportunityParticipation(userId: string, opportunityId: string) {
    const result = await prisma.studentOpportunityInteraction.upsert({
        where: { userId_opportunityId: { userId, opportunityId } },
        update: {
            status: "PARTICIPATED",
            attendanceConfirmedAt: new Date(),
            participated: true
        },
        create: {
            userId,
            opportunityId,
            status: "PARTICIPATED",
            attendanceConfirmedAt: new Date(),
            participated: true
        }
    })
    return { interactionStatus: result.status }
}

// ─── submitOpportunityFeedback ───────────────────────────────────────────────
// Creates or updates an OpportunityFeedback record and advances the
// interaction status to FEEDBACK_SUBMITTED. Both operations run in a
// transaction so the status is never out of sync with the feedback row.
async function submitOpportunityFeedback(
    userId: string,
    opportunityId: string,
    data: {
        ratingOverall: number
        comment?: string
        isAnonymous?: boolean
    }
) {
    const opportunity = await prisma.opportunity.findUnique({
        where: { id: opportunityId }
    })
    if (!opportunity) throw new Error("Opportunity not found")

    await prisma.$transaction(async (tx) => {
        await tx.opportunityFeedback.upsert({
            where: { userId_opportunityId: { userId, opportunityId } },
            update: {
                ratingOverall: data.ratingOverall,
                comment: data.comment ?? null,
                isAnonymous: data.isAnonymous ?? true
            },
            create: {
                userId,
                opportunityId,
                providerId: opportunity.providerId,
                ratingOverall: data.ratingOverall,
                comment: data.comment ?? null,
                isAnonymous: data.isAnonymous ?? true
            }
        })

        await tx.studentOpportunityInteraction.upsert({
            where: { userId_opportunityId: { userId, opportunityId } },
            update: {
                status: "FEEDBACK_SUBMITTED",
                feedbackSubmittedAt: new Date()
            },
            create: {
                userId,
                opportunityId,
                status: "FEEDBACK_SUBMITTED",
                feedbackSubmittedAt: new Date()
            }
        })
    })

    return { message: "Feedback submitted successfully" }
}

export {
    getStudentOpportunities,
    toggleOpportunityInterest,
    markOpportunityParticipation,
    submitOpportunityFeedback
}
