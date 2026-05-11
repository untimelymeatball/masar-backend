// Assessment routes — authenticated student endpoints for the assessment flow.
//
// GET  /active              — fetch the currently active assessment
// GET  /:assessmentId/start — get questions, options, and student prefill data
// POST /:assessmentId/submit — submit answers and receive career matches
//
// All routes require: authenticated + STUDENT role + email verified.

import { Router } from "express";
import { authenticate, requireRole, requireEmailVerified } from "../middleware/auth.middleware";
import { Role } from "../../generated/prisma/enums";
import { validateRequest } from "../../application/dashboard.validation";
import {
    assessmentIdParamSchema,
    assessmentSubmissionSchema
} from "../../application/assessment.validation";
import {
    getActiveAssessment,
    startAssessment,
    submitStudentAssessment,
    ServiceError
} from "../../application/studentAssessment.service";

const router = Router();

// Guard: authenticated + student + email verified
const verifiedStudentGuard = [authenticate, requireRole(Role.STUDENT), requireEmailVerified];

// ─── GET /active ────────────────────────────────────────────────────────────
// Returns the currently active/default assessment with metadata and
// whether the authenticated student has already submitted it.
router.get("/active", ...verifiedStudentGuard, async (req, res) => {
    try {
        const result = await getActiveAssessment(req.user!.userId);
        res.status(200).json(result);
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message });
        } else {
            console.error("Get active assessment error:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

// ─── GET /:assessmentId/start ───────────────────────────────────────────────
// Returns assessment questions and options (ordered, without weights)
// plus the student's enrichment data for prefill.
router.get("/:assessmentId/start", ...verifiedStudentGuard, async (req, res) => {
    try {
        // Validate route param
        const paramValidation = validateRequest(assessmentIdParamSchema, req.params);
        if (!paramValidation.success) {
            res.status(400).json({ error: "Validation failed", details: paramValidation.errors });
            return;
        }

        const result = await startAssessment(
            paramValidation.data.assessmentId,
            req.user!.userId
        );
        res.status(200).json(result);
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message });
        } else {
            console.error("Start assessment error:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

// ─── POST /:assessmentId/submit ─────────────────────────────────────────────
// Validates submission, calculates scores, matches careers, persists result,
// and merges enrichment data into the student profile.
router.post("/:assessmentId/submit", ...verifiedStudentGuard, async (req, res) => {
    try {
        // Validate route param
        const paramValidation = validateRequest(assessmentIdParamSchema, req.params);
        if (!paramValidation.success) {
            res.status(400).json({ error: "Validation failed", details: paramValidation.errors });
            return;
        }

        // Validate request body
        const bodyValidation = validateRequest(assessmentSubmissionSchema, req.body);
        if (!bodyValidation.success) {
            res.status(400).json({ error: "Validation failed", details: bodyValidation.errors });
            return;
        }

        const result = await submitStudentAssessment(
            paramValidation.data.assessmentId,
            req.user!.userId,
            bodyValidation.data
        );

        res.status(200).json(result);
    } catch (error: any) {
        if (error instanceof ServiceError) {
            res.status(error.statusCode).json({ error: error.message });
            return;
        }

        // Distinguish validation errors from the assessment.service.ts
        const isValidationError = [
            "Assessment not found",
            "Duplicate question answers",
            "does not belong to",
            "Missing answer for question"
        ].some((msg) => error.message?.includes(msg));

        if (isValidationError) {
            res.status(400).json({ error: error.message });
        } else {
            console.error("Assessment submission error:", error);
            res.status(500).json({ error: "Internal server error" });
        }
    }
});

export { router };
