// Dashboard service: business logic for student dashboard and profile management.
// Handles reading, updating core profile fields, and updating enrichment fields.
// Follows the same pattern as student.service.ts and auth.service.ts.

import { prisma } from "../infrastructure/prisma"
import crypto from "crypto"
import { GamificationService } from "./gamification.service"
import type { UpdateProfileInput, UpdateEnrichmentInput } from "./dashboard.validation"

// ─── 1. getStudentDashboard ─────────────────────────────────────────────────
// Returns the full student dashboard data including profile, enrichment fields,
// onboarding objectives, skills, and assessment readiness information.
// Strips sensitive fields (password, verification token/expiry).
async function getStudentDashboard(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            studentProfile: {
                include: {
                    objectives: {
                        include: { objective: true }
                    },
                    skills: true,
                    assessment: {
                        select: { status: true }
                    }
                }
            }
        }
    })

    if (!user || !user.studentProfile) {
        throw new Error("Student profile not found")
    }

    const profile = user.studentProfile

    // Strip sensitive fields from the user object
    const {
        password: _,
        emailVerificationToken: __,
        emailVerificationExpiry: ___,
        ...safeUser
    } = user

    // Compute assessment readiness — indicates whether optional enrichment
    // fields have been filled (useful for assessment prefill later)
    const assessmentReadiness = {
        hasInterests: profile.interests.length > 0,
        hasSkills: profile.skills.length > 0,
        hasHobbies: profile.hobbies.length > 0,
        hasTalents: profile.talents.length > 0,
        hasPreferences: profile.preferences.length > 0,
        enrichmentComplete:
            profile.interests.length > 0 &&
            profile.skills.length > 0 &&
            profile.hobbies.length > 0 &&
            profile.talents.length > 0 &&
            profile.preferences.length > 0
    }

    // Determine assessment status
    const assessmentStatus = profile.assessment?.status ?? "NOT_STARTED"

    return {
        ...safeUser,
        studentProfile: {
            id: profile.id,
            firstName: profile.firstName,
            lastName: profile.lastName,
            studentId: profile.studentId,
            phone: profile.phone,
            province: profile.province,
            city: profile.city,
            birthdate: profile.birthdate,
            major: profile.major,
            educationLevel: profile.educationLevel,
            graduationYear: profile.graduationYear,
            profilePicture: profile.profilePicture,
            bio: profile.bio,
            onboardingStatus: profile.onboardingStatus,
            // Enrichment fields
            interests: profile.interests,
            hobbies: profile.hobbies,
            talents: profile.talents,
            cvLink: profile.cvLink,
            portfolioLink: profile.portfolioLink,
            preferences: profile.preferences,
            // Related data
            objectives: profile.objectives.map(so => ({
                id: so.objective.id,
                key: so.objective.key,
                label: so.objective.label
            })),
            skills: profile.skills.map(s => ({
                id: s.id,
                name: s.name
            })),
            // Assessment info
            assessmentStatus,
            assessmentReadiness,
            // Timestamps
            createdAt: profile.createdAt,
            updatedAt: profile.updatedAt
        }
    }
}

