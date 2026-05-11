// Student registration and dashboard routes. Handles the full onboarding flow
// plus post-onboarding dashboard/profile management:
//
// POST  /register              — create student account + profile
// POST  /verify-email          — verify email with token
// POST  /onboarding-objectives — save onboarding objective selections (requires verified email)
// GET   /me                    — get full student dashboard (requires verified email)
// PATCH /me                    — update core profile fields (requires verified email)
// PATCH /profile-enrichment    — update optional enrichment fields (requires verified email)
// GET   /me/assessment-results        — all past assessment results (requires verified email)
// GET   /me/assessment-results/latest — latest assessment result (requires verified email)

import { Router } from "express"
import { authenticate, requireRole, requireEmailVerified } from "../middleware/auth.middleware"
import { Role } from "../../generated/prisma/enums"
import { validateRegistrationInput } from "../../application/student.validation"
import {
    registerStudent,
    verifyEmail,
    saveOnboardingObjectives
} from "../../application/student.service"
import {
    getStudentDashboard,
    updateStudentProfile,
    updateProfileEnrichment
} from "../../application/dashboard.service"
import {
    updateProfileSchema,
    updateEnrichmentSchema,
    validateRequest
} from "../../application/dashboard.validation"
import {
    getAssessmentResults,
    getLatestAssessmentResult,
    ServiceError
} from "../../application/studentAssessment.service"

const router = Router()

// guard for routes that require a verified student
const verifiedStudentGuard = [authenticate, requireRole(Role.STUDENT), requireEmailVerified]

// ─── POST /register ─────────────────────────────────────────────────────────
// Creates a new User (role=STUDENT) and StudentProfile in a single step.
// No authentication required — this is the public sign-up endpoint.
router.post("/register", async (req, res) => {
    try {
        // Validate request body
        const validation = validateRegistrationInput(req.body)
        if (!validation.valid) {
            res.status(400).json({ error: "Validation failed", details: validation.errors })
            return
        }

        const result = await registerStudent(req.body)
        res.status(201).json(result)
    } catch (error: any) {
        // Distinguish uniqueness errors from unexpected errors
        const isConflictError = [
            "Email already in use",
            "Username already taken",
            "Student ID already registered"
        ].some(msg => error.message?.includes(msg))

        if (isConflictError) {
            res.status(409).json({ error: error.message })
        } else {
            console.error("Registration error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── POST /verify-email ─────────────────────────────────────────────────────
// Verifies a student's email using the token that was generated at registration.
// No authentication required — the token itself serves as proof of identity.
router.post("/verify-email", async (req, res) => {
    try {
        const { token } = req.body

        if (!token || typeof token !== "string") {
            res.status(400).json({ error: "Verification token is required" })
            return
        }

        const result = await verifyEmail(token)
        res.status(200).json(result)
    } catch (error: any) {
        const isValidationError = [
            "Invalid verification token",
            "Email is already verified",
            "Verification token has expired"
        ].some(msg => error.message?.includes(msg))

        if (isValidationError) {
            res.status(400).json({ error: error.message })
        } else {
            console.error("Email verification error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── POST /onboarding-objectives ────────────────────────────────────────────
// Saves the student's onboarding objective selections. Requires a verified
// email (enforced by the verifiedStudentGuard middleware).
router.post("/onboarding-objectives", ...verifiedStudentGuard, async (req, res) => {
    try {
        const { objectiveIds } = req.body

        if (!objectiveIds || !Array.isArray(objectiveIds) || objectiveIds.length === 0) {
            res.status(400).json({ error: "objectiveIds must be a non-empty array" })
            return
        }

        const result = await saveOnboardingObjectives(req.user!.userId, objectiveIds)
        res.status(200).json(result)
    } catch (error: any) {
        const isClientError = [
            "Student profile not found",
            "Email must be verified",
            "Onboarding objectives have already been submitted",
            "Email verification must be completed first",
            "At least one objective",
            "Invalid objective IDs"
        ].some(msg => error.message?.includes(msg))

        if (isClientError) {
            res.status(400).json({ error: error.message })
        } else {
            console.error("Onboarding objectives error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── GET /me ────────────────────────────────────────────────────────────────
// Returns the full student dashboard including profile, enrichment fields,
// onboarding objectives, skills, and assessment readiness.
// Requires a verified email.
router.get("/me", ...verifiedStudentGuard, async (req, res) => {
    try {
        const result = await getStudentDashboard(req.user!.userId)
        res.status(200).json(result)
    } catch (error: any) {
        if (error.message?.includes("Student profile not found")) {
            res.status(404).json({ error: error.message })
        } else {
            console.error("Get dashboard error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── PATCH /me ──────────────────────────────────────────────────────────────
// Updates core profile/account fields. Supports partial updates.
// If email is changed, verification is reset and a new token is generated.
// Protected fields (role, password, verificationStatus, createdAt) cannot be set.
// Requires a verified email.
router.patch("/me", ...verifiedStudentGuard, async (req, res) => {
    try {
        // Validate request body with Zod
        const validation = validateRequest(updateProfileSchema, req.body)
        if (!validation.success) {
            res.status(400).json({ error: "Validation failed", details: validation.errors })
            return
        }

        // Reject empty update payloads
        if (Object.keys(validation.data).length === 0) {
            res.status(400).json({ error: "At least one field must be provided for update" })
            return
        }

        const result = await updateStudentProfile(req.user!.userId, validation.data)
        res.status(200).json(result)
    } catch (error: any) {
        const isConflictError = [
            "Email already in use"
        ].some(msg => error.message?.includes(msg))

        const isClientError = [
            "Student profile not found"
        ].some(msg => error.message?.includes(msg))

        if (isConflictError) {
            res.status(409).json({ error: error.message })
        } else if (isClientError) {
            res.status(404).json({ error: error.message })
        } else {
            console.error("Update profile error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── PATCH /profile-enrichment ──────────────────────────────────────────────
// Updates optional career/profile enrichment fields:
//   interests, hobbies, talents, cvLink, portfolioLink, preferences.
// Arrays are replaced entirely with the new submitted values.
// Designed so the assessment flow can later read these fields for prefill.
// Requires a verified email.
router.patch("/profile-enrichment", ...verifiedStudentGuard, async (req, res) => {
    try {
        // Validate request body with Zod
        const validation = validateRequest(updateEnrichmentSchema, req.body)
        if (!validation.success) {
            res.status(400).json({ error: "Validation failed", details: validation.errors })
            return
        }

        // Reject empty update payloads
        if (Object.keys(validation.data).length === 0) {
            res.status(400).json({ error: "At least one enrichment field must be provided" })
            return
        }

        const result = await updateProfileEnrichment(req.user!.userId, validation.data)
        res.status(200).json(result)
    } catch (error: any) {
        if (error.message?.includes("Student profile not found")) {
            res.status(404).json({ error: error.message })
        } else {
            console.error("Update enrichment error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── GET /me/assessment-results ─────────────────────────────────────────────
// Returns all past assessment results for the authenticated student.
// Sorted newest first. Does not expose internal scoring data.
router.get("/me/assessment-results", ...verifiedStudentGuard, async (req, res) => {
    try {
        const results = await getAssessmentResults(req.user!.userId)
        res.status(200).json({ results })
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Get assessment results error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── GET /me/assessment-results/latest ──────────────────────────────────────
// Returns the latest assessment result, or null if none exists.
router.get("/me/assessment-results/latest", ...verifiedStudentGuard, async (req, res) => {
    try {
        const result = await getLatestAssessmentResult(req.user!.userId)
        res.status(200).json({ result })
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Get latest assessment result error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

export { router }
