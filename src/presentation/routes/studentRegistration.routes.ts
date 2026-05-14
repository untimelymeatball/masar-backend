// Student registration, dashboard, and career selection routes.
// Handles the full onboarding flow plus post-onboarding management:
//
// POST   /register                        — create student account + profile
// POST   /verify-email                    — verify email with token
// POST   /onboarding-objectives           — save onboarding objective selections (requires verified email)
// GET    /me                              — get full student dashboard (requires verified email)
// PATCH  /me                              — update core profile fields (requires verified email)
// PATCH  /profile-enrichment              — update optional enrichment fields (requires verified email)
// GET    /me/assessment-results           — all past assessment results (requires verified email)
// GET    /me/assessment-results/latest    — latest assessment result (requires verified email)
// GET    /me/career-recommendations/latest — enriched career recommendations (requires verified email)
// POST   /me/selected-careers             — select 1–3 career paths (requires verified email)
// POST   /me/selected-careers/add         — append one career post-completion (requires verified email)
// GET    /me/selected-careers             — get selected career paths (requires verified email)
// DELETE /me/selected-careers/:careerId   — remove one selected career (requires verified email)
// GET    /me/roadmaps                     — full roadmap details for selected careers (requires verified email)
// GET    /me/roadmaps/:careerId           — single roadmap with real progress (requires verified email)
// GET    /me/roadmaps/:careerId/items/:roadmapItemId — roadmap item detail (requires verified email)
// PATCH  /me/roadmaps/:careerId/items/:roadmapItemId/status — update item status (requires verified email)
// PATCH  /me/roadmaps/:careerId/items/:roadmapItemId/tasks/:taskId — toggle task completion (requires verified email)
// GET    /me/roadmaps/:careerId/progress  — roadmap progress analytics (requires verified email)
// GET    /me/opportunities                — all published opportunities with student interaction status (requires verified email)
// POST   /me/opportunities/:id/interest   — toggle interest on an opportunity (requires verified email)
// POST   /me/opportunities/:id/participation — mark an opportunity as participated (requires verified email)
// POST   /me/opportunities/:id/feedback   — submit feedback for a completed opportunity (requires verified email)
// GET    /me/providers/:providerId         — get public provider profile with rating summary (requires verified email)
// POST   /me/providers/:providerId/report  — submit a report against a provider (requires verified email)

