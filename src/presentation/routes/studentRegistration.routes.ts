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
// GET    /me/selected-careers             — get selected career paths (requires verified email)
// DELETE /me/selected-careers/:careerId   — remove one selected career (requires verified email)
// GET    /me/roadmaps                     — full roadmap details for selected careers (requires verified email)
// GET    /me/roadmaps/:careerId           — single roadmap with real progress (requires verified email)
// GET    /me/roadmaps/:careerId/items/:roadmapItemId — roadmap item detail (requires verified email)
// PATCH  /me/roadmaps/:careerId/items/:roadmapItemId/status — update item status (requires verified email)
// PATCH  /me/roadmaps/:careerId/items/:roadmapItemId/tasks/:taskId — toggle task completion (requires verified email)
// GET    /me/roadmaps/:careerId/progress  — roadmap progress analytics (requires verified email)

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
import {
    selectCareersSchema,
    careerIdParamSchema
} from "../../application/careerSelection.validation"
import {
    getLatestCareerRecommendations,
    selectCareers,
    getSelectedCareers,
    removeSelectedCareer,
    getSelectedRoadmaps
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
import { GamificationService } from "../../application/gamification.service"
import { BadgeService } from "../../application/badge.service"

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

// ─── GET /me/gamification ───────────────────────────────────────────────────
// Retrieves the student's XP, level, verified hours, and recent XP events.
router.get("/me/gamification", ...verifiedStudentGuard, async (req, res) => {
    try {
        const gamification = await GamificationService.getStudentGamification(req.user!.userId)
        res.status(200).json({
            success: true,
            data: gamification
        })
    } catch (error: any) {
        console.error("Get gamification profile error:", error)
        res.status(500).json({ success: false, message: "Internal server error" })
    }
})

// ─── GET /me/badges ─────────────────────────────────────────────────────────
// Retrieves the student's earned and locked badges.
router.get("/me/badges", ...verifiedStudentGuard, async (req, res) => {
    try {
        const badges = await BadgeService.getStudentBadges(req.user!.userId)
        res.status(200).json({
            success: true,
            data: badges
        })
    } catch (error: any) {
        console.error("Get badges error:", error)
        res.status(500).json({ success: false, message: "Internal server error" })
    }
})

export { router }