// ─── 2. updateStudentProfile ────────────────────────────────────────────────
// Updates core profile/account fields. Supports partial updates.
// If email is changed: checks uniqueness, resets verification, generates new token.
// Protected fields (role, password, verificationStatus, createdAt) cannot be set.
async function updateStudentProfile(userId: string, data: UpdateProfileInput) {
    // Fetch current user + profile
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { studentProfile: true }
    })

    if (!user || !user.studentProfile) {
        throw new Error("Student profile not found")
    }

    const profileId = user.studentProfile.id

    // ── Handle email change ──────────────────────────────────────────────
    let emailChanged = false
    let verificationToken: string | null = null
    let verificationExpiry: Date | null = null

    if (data.email && data.email !== user.email) {
        // Check email uniqueness
        const existingEmail = await prisma.user.findUnique({
            where: { email: data.email }
        })
        if (existingEmail) {
            throw new Error("Email already in use")
        }

        emailChanged = true
        verificationToken = crypto.randomBytes(32).toString("hex")
        verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24h
    }

    // ── Build update payloads ────────────────────────────────────────────
    // Separate user-level fields from profile-level fields
    const userUpdate: Record<string, unknown> = {}
    const profileUpdate: Record<string, unknown> = {}

    // User-level: email
    if (emailChanged) {
        userUpdate.email = data.email
        userUpdate.isEmailVerified = false
        userUpdate.emailVerificationToken = verificationToken
        userUpdate.emailVerificationExpiry = verificationExpiry
    }

    // Profile-level fields
    if (data.firstName !== undefined) profileUpdate.firstName = data.firstName
    if (data.lastName !== undefined) profileUpdate.lastName = data.lastName
    if (data.phone !== undefined) profileUpdate.phone = data.phone
    if (data.province !== undefined) profileUpdate.province = data.province
    if (data.city !== undefined) profileUpdate.city = data.city
    if (data.birthdate !== undefined) profileUpdate.birthdate = new Date(data.birthdate)
    if (data.profilePicture !== undefined) profileUpdate.profilePicture = data.profilePicture
    if (data.bio !== undefined) profileUpdate.bio = data.bio
    if (data.educationLevel !== undefined) profileUpdate.educationLevel = data.educationLevel
    if (data.major !== undefined) profileUpdate.major = data.major
    if (data.graduationYear !== undefined) profileUpdate.graduationYear = data.graduationYear

    // If email changed, also reset onboarding status on the profile
    if (emailChanged) {
        profileUpdate.onboardingStatus = "PENDING_VERIFICATION"
    }

    // ── Execute update in transaction ────────────────────────────────────
    const result = await prisma.$transaction(async (tx) => {
        let updatedUserData = {
            id: user.id,
            username: user.username,
            email: user.email,
            role: user.role,
            isEmailVerified: user.isEmailVerified,
            createdAt: user.createdAt,
            updatedAt: user.updatedAt
        }

        if (Object.keys(userUpdate).length > 0) {
            const updated = await tx.user.update({
                where: { id: userId },
                data: userUpdate
            })
            updatedUserData = {
                id: updated.id,
                username: updated.username,
                email: updated.email,
                role: updated.role,
                isEmailVerified: updated.isEmailVerified,
                createdAt: updated.createdAt,
                updatedAt: updated.updatedAt
            }
        }

        let updatedProfile = user.studentProfile!
        if (Object.keys(profileUpdate).length > 0) {
            updatedProfile = await tx.studentProfile.update({
                where: { id: profileId },
                data: profileUpdate
            })
        }

        return { user: updatedUserData, profile: updatedProfile }
    })

    // Log verification email if email was changed (same pattern as registration)
    if (emailChanged) {
        console.log("═══════════════════════════════════════════════════════════")
        console.log("📧 EMAIL VERIFICATION (email changed — re-verification required)")
        console.log(`   Student: ${result.profile.firstName} ${result.profile.lastName}`)
        console.log(`   New Email: ${data.email}`)
        console.log(`   Token:    ${verificationToken}`)
        console.log(`   Expires:  ${verificationExpiry?.toISOString()}`)
        console.log(`   Link:     POST /api/students/verify-email { "token": "${verificationToken}" }`)
        console.log("═══════════════════════════════════════════════════════════")
    }

    const response = {
        message: emailChanged
            ? "Profile updated successfully. Email changed — please verify your new email address."
            : "Profile updated successfully",
        emailVerificationRequired: emailChanged,
        profile: {
            ...result.user,
            studentProfile: {
                id: result.profile.id,
                firstName: result.profile.firstName,
                lastName: result.profile.lastName,
                phone: result.profile.phone,
                province: result.profile.province,
                city: result.profile.city,
                birthdate: result.profile.birthdate,
                major: result.profile.major,
                educationLevel: result.profile.educationLevel,
                graduationYear: result.profile.graduationYear,
                profilePicture: result.profile.profilePicture,
                bio: result.profile.bio,
                onboardingStatus: result.profile.onboardingStatus
            }
        }
    }

    // Check for profile completeness XP
    await GamificationService.checkProfileCompleteness(userId)

    return response
}

// ─── 3. updateProfileEnrichment ─────────────────────────────────────────────
// Updates optional career/profile enrichment fields. Arrays are replaced
// entirely with the new submitted values (not merged).
// Designed so the assessment flow can later read these fields for prefill.
async function updateProfileEnrichment(userId: string, data: UpdateEnrichmentInput) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: { studentProfile: true }
    })

    if (!user || !user.studentProfile) {
        throw new Error("Student profile not found")
    }

    const profileId = user.studentProfile.id

    // Build update payload — only include fields that were provided
    const updateData: Record<string, unknown> = {}

    if (data.interests !== undefined) updateData.interests = data.interests
    if (data.hobbies !== undefined) updateData.hobbies = data.hobbies
    if (data.talents !== undefined) updateData.talents = data.talents
    if (data.preferences !== undefined) updateData.preferences = data.preferences
    if (data.cvLink !== undefined) updateData.cvLink = data.cvLink
    if (data.portfolioLink !== undefined) updateData.portfolioLink = data.portfolioLink

    const updatedProfile = await prisma.studentProfile.update({
        where: { id: profileId },
        data: updateData,
        select: {
            interests: true,
            hobbies: true,
            talents: true,
            cvLink: true,
            portfolioLink: true,
            preferences: true
        }
    })

    // Check for profile completeness XP
    await GamificationService.checkProfileCompleteness(userId)

    return {
        message: "Enrichment data updated successfully",
        enrichment: updatedProfile
    }
}

export { getStudentDashboard, updateStudentProfile, updateProfileEnrichment }
