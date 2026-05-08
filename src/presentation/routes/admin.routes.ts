// All admin routes. Every route requires a valid JWT (authenticate) and an ADMIN
// role (requireRole). Admins are never created via the public register endpoint —
// they are seeded directly into the database. No logic lives here.

import { Router } from "express";
import { z } from "zod";
import { authenticate, requireRole } from "../middleware/auth.middleware";
import { CompanyVerificationStatus, Role } from "../../generated/prisma/enums";
import { getPendingVerifications, verifyProvider, getReports, warnProvider, suspendProvider } from "../../application/admin.service";

const router = Router()

// shorthand so we don't repeat authenticate + requireRole on every route
const guard = [authenticate, requireRole(Role.ADMIN)]

// --- Provider Verification ---

// UR-AD-001: view commercial/national registration numbers submitted by providers for manual review
router.get("/verifications", ...guard, async (_req, res) => {
    try {
        const verifications = await getPendingVerifications()
        res.status(200).json(verifications)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// approve or reject a provider's registration number
const verifySchema = z.object({
    status: z.enum([CompanyVerificationStatus.VERIFIED, CompanyVerificationStatus.REJECTED])
})

router.post("/providers/:id/verify", ...guard, async (req, res) => {
    try {
        const id = req.params.id as string
        const parsed = verifySchema.safeParse(req.body)
        if (!parsed.success) {
            res.status(400).json({ error: parsed.error.issues })
            return
        }
        const result = await verifyProvider(id, parsed.data.status)
        res.status(200).json(result)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// --- Reports ---

// UR-AD-002: view all student reports submitted against providers
router.get("/reports", ...guard, async (_req, res) => {
    try {
        const reports = await getReports()
        res.status(200).json(reports)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// --- Provider Account Actions ---

// UR-AD-003: issue a warning to a provider account
router.post("/providers/:id/warn", ...guard, async (req, res) => {
    try {
        const id = req.params.id as string
        const result = await warnProvider(id)
        res.status(200).json(result)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-AD-003: suspend a provider account
router.post("/providers/:id/suspend", ...guard, async (req, res) => {
    try {
        const id = req.params.id as string
        const result = await suspendProvider(id)
        res.status(200).json(result)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

export { router }
