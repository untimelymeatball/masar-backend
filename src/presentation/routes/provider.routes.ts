// All provider-facing routes (covers university, company, and training center providers).
// Every route requires a valid JWT (authenticate) and a PROVIDER role (requireRole).
// No logic lives here — handlers read the request, call the relevant service, and send a response.

import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware";
import { Role } from "../../generated/prisma/enums";
import { z } from "zod";
import { createOpportunity, deleteOpportunity, getOpportunities, getProfile, updateOpportunity, updateProfile } from "../../application/provider.service";
import { ProviderAnalyticsService } from "../../application/providerAnalytics.service";
import { opportunityIdParamSchema } from "../../application/providerAnalytics.validation";
import { validateRequest } from "../../application/dashboard.validation";

// zod schema, it is responsible for validation
const updateProfileSchema = z.object({
    providerType: z.enum(["UNIVERSITY", "COMPANY", "TRAINING_CENTER"]),
    organizationName: z.string().min(1),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    phone: z.string().min(1),
    email: z.string().email(),
    description: z.string().min(1),
    location: z.string().optional(),
    website: z.string().url().optional(),
    profilePicture: z.string().optional(),
    registrationNumber: z.string().optional(),
})

// schema to validate opportunity creation requests
const createOpportunitySchema = z.object({
    title: z.string().min(1),
    description: z.string().min(1),
    type: z.enum(["INTERNSHIP", "WORKSHOP", "VOLUNTEERING", "COURSE"]),
    workMode: z.enum(["ONLINE", "ONSITE", "HYBRID"]),
    expectedHours: z.number().int().positive(),
    externalLink: z.string().url().optional(),
    location: z.string().optional(),
    deadline: z.coerce.date().optional(),
    capacity: z.number().int().positive().optional(),
})

// schema to validate opportunity update requests
const updateOpportunitySchema = z.object({
    title: z.string().min(1).optional(),
    description: z.string().min(1).optional(),
    type: z.enum(["INTERNSHIP", "WORKSHOP", "VOLUNTEERING", "COURSE"]).optional(),
    workMode: z.enum(["ONLINE", "ONSITE", "HYBRID"]).optional(),
    expectedHours: z.number().int().positive().optional(),
    externalLink: z.string().url().optional(),
    location: z.string().optional(),
    deadline: z.coerce.date().optional(),
    capacity: z.number().int().positive().optional(),
})

const router = Router()

// shorthand so we don't repeat authenticate + requireRole on every route
const guard = [authenticate, requireRole(Role.PROVIDER)]

// --- Profile ---

// UR-UNI-010 / UR-CO-010: view own provider profile
router.get("/profile", ...guard, async (req, res) => {
    try {
        const { userId } = req.user!
        const profile = await getProfile(userId)
        if (!profile)
            return res.status(404).json({ error: "Profile not found" })
        res.status(200).json(profile)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-UNI-010 / UR-CO-010: update profile (picture, title, department, name, email)
router.put("/profile", ...guard, async (req, res) => {
    try {
        const { userId } = req.user!
        const data = updateProfileSchema.parse(req.body)
        const profile = await updateProfile(userId, data)
        res.status(200).json(profile)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// --- Opportunities (Post Management) ---

// UR-UNI-012 / UR-CO-012: view own post history
router.get("/opportunities", ...guard, async (req, res) => {
    try {
        const { userId } = req.user!
        const opportunities = await getOpportunities(userId)
        return res.status(200).json(opportunities)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-UNI-016 / UR-CO-016: create a new opportunity post
router.post("/opportunities", ...guard, async (req, res) => {
    try {
        const { userId } = req.user!
        const data = createOpportunitySchema.parse(req.body)
        const opportunity = await createOpportunity(userId, data)
        res.status(201).json(opportunity)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-UNI-013 / UR-CO-013: edit an existing opportunity post
router.put("/opportunities/:id", ...guard, async (req, res) => {
    try {
        const { userId } = req.user!
        const data = updateOpportunitySchema.parse(req.body)
        const opportunity = await updateOpportunity(userId, req.params.id as string, data)
        res.status(200).json(opportunity)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-UNI-014 / UR-CO-014: delete an opportunity post
router.delete("/opportunities/:id", ...guard, async (req, res) => {
    try {
        const { userId } = req.user!
        const opportunity = await deleteOpportunity(userId, req.params.id as string)
        res.status(200).json(opportunity)
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
