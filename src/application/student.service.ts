// This file contains the student registration service, handling the full
// student onboarding flow from sign-up through email verification to
// onboarding objective selection. Follows the same pattern as auth.service.ts.

import { prisma } from "../infrastructure/prisma"
import bcrypt from "bcrypt"
import crypto from "crypto"
import { GamificationService } from "./gamification.service"
import { XP_RULES } from "../config/gamification"
import { BadgeService } from "./badge.service"

// ─── Types ──────────────────────────────────────────────────────────────────

interface RegisterStudentInput {
    email: string
    username: string
    password: string
    studentId: string
    firstName: string
    lastName: string
    phone: string
    province: string
    birthdate: string // ISO date string
    educationLevel: string
    major: string
    graduationYear: number
    profilePicture?: string
    bio?: string
}

// ─── 1. registerStudent ─────────────────────────────────────────────────────
// Creates a User (role STUDENT) and a StudentProfile in a single transaction.
// Generates an email verification token and logs it to the console.
async function registerStudent(data: RegisterStudentInput) {
    // Check uniqueness: email
    const existingEmail = await prisma.user.findUnique({
        where: { email: data.email }
    })
    if (existingEmail) throw new Error("Email already in use")

    // Check uniqueness: username
    const existingUsername = await prisma.user.findUnique({
        where: { username: data.username }
    })
    if (existingUsername) throw new Error("Username already taken")

    // Check uniqueness: studentId
    const existingStudentId = await prisma.studentProfile.findUnique({
        where: { studentId: data.studentId }
    })
    if (existingStudentId) throw new Error("Student ID already registered")

    // Hash the password (cost factor 12, matching auth.service.ts)
    const hashedPassword = await bcrypt.hash(data.password, 12)

    // Generate verification token (64 hex characters) with 24h expiry
    const verificationToken = crypto.randomBytes(32).toString("hex")
    const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours from now

    // Create User + StudentProfile in a single transaction
    const result = await prisma.$transaction(async (tx) => {
        const user = await tx.user.create({
            data: {
                email: data.email,
                username: data.username,
                password: hashedPassword,
                role: "STUDENT",
                isEmailVerified: false,
                emailVerificationToken: verificationToken,
                emailVerificationExpiry: verificationExpiry
            }
        })

        const profile = await tx.studentProfile.create({
            data: {
                userId: user.id,
                firstName: data.firstName,
                lastName: data.lastName,
                studentId: data.studentId,
                phone: data.phone,
                province: data.province,
                birthdate: new Date(data.birthdate),
                educationLevel: data.educationLevel,
                major: data.major,
                graduationYear: data.graduationYear,
                profilePicture: data.profilePicture ?? null,
                bio: data.bio ?? null,
                onboardingStatus: "PENDING_VERIFICATION"
            }
        })

        return { user, profile }
    })

    // Log the verification link (email sending is not configured yet)
    console.log("═══════════════════════════════════════════════════════════")
    console.log("📧 EMAIL VERIFICATION (mock — no email service configured)")
    console.log(`   Student: ${data.firstName} ${data.lastName}`)
    console.log(`   Email:   ${data.email}`)
    console.log(`   Token:   ${verificationToken}`)
    console.log(`   Expires: ${verificationExpiry.toISOString()}`)
    console.log(`   Link:    POST /api/students/verify-email { "token": "${verificationToken}" }`)
    console.log("═══════════════════════════════════════════════════════════")

    // Return user + profile without password
    const { password: _, emailVerificationToken: __, emailVerificationExpiry: ___, ...safeUser } = result.user
    return {
        user: safeUser,
        profile: result.profile
    }
}

// ─── 2. verifyEmail ─────────────────────────────────────────────────────────
// Validates the verification token, marks the email as verified, and
// advances the student's onboarding status to PENDING_ONBOARDING.
async function verifyEmail(token: string) {
    if (!token || typeof token !== "string") {
        throw new Error("Verification token is required")
    }

    const user = await prisma.user.findUnique({
        where: { emailVerificationToken: token },
        include: { studentProfile: true }
    })

    if (!user) {
        throw new Error("Invalid verification token")
    }

    if (user.isEmailVerified) {
        throw new Error("Email is already verified")
    }

    if (user.emailVerificationExpiry && user.emailVerificationExpiry < new Date()) {
        throw new Error("Verification token has expired")
    }

    // Update user: mark email as verified, clear token fields
    await prisma.$transaction(async (tx) => {
        await tx.user.update({
            where: { id: user.id },
            data: {
                isEmailVerified: true,
                emailVerificationToken: null,
                emailVerificationExpiry: null
            }
        })

        // Advance onboarding status if a student profile exists
        if (user.studentProfile) {
            await tx.studentProfile.update({
                where: { userId: user.id },
                data: { onboardingStatus: "PENDING_ONBOARDING" }
            })
        }
    })

    // Gamification Hook: Email Verified
    await GamificationService.awardXp(
        user.id,
        "EMAIL_VERIFIED",
        user.id,
        XP_RULES.EMAIL_VERIFIED,
        "Email verified"
    )

    return { message: "Email verified successfully" }
}

