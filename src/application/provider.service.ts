import { CompanyVerificationStatus, OpportunityType, ProviderType, WorkMode } from "../generated/prisma/enums";
import { prisma } from "../infrastructure/prisma";

// This file contains the implementation of features related to users with
// "PROVIDER" role. 

// getProfile takes userId as a parameter and queries ProviderProfile in the
// db, it returns a profile if found and throws an error if the profile
// is not found
async function getProfile(userId: string) {
    // find the profile in question
    const profile = await prisma.providerProfile.findUnique({
        where: { userId }
    })
    // throw error if profile not found
    if (!profile)
        return null

    // return the profile if it exists
    return profile
}


// updateProfile uses the PUT method to either set up the profile for the 
// first time, or update the fields if profile exists
async function updateProfile(userId: string, data: { providerType: ProviderType, organizationName: string, firstName: string, lastName: string, phone: string, email: string, description: string, location?: string | undefined, website?: string | undefined, profilePicture?: string | undefined, registrationNumber?: string | undefined }) {
    // prisma's nullable fields expect null, not undefined, so we convert here
    const normalized = {
        ...data,
        location: data.location ?? null,
        website: data.website ?? null,
        profilePicture: data.profilePicture ?? null,
        registrationNumber: data.registrationNumber ?? null,
    }

    const profile = await prisma.providerProfile.upsert({
        where: { userId },
        update: normalized,
        create: { userId, ...normalized }
    })

    return profile
}

// getOpportunities lists all the opportunities made by a provider
// find a providers profile
// then findMany on Opportunity where the provider id matches
async function getOpportunities(userId: string) {
    const profile = await prisma.providerProfile.findUnique({
        where: { userId }
    })
    if (!profile)
        throw new Error("Profile not found")

    // find all opportunities and return them
    const opportunities = await prisma.opportunity.findMany({
        where: { providerId : profile.id }
    })
    return opportunities
}

// createOpportunity allows the provider to post a new opportunity
// find a providers profile
// check if they're a company and whether they're verified or not
async function createOpportunity(userId: string, data: {
    title: string,
    description: string,
    type: OpportunityType,
    workMode: WorkMode,
    expectedHours: number,
    externalLink?: string | undefined,
    location?: string | undefined,
    deadline?: Date | undefined,
    capacity?: number | undefined,
}) {
    // fetch profile
    const profile = await prisma.providerProfile.findUnique({
        where: { userId }
    })
    if (!profile)
        throw new Error("Profile not found")

    // check if provider type is "COMPANY" and whether theyre verified or not
    if (profile.providerType === ProviderType.COMPANY && profile.verificationStatus !== CompanyVerificationStatus.VERIFIED)
        throw new Error("Companies must have a verified registration number before posting")

    // create opportunity
    const opportunity = await prisma.opportunity.create({
        data: {
            providerId: profile.id,
            title: data.title,
            description: data.description,
            type: data.type,
            workMode: data.workMode,
            expectedHours: data.expectedHours,
            externalLink: data.externalLink ?? null,
            location: data.location ?? null,
            deadline: data.deadline ?? null,
            capacity: data.capacity ?? null,
        }
    })
    return opportunity
}

// updateOpportunity allows a provider to update the details of a specific
// opportunity
// first we find the providers profile and verify ownership of the post
// then we updateMany with verification to prevent a provider from altering
// another providers post
async function updateOpportunity(userId: string, opportunityId: string, data: {
    title?: string, 
    description?: string,
    type?: OpportunityType,
    workMode?: WorkMode,
    expectedHours?: number,
    externalLink?: string | undefined,
    location?: string | undefined
    deadline?: Date | undefined,
    capacity?: number | undefined,
}) {
    // find profile
    const profile = await prisma.providerProfile.findUnique({
        where: { userId }
    })
    if (!profile)
        throw new Error("Profile not found")

    // update the opportunity if it belongs to that specific provider
    const result = await prisma.opportunity.updateMany({
        where: {
            id: opportunityId,
            providerId: profile.id
        },
        data: {
            ... data,
            externalLink: data.externalLink ?? null,
            location: data.location ?? null,
            deadline: data.deadline ?? null,
            capacity: data.capacity ?? null,
        }
    })

    // checks if opportunity wasn't found and throws error
    if (result.count === 0)
        throw new Error("Opportunity not found or does not belong to your account")

    return result

}

// deleteOpportunity allows the provider to delete an opportunity from
// their list of posted opportunities
// find the provider profile
// deleteMany with an ownership check
async function deleteOpportunity(userId: string, opportunityId: string) {
    const profile = await prisma.providerProfile.findUnique({
        where: { userId }
    })
    if (!profile)
        throw new Error("Profile not found")

    const opportunity = await prisma.opportunity.findFirst({
        where: { id: opportunityId, providerId: profile.id }
    })
    if (!opportunity)
        throw new Error("Opportunity not found or does not belong to your account")

    await prisma.$transaction([
        prisma.feedback.deleteMany({ where: { opportunityId } }),
        prisma.studentOpportunityInteraction.deleteMany({ where: { opportunityId } }),
        prisma.opportunityApplication.deleteMany({ where: { opportunityId } }),
        prisma.opportunityFeedback.deleteMany({ where: { opportunityId } }),
        prisma.practicalHourEvent.deleteMany({ where: { opportunityId } }),
        prisma.report.deleteMany({ where: { opportunityId } }),
        prisma.opportunity.delete({ where: { id: opportunityId } }),
    ])
}

// getOpportunityAnalytics returns a specific opportunity along with its
// engagement data — applications (interested students) and feedback
// first we find the providers profile to get their id
// then we findFirst on Opportunity with both the opportunityId and providerId
// this double check ensures the provider can only view their own posts
// include pulls in the related applications and feedback rows in the same query
async function getOpportunityAnalytics(userId: string, opportunityId: string) {
    // find the provider profile
    const profile = await prisma.providerProfile.findUnique({
        where: { userId }
    })
    if (!profile)
        throw new Error("Profile not found")

    // find the opportunity and verify it belongs to this provider
    // include pulls applications and feedback alongside the opportunity data
    const opportunity = await prisma.opportunity.findFirst({
        where: {
            id: opportunityId,
            providerId: profile.id
        },
        include: {
            applications: true,
            feedback: true
        }
    })

    if (!opportunity)
        throw new Error("Opportunity not found or does not belong to your account")

    return opportunity
}

export { getProfile, updateProfile, createOpportunity, getOpportunities, updateOpportunity, deleteOpportunity, getOpportunityAnalytics }