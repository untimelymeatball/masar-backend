import { Router } from "express"
import { authenticate, requireRole, requireEmailVerified } from "../middleware/auth.middleware"
import { Role } from "../../generated/prisma/enums"
import * as StudentOpportunityController from "../../application/studentOpportunity.controller"

const router = Router()

// Guard for verified students
const verifiedStudentGuard = [authenticate, requireRole(Role.STUDENT), requireEmailVerified]

// ─── GET /opportunities ──────────────────────────────────────────────────────
router.get("/", ...verifiedStudentGuard, StudentOpportunityController.getOpportunities)

// ─── GET /opportunities/interested ───────────────────────────────────────────
router.get("/interested", ...verifiedStudentGuard, StudentOpportunityController.getInterested)

// ─── GET /opportunities/pending-actions ───────────────────────────────────────
router.get("/pending-actions", ...verifiedStudentGuard, StudentOpportunityController.getPending)

// ─── GET /opportunities/:opportunityId ───────────────────────────────────────
router.get("/:opportunityId", ...verifiedStudentGuard, StudentOpportunityController.getOpportunity)

// ─── POST /opportunities/:opportunityId/interest ─────────────────────────────
router.post("/:opportunityId/interest", ...verifiedStudentGuard, StudentOpportunityController.markInterest)

// ─── POST /opportunities/:opportunityId/participation ────────────────────────
router.post("/:opportunityId/participation", ...verifiedStudentGuard, StudentOpportunityController.confirmParticipation)

// ─── POST /opportunities/:opportunityId/feedback ─────────────────────────────
router.post("/:opportunityId/feedback", ...verifiedStudentGuard, StudentOpportunityController.submitFeedback)

export { router }
