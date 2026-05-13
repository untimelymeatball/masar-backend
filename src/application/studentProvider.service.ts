import { prisma } from "../infrastructure/prisma"
import { StudentOpportunityService } from "./studentOpportunity.service"
import { ReportReason, ReportStatus } from "../generated/prisma/enums"

async function getProviderProfile(providerId: string) {
    const provider = await prisma.providerProfile.findUnique({
        where: { id: providerId },
        include: {
            opportunities: {
                where: { isApproved: true, isPublished: true },
                orderBy: { createdAt: "desc" },
                take: 5,
                include: { tags: true }
            },
            opportunityFeedback: true
        }
    })

    if (!provider) throw new Error("Provider not found")
    if (provider.accountStatus === "SUSPENDED") throw new Error("Provider account is suspended")

    // Calculate Rating Summary
    const feedbacks = provider.opportunityFeedback
    const totalFeedback = feedbacks.length
    
    const summary = {
        averageOverall: 0,
        averageContent: 0,
        averageOrganization: 0,
        averageCommunication: 0,
        totalFeedback
    }

    if (totalFeedback > 0) {
        summary.averageOverall = feedbacks.reduce((acc, f) => acc + f.ratingOverall, 0) / totalFeedback
        
        const contentFeedbacks = feedbacks.filter(f => f.ratingContent !== null)
        if (contentFeedbacks.length > 0) {
            summary.averageContent = contentFeedbacks.reduce((acc, f) => acc + (f.ratingContent || 0), 0) / contentFeedbacks.length
        }

        const orgFeedbacks = feedbacks.filter(f => f.ratingOrganization !== null)
        if (orgFeedbacks.length > 0) {
            summary.averageOrganization = orgFeedbacks.reduce((acc, f) => acc + (f.ratingOrganization || 0), 0) / orgFeedbacks.length
        }

        const commFeedbacks = feedbacks.filter(f => f.ratingCommunication !== null)
        if (commFeedbacks.length > 0) {
            summary.averageCommunication = commFeedbacks.reduce((acc, f) => acc + (f.ratingCommunication || 0), 0) / commFeedbacks.length
        }
    }

    // Return public-safe fields
    return {
        id: provider.id,
        organizationName: provider.organizationName,
        organizationType: provider.providerType,
        logo: provider.profilePicture,
        description: provider.description,
        location: provider.location,
        website: provider.website,
        isVerified: provider.verificationStatus === "VERIFIED",
        ratingSummary: summary,
        recentOpportunities: provider.opportunities
    }
}

async function getProviderOpportunities(userId: string, providerId: string, filters: any) {
    return await StudentOpportunityService.getApprovedOpportunities(userId, { ...filters, providerId })
}

async function reportProvider(userId: string, providerId: string, data: { reason: ReportReason, description: string, opportunityId?: string | undefined }) {
    // 1. Verify provider exists
    const provider = await prisma.providerProfile.findUnique({ where: { id: providerId } })
    if (!provider) throw new Error("Provider not found")

    // 2. Verify student exists
    const student = await prisma.studentProfile.findUnique({ where: { userId } })
    if (!student) throw new Error("Student profile not found")

    // 3. Verify opportunity if provided
    if (data.opportunityId) {
        const opp = await prisma.opportunity.findUnique({ where: { id: data.opportunityId } })
        if (!opp) throw new Error("Opportunity not found")
        if (opp.providerId !== providerId) throw new Error("Opportunity does not belong to this provider")
    }

    // 4. Duplicate prevention (prevent multiple PENDING reports for same reason)
    const existing = await prisma.report.findFirst({
        where: {
            studentId: student.id,
            providerId,
            opportunityId: data.opportunityId || null,
            reason: data.reason,
            status: "PENDING"
        }
    })

    if (existing) throw new Error("A pending report with this reason already exists")

    return await prisma.report.create({
        data: {
            studentId: student.id,
            providerId,
            opportunityId: data.opportunityId ?? null,
            reason: data.reason,
            description: data.description,
            status: "PENDING"
        }
    })
}

async function getStudentReports(userId: string) {
    const student = await prisma.studentProfile.findUnique({ where: { userId } })
    if (!student) throw new Error("Student profile not found")

    return await prisma.report.findMany({
        where: { studentId: student.id },
        include: {
            provider: { select: { id: true, organizationName: true } },
            opportunity: { select: { id: true, title: true } }
        },
        orderBy: { createdAt: "desc" }
    })
}

export const StudentProviderService = {
    getProviderProfile,
    getProviderOpportunities,
    reportProvider,
    getStudentReports
}