// ─── 3. saveOnboardingObjectives ────────────────────────────────────────────
// Saves the student's selected onboarding objectives and advances their
// onboarding status to COMPLETED. Requires the student to be email-verified.
async function saveOnboardingObjectives(userId: string, objectiveIds: string[]) {
    // Fetch the student profile
    const profile = await prisma.studentProfile.findUnique({
        where: { userId },
        include: { user: true }
    })

    if (!profile) {
        throw new Error("Student profile not found")
    }

    if (!profile.user.isEmailVerified) {
        throw new Error("Email must be verified before completing onboarding")
    }

    if (profile.onboardingStatus !== "PENDING_ONBOARDING") {
        throw new Error(
            profile.onboardingStatus === "COMPLETED"
                ? "Onboarding objectives have already been submitted"
                : "Email verification must be completed first"
        )
    }

    // Validate objectiveIds
    if (!objectiveIds || !Array.isArray(objectiveIds) || objectiveIds.length === 0) {
        throw new Error("At least one objective must be selected")
    }

    // Verify all objective IDs exist
    const objectives = await prisma.onboardingObjective.findMany({
        where: { id: { in: objectiveIds } }
    })

    if (objectives.length !== objectiveIds.length) {
        const foundIds = new Set(objectives.map(o => o.id))
        const invalidIds = objectiveIds.filter(id => !foundIds.has(id))
        throw new Error(`Invalid objective IDs: ${invalidIds.join(", ")}`)
    }

    // Create StudentObjective records and update onboarding status
    const result = await prisma.$transaction(async (tx) => {
        const created = await Promise.all(
            objectiveIds.map(objectiveId =>
                tx.studentObjective.create({
                    data: {
                        studentId: profile.id,
                        objectiveId
                    },
                    include: { objective: true }
                })
            )
        )

        await tx.studentProfile.update({
            where: { id: profile.id },
            data: { onboardingStatus: "COMPLETED" }
        })

        return created
    })

    return {
        message: "Onboarding objectives saved successfully",
        objectives: result.map(r => ({
            id: r.objective.id,
            key: r.objective.key,
            label: r.objective.label
        }))
    }
}

// ─── 4. getStudentProfile ───────────────────────────────────────────────────
// Returns the full student profile including user info, objectives, and
// registration status. Strips sensitive fields (password, verification token).
async function getStudentProfile(userId: string) {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        include: {
            studentProfile: {
                include: {
                    objectives: {
                        include: { objective: true }
                    },
                    skills: true
                }
            }
        }
    })

    if (!user || !user.studentProfile) {
        throw new Error("Student profile not found")
    }

    // Strip sensitive fields
    const { password: _, emailVerificationToken: __, emailVerificationExpiry: ___, ...safeUser } = user

    return {
        ...safeUser,
        studentProfile: {
            ...user.studentProfile,
            objectives: user.studentProfile.objectives.map(so => ({
                id: so.objective.id,
                key: so.objective.key,
                label: so.objective.label
            }))
        }
    }
}
// ─── 5. getOnboardingObjectives ─────────────────────────────────────────────
// Returns all available onboarding objectives for the registration form.
// Public — called before email verification, so no auth required.
async function getOnboardingObjectives() {
    const objectives = await prisma.onboardingObjective.findMany({
        select: { id: true, key: true, label: true },
        orderBy: { label: "asc" }
    })
    return objectives
}

// ─── 6. linkAffiliation ─────────────────────────────────────────────────────
// Sets StudentProfile.academicId by looking up an AcademicProfile via its
// affiliationCode. Throws if the code doesn't match any academic.
async function linkAffiliation(userId: string, affiliationCode: string) {
    const studentProfile = await prisma.studentProfile.findUnique({
        where: { userId }
    })
    if (!studentProfile)
        throw new Error("Student profile not found")

    const academicProfile = await prisma.academicProfile.findFirst({
        where: { affiliationCode: { equals: affiliationCode.toLowerCase(), mode: "insensitive" } }
    })
    if (!academicProfile)
        throw new Error("Invalid affiliation code")

    await prisma.studentProfile.update({
        where: { id: studentProfile.id },
        data: { academicId: academicProfile.id }
    })

    return { message: "Affiliation linked successfully" }
}

// ─── 7. unlinkAffiliation ───────────────────────────────────────────────────
async function unlinkAffiliation(userId: string) {
    const studentProfile = await prisma.studentProfile.findUnique({ where: { userId } })
    if (!studentProfile)
        throw new Error("Student profile not found")

    await prisma.studentProfile.update({
        where: { id: studentProfile.id },
        data: { academicId: null }
    })

    return { message: "Affiliation removed successfully" }
}

export { registerStudent, verifyEmail, saveOnboardingObjectives, getStudentProfile, getOnboardingObjectives, linkAffiliation, unlinkAffiliation }
