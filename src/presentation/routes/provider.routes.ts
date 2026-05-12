// All provider-facing routes (covers university, company, and training center providers).
// Every route requires a valid JWT (authenticate) and a PROVIDER role (requireRole).
// No logic lives here — handlers read the request, call the relevant service, and send a response.

import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware";
import { Role } from "../../generated/prisma/enums";
import { ProviderAnalyticsService } from "../../application/providerAnalytics.service";
import { opportunityIdParamSchema } from "../../application/providerAnalytics.validation";
import { validateRequest } from "../../application/dashboard.validation";

const router = Router()

// shorthand so we don't repeat authenticate + requireRole on every route
const guard = [authenticate, requireRole(Role.PROVIDER)]

// --- Profile ---

// UR-UNI-010 / UR-CO-010: view own provider profile
router.get("/profile", ...guard, async (_req, res) => {
    try {
        res.json({ message: "GET provider profile" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-UNI-010 / UR-CO-010: update profile (picture, title, department, name, email)
router.put("/profile", ...guard, async (_req, res) => {
    try {
        res.json({ message: "PUT provider profile" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// --- Opportunities (Post Management) ---

// UR-UNI-012 / UR-CO-012: view own post history
router.get("/opportunities", ...guard, async (_req, res) => {
    try {
        res.json({ message: "GET provider opportunities" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-UNI-016 / UR-CO-016: create a new opportunity post
router.post("/opportunities", ...guard, async (_req, res) => {
    try {
        res.json({ message: "POST create opportunity" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-UNI-013 / UR-CO-013: edit an existing opportunity post
router.put("/opportunities/:id", ...guard, async (_req, res) => {
    try {
        res.json({ message: "PUT update opportunity" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-UNI-014 / UR-CO-014: delete an opportunity post
router.delete("/opportunities/:id", ...guard, async (_req, res) => {
    try {
        res.json({ message: "DELETE opportunity" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// --- Analytics ---

// GET /providers/me/analytics/summary
router.get("/me/analytics/summary", ...guard, async (req, res) => {
    try {
        const summary = await ProviderAnalyticsService.getProviderAnalyticsSummary(req.user!.userId)
        res.status(200).json({
            success: true,
            data: summary
        })
    } catch (error: any) {
        console.error("Provider analytics summary error:", error)
        const status = error.statusCode || 500
        res.status(status).json({ success: false, message: error.message })
    }
})

// UR-UNI-015 / UR-CO-015: view analytics for a specific post
router.get("/me/opportunities/:opportunityId/analytics", ...guard, async (req, res) => {
    const paramValidation = validateRequest(opportunityIdParamSchema, { params: req.params })
    if (!paramValidation.success) {
        return res.status(400).json({ success: false, errors: paramValidation.errors })
    }

    try {
        const analytics = await ProviderAnalyticsService.getOpportunityAnalytics(req.user!.userId, req.params.opportunityId as string)
        res.status(200).json({
            success: true,
            data: analytics
        })
    } catch (error: any) {
        console.error("Opportunity analytics error:", error)
        const status = error.statusCode || 500
        res.status(status).json({ success: false, message: error.message })
    }
})

// Legacy compat redirect or just removal
router.get("/opportunities/:id/analytics", ...guard, (req, res) => {
    res.redirect(301, `/provider/me/opportunities/${req.params.id}/analytics`)
})

export { router }
