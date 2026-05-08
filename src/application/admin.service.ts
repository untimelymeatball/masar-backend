import { CompanyVerificationStatus, ProviderAccountStatus } from "../generated/prisma/enums";
import { prisma } from "../infrastructure/prisma";

// This file contains the implementation of features related to the "ADMIN"
// role. 

// getPendingVerifications returns all the provider profiles that have not
// been verified yet. The verificationStatus has to be "PENDING" for this
// to hold
async function getPendingVerifications() {
    return await prisma.providerProfile.findMany({
        where: { verificationStatus: CompanyVerificationStatus.PENDING },
        include: { user: { select: { email: true }}} // the account email lives on the user model so we use include to retrieve the email as well
    })
}

// verifyProvider is the function that admins use to verify a specific 
// provider profile, it takes two parameters which are id and status 
// but we exclude the "PENDING" status as a valid parameter as this action
// warrants either accepting the provider to the platform or rejecting them
async function verifyProvider(id: string, status: Exclude<CompanyVerificationStatus,"PENDING">) {
    // find the provider profile
    const profile = await prisma.providerProfile.findUnique({
        where: { id }
    })
    if (!profile)
        throw new Error("Provider profile not found")

    // update the providers verification status to the passed status
    return await prisma.providerProfile.update({
        where: { id },
        data: { verificationStatus: status }
    })
}

// getReports displays all the reports that have been submitted against 
// providers within the admin dashboard
async function getReports() {
    return await prisma.report.findMany({
        include: {
            // using select limits the data added to the data we need
            // we need the user facing identities and not the profile id's\
            // report model only stores the providerId and studentId that
            // relate to the profiles and not the user facing identities
            student: { select : { userId: true }},
            provider: { select: { userId: true, organizationName: true }}
        }
    })
}

// warnProvider takes a provider id and issues a warning against their
// account, first we need to find the providers profile and then update their
// accountStatus to "WARNED"
async function warnProvider(id: string) {
    const profile = await prisma.providerProfile.findUnique({
        where: { id }
    })
    if (!profile)
        throw new Error("Provider profile not found")

    return await prisma.providerProfile.update({
        where: { id },
        data: { accountStatus: ProviderAccountStatus.WARNED }
    })
}

// suspendProvider takes a provider id and issues a suspension against their
// account, first we need to find the providers profile and then update their
// accountStatus to "SUSPENDED"
async function suspendProvider(id: string) {
    const profile = await prisma.providerProfile.findUnique({
        where: { id }
    })
    if (!profile)
        throw new Error("Provider profile not found")

    return await prisma.providerProfile.update({
        where: { id },
        data: { accountStatus: ProviderAccountStatus.SUSPENDED }
    })
}

export { verifyProvider, getReports, warnProvider, suspendProvider, getPendingVerifications }