import { Router } from "express"
import { prisma } from "../../infrastructure/prisma"
import { authenticate, requireRole, requireEmailVerified } from "../middleware/auth.middleware"
import { Role } from "../../generated/prisma/enums"
import { validateRegistrationInput } from "../../application/student.validation"
import {
    registerStudent,
    verifyEmail,
    saveOnboardingObjectives,
    getOnboardingObjectives,
    linkAffiliation,
    unlinkAffiliation
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
import {
    selectCareersSchema,
    careerIdParamSchema
} from "../../application/careerSelection.validation"
import {
    getLatestCareerRecommendations,
    selectCareers,
    getSelectedCareers,
    removeSelectedCareer,
    getSelectedRoadmaps,
    addCareer
} from "../../application/careerSelection.service"
import {
    roadmapCareerIdParamSchema,
    roadmapItemParamSchema,
    roadmapTaskParamSchema,
    updateItemStatusSchema,
    updateTaskCompletionSchema
} from "../../application/roadmapProgress.validation"
import {
    getSelectedRoadmapDetail,
    getRoadmapItemDetail,
    updateRoadmapItemStatus,
    updateTaskCompletion,
    getRoadmapProgress
} from "../../application/roadmapProgress.service"
import {
    selectRoadmapsBySlug,
    getRoadmapsSlugFormat,
    updateRoadmapPointBySlug
} from "../../application/slugRoadmap.service"
import {
    selectSlugsSchema,
    roadmapSlugParamSchema,
    roadmapPointSlugParamSchema,
    updatePointCompletionSchema
} from "../../application/roadmapProgress.validation"
import {
    getStudentOpportunities,
    toggleOpportunityInterest,
    markOpportunityParticipation,
    submitOpportunityFeedback
} from "../../application/opportunity.service"
import { StudentProviderService } from "../../application/studentProvider.service"
import { reportProviderSchema } from "../../application/studentProvider.validation"

const router = Router()

// guard for routes that require a verified student
const verifiedStudentGuard = [authenticate, requireRole(Role.STUDENT), requireEmailVerified]

// ─── GET /check-username ─────────────────────────────────────────────────────
// Checks whether a username is available. Public — called while typing in the
// registration form before any account exists. Returns { available: boolean }.
router.get("/check-username", async (req, res) => {
    const username = (req.query.username as string) ?? ""
    if (!username || username.length < 3) {
        res.status(200).json({ available: false })
        return
    }
    try {
        const existing = await prisma.user.findUnique({
            where: { username },
            select: { id: true }
        })
        res.status(200).json({ available: !existing })
    } catch {
        res.status(200).json({ available: false })
    }
})

// ─── GET /onboarding-objectives ─────────────────────────────────────────────
// Returns available onboarding objectives for the registration form.
// No authentication required — called before email verification.
router.get("/onboarding-objectives", async (req, res) => {
    try {
        const objectives = await getOnboardingObjectives()
        res.status(200).json({ success: true, data: objectives })
    } catch (error: any) {
        res.status(500).json({ success: false, message: "Failed to fetch objectives" })
    }
})

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

// ─── PATCH /me/affiliation ───────────────────────────────────────────────────
// Links the authenticated student to an academic supervisor by affiliation code.
// The code is generated by the academic and shared with the student out-of-band.
router.patch("/me/affiliation", ...verifiedStudentGuard, async (req, res) => {
    try {
        const { affiliationCode } = req.body
        if (!affiliationCode || typeof affiliationCode !== "string") {
            res.status(400).json({ error: "affiliationCode is required" })
            return
        }
        const result = await linkAffiliation(req.user!.userId, affiliationCode)
        res.status(200).json(result)
    } catch (error: any) {
        if (error.message?.includes("Invalid affiliation code") || error.message?.includes("not found")) {
            res.status(400).json({ error: error.message })
        } else {
            console.error("Link affiliation error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── DELETE /me/affiliation ──────────────────────────────────────────────────
// Removes the student's link to their academic supervisor.
router.delete("/me/affiliation", ...verifiedStudentGuard, async (req, res) => {
    try {
        const result = await unlinkAffiliation(req.user!.userId)
        res.status(200).json(result)
    } catch (error: any) {
        if (error.message?.includes("not found")) {
            res.status(404).json({ error: error.message })
        } else {
            console.error("Unlink affiliation error:", error)
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

// ─── GET /me/career-recommendations/latest ──────────────────────────────────
// Returns the latest assessment result for the student with enriched career
// data including descriptions and live roadmap preview topics from the DB.
// If no assessment has been completed, returns a clean message.
router.get("/me/career-recommendations/latest", ...verifiedStudentGuard, async (req, res) => {
    try {
        const result = await getLatestCareerRecommendations(req.user!.userId)

        if (!result) {
            res.status(200).json({
                result: null,
                message: "No assessment results found. Please complete the career assessment first."
            })
            return
        }

        res.status(200).json({ result })
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Get career recommendations error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── POST /me/selected-careers ──────────────────────────────────────────────
// Allows the student to select 1–3 career paths from their assessment results.
// Replaces any existing selections with the new submitted set.
router.post("/me/selected-careers", ...verifiedStudentGuard, async (req, res) => {
    try {
        // Validate request body with Zod
        const validation = validateRequest(selectCareersSchema, req.body)
        if (!validation.success) {
            res.status(400).json({ error: "Validation failed", details: validation.errors })
            return
        }

        const result = await selectCareers(req.user!.userId, validation.data.careerIds)
        res.status(200).json({
            message: "Career paths selected successfully",
            ...result
        })
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Select careers error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── POST /me/selected-careers/add ──────────────────────────────────────────
// Appends a single career from the "Explore more roadmaps" section without
// replacing existing selections. Only valid for assessment-recommended careers.
router.post("/me/selected-careers/add", ...verifiedStudentGuard, async (req, res) => {
    try {
        const paramValidation = validateRequest(careerIdParamSchema, req.body)
        if (!paramValidation.success) {
            res.status(400).json({ error: "Validation failed", details: paramValidation.errors })
            return
        }

        const result = await addCareer(req.user!.userId, paramValidation.data.careerId)
        res.status(200).json({
            message: "Career path added successfully",
            ...result
        })
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Add career error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── GET /me/selected-careers ───────────────────────────────────────────────
// Returns the student's currently selected career paths with roadmap
// item counts and placeholder progress fields.
router.get("/me/selected-careers", ...verifiedStudentGuard, async (req, res) => {
    try {
        const result = await getSelectedCareers(req.user!.userId)
        res.status(200).json(result)
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Get selected careers error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── DELETE /me/selected-careers/:careerId ──────────────────────────────────
// Removes one selected career path from the student's selections.
// After deletion, the student may temporarily have 0 selected careers.
// This is acceptable — they can re-select via POST /me/selected-careers.
router.delete("/me/selected-careers/:careerId", ...verifiedStudentGuard, async (req, res) => {
    try {
        // Validate route param with Zod
        const paramValidation = validateRequest(careerIdParamSchema, req.params)
        if (!paramValidation.success) {
            res.status(400).json({ error: "Validation failed", details: paramValidation.errors })
            return
        }

        const result = await removeSelectedCareer(req.user!.userId, paramValidation.data.careerId)
        res.status(200).json({
            message: "Career path removed from selections",
            ...result
        })
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Remove selected career error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── GET /me/roadmaps ───────────────────────────────────────────────────────
// Returns full roadmap details for all selected careers, including ordered
// roadmap items/topics with real progress status.
router.get("/me/roadmaps", ...verifiedStudentGuard, async (req, res) => {
    try {
        if (req.query.format === "slug") {
            const slugResult = await getRoadmapsSlugFormat(req.user!.userId)
            res.status(200).json(slugResult)
            return
        }

        const result = await getSelectedRoadmaps(req.user!.userId)
        res.status(200).json(result)
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Get roadmaps error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── POST /me/roadmaps/select ───────────────────────────────────────────────
// Allows student to select 1–3 career roadmaps using slugs.
router.post("/me/roadmaps/select", ...verifiedStudentGuard, async (req, res) => {
    try {
        const validation = validateRequest(selectSlugsSchema, req.body)
        if (!validation.success) {
            res.status(400).json({ error: "Validation failed", details: validation.errors })
            return
        }

        const result = await selectRoadmapsBySlug(req.user!.userId, validation.data.careerSlugs)
        res.status(200).json({
            message: "Career roadmaps selected successfully",
            ...result
        })
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Select roadmaps by slug error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── PATCH /me/roadmaps/:careerSlug/points/:pointKey ────────────────────────
// Marks a roadmap point as completed or uncompleted.
router.patch("/me/roadmaps/:careerSlug/points/:pointKey", ...verifiedStudentGuard, async (req, res) => {
    try {
        const paramValidation = validateRequest(roadmapPointSlugParamSchema, req.params)
        if (!paramValidation.success) {
            res.status(400).json({ error: "Validation failed", details: paramValidation.errors })
            return
        }

        const bodyValidation = validateRequest(updatePointCompletionSchema, req.body)
        if (!bodyValidation.success) {
            res.status(400).json({ error: "Validation failed", details: bodyValidation.errors })
            return
        }

        const { careerSlug, pointKey } = paramValidation.data
        const { isCompleted } = bodyValidation.data

        const result = await updateRoadmapPointBySlug(req.user!.userId, careerSlug, pointKey, isCompleted)
        res.status(200).json(result)
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Update roadmap point by slug error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── GET /me/roadmaps/:careerId ─────────────────────────────────────────────
// Returns the full selected roadmap for a specific career with real progress
// data including item statuses, task counts, and completion state.
router.get("/me/roadmaps/:careerId", ...verifiedStudentGuard, async (req, res) => {
    try {
        const paramValidation = validateRequest(roadmapCareerIdParamSchema, req.params)
        if (!paramValidation.success) {
            res.status(400).json({ error: "Validation failed", details: paramValidation.errors })
            return
        }

        const result = await getSelectedRoadmapDetail(req.user!.userId, paramValidation.data.careerId)
        res.status(200).json(result)
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Get roadmap detail error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── GET /me/roadmaps/:careerId/items/:roadmapItemId ────────────────────────
// Returns one roadmap item in detail with its tasks and completion states.
router.get("/me/roadmaps/:careerId/items/:roadmapItemId", ...verifiedStudentGuard, async (req, res) => {
    try {
        const paramValidation = validateRequest(roadmapItemParamSchema, req.params)
        if (!paramValidation.success) {
            res.status(400).json({ error: "Validation failed", details: paramValidation.errors })
            return
        }

        const { careerId, roadmapItemId } = paramValidation.data
        const result = await getRoadmapItemDetail(req.user!.userId, careerId, roadmapItemId)
        res.status(200).json(result)
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Get roadmap item detail error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── PATCH /me/roadmaps/:careerId/items/:roadmapItemId/status ───────────────
// Updates the status of a roadmap item (not_started, in_progress, completed).
// On completion: marks all tasks as completed. Does not award points yet.
router.patch("/me/roadmaps/:careerId/items/:roadmapItemId/status", ...verifiedStudentGuard, async (req, res) => {
    try {
        const paramValidation = validateRequest(roadmapItemParamSchema, req.params)
        if (!paramValidation.success) {
            res.status(400).json({ error: "Validation failed", details: paramValidation.errors })
            return
        }

        const bodyValidation = validateRequest(updateItemStatusSchema, req.body)
        if (!bodyValidation.success) {
            res.status(400).json({ error: "Validation failed", details: bodyValidation.errors })
            return
        }

        const { careerId, roadmapItemId } = paramValidation.data
        const result = await updateRoadmapItemStatus(
            req.user!.userId,
            careerId,
            roadmapItemId,
            bodyValidation.data.status
        )
        res.status(200).json(result)
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Update roadmap item status error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── PATCH /me/roadmaps/:careerId/items/:roadmapItemId/tasks/:taskId ────────
// Marks a task as completed or not completed. Recalculates item progress.
// If all tasks are completed, auto-completes the item. Does not award points yet.
router.patch("/me/roadmaps/:careerId/items/:roadmapItemId/tasks/:taskId", ...verifiedStudentGuard, async (req, res) => {
    try {
        const paramValidation = validateRequest(roadmapTaskParamSchema, req.params)
        if (!paramValidation.success) {
            res.status(400).json({ error: "Validation failed", details: paramValidation.errors })
            return
        }

        const bodyValidation = validateRequest(updateTaskCompletionSchema, req.body)
        if (!bodyValidation.success) {
            res.status(400).json({ error: "Validation failed", details: bodyValidation.errors })
            return
        }

        const { careerId, roadmapItemId, taskId } = paramValidation.data
        const result = await updateTaskCompletion(
            req.user!.userId,
            careerId,
            roadmapItemId,
            taskId,
            bodyValidation.data.isCompleted
        )
        res.status(200).json(result)
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Update task completion error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── GET /me/roadmaps/:careerId/progress ────────────────────────────────────
// Returns progress analytics for the selected roadmap including overall %,
// completed items/tasks, points earned, and current phase.
router.get("/me/roadmaps/:careerId/progress", ...verifiedStudentGuard, async (req, res) => {
    try {
        const paramValidation = validateRequest(roadmapCareerIdParamSchema, req.params)
        if (!paramValidation.success) {
            res.status(400).json({ error: "Validation failed", details: paramValidation.errors })
            return
        }

        const result = await getRoadmapProgress(req.user!.userId, paramValidation.data.careerId)
        res.status(200).json(result)
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message })
        } else {
            console.error("Get roadmap progress error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})


// ─── GET /me/opportunities ───────────────────────────────────────────────────
// Returns all published+approved opportunities with the student's current
// interaction status (INTERESTED / PARTICIPATED / FEEDBACK_SUBMITTED / null).
router.get("/me/opportunities", ...verifiedStudentGuard, async (req, res) => {
    try {
        const opportunities = await getStudentOpportunities(req.user!.userId)
        res.status(200).json({ opportunities })
    } catch (error: any) {
        console.error("Get opportunities error:", error)
        res.status(500).json({ error: "Internal server error" })
    }
})

// ─── POST /me/opportunities/:opportunityId/interest ──────────────────────────
// Toggles INTERESTED status on an opportunity. Creates the interaction if
// none exists, removes it if the student is currently INTERESTED.
router.post("/me/opportunities/:opportunityId/interest", ...verifiedStudentGuard, async (req, res) => {
    try {
        const opportunityId = req.params.opportunityId as string
        if (!opportunityId) {
            res.status(400).json({ error: "opportunityId is required" })
            return
        }
        const result = await toggleOpportunityInterest(req.user!.userId, opportunityId)
        res.status(200).json(result)
    } catch (error: any) {
        if (error.message?.includes("Cannot remove interest after participating")) {
            res.status(409).json({ error: error.message })
        } else {
            console.error("Toggle interest error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── POST /me/opportunities/:opportunityId/participation ─────────────────────
// Marks the student as having participated in an opportunity. This is the
// "mark as completed" action from the student side.
router.post("/me/opportunities/:opportunityId/participation", ...verifiedStudentGuard, async (req, res) => {
    try {
        const opportunityId = req.params.opportunityId as string
        if (!opportunityId) {
            res.status(400).json({ error: "opportunityId is required" })
            return
        }
        const result = await markOpportunityParticipation(req.user!.userId, opportunityId)
        res.status(200).json(result)
    } catch (error: any) {
        console.error("Mark participation error:", error)
        res.status(500).json({ error: "Internal server error" })
    }
})

// ─── POST /me/opportunities/:opportunityId/feedback ──────────────────────────
// Submits (or updates) feedback for a completed opportunity. Advances
// interaction status to FEEDBACK_SUBMITTED.
// Body: { ratingOverall: number (1–5), comment?: string, isAnonymous?: boolean }
router.post("/me/opportunities/:opportunityId/feedback", ...verifiedStudentGuard, async (req, res) => {
    try {
        const opportunityId = req.params.opportunityId as string
        const { ratingOverall, comment, isAnonymous } = req.body

        if (!opportunityId) {
            res.status(400).json({ error: "opportunityId is required" })
            return
        }
        if (typeof ratingOverall !== "number" || ratingOverall < 1 || ratingOverall > 5) {
            res.status(400).json({ error: "ratingOverall must be a number between 1 and 5" })
            return
        }

        const result = await submitOpportunityFeedback(req.user!.userId, opportunityId, {
            ratingOverall,
            comment,
            isAnonymous
        })
        res.status(200).json(result)
    } catch (error: any) {
        if (error.message?.includes("Opportunity not found")) {
            res.status(404).json({ error: error.message })
        } else {
            console.error("Submit feedback error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── GET /me/providers/:providerId ──────────────────────────────────────────
// Returns public profile for a provider: org name, type, verification status,
// rating summary (from OpportunityFeedback), and up to 5 recent opportunities.
// Returns 403 if the provider account is suspended.
router.get("/me/providers/:providerId", ...verifiedStudentGuard, async (req, res) => {
    try {
        const providerId = req.params.providerId as string
        const result = await StudentProviderService.getProviderProfile(providerId)
        res.status(200).json(result)
    } catch (error: any) {
        if (error.message?.includes("Provider not found") || error.message?.includes("Student profile not found")) {
            res.status(404).json({ error: error.message })
        } else if (error.message?.includes("Provider account is suspended")) {
            res.status(403).json({ error: error.message })
        } else {
            console.error("Get provider profile error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

// ─── POST /me/providers/:providerId/report ───────────────────────────────────
// Submits a report against a provider. Optional opportunityId scopes the report
// to a specific opportunity. Duplicate PENDING reports for the same reason are
// rejected with 409.
// Body: { reason: ReportReason, description: string, opportunityId?: string }
router.post("/me/providers/:providerId/report", ...verifiedStudentGuard, async (req, res) => {
    try {
        const validation = validateRequest(reportProviderSchema, req.body)
        if (!validation.success) {
            res.status(400).json({ error: "Validation failed", details: validation.errors })
            return
        }

        const result = await StudentProviderService.reportProvider(
            req.user!.userId,
            req.params.providerId as string,
            validation.data
        )
        res.status(201).json({ message: "Report submitted successfully", report: result })
    } catch (error: any) {
        const isNotFound = [
            "Provider not found",
            "Student profile not found",
            "Opportunity not found"
        ].some(msg => error.message?.includes(msg))

        const isBadRequest = error.message?.includes("Opportunity does not belong to this provider")
        const isConflict = error.message?.includes("A pending report with this reason already exists")

        if (isNotFound) {
            res.status(404).json({ error: error.message })
        } else if (isBadRequest) {
            res.status(400).json({ error: error.message })
        } else if (isConflict) {
            res.status(409).json({ error: error.message })
        } else {
            console.error("Report provider error:", error)
            res.status(500).json({ error: "Internal server error" })
        }
    }
})

export { router }
