// All admin routes. Every route requires a valid JWT (authenticate) and an ADMIN
// role (requireRole). Admins are never created via the public register endpoint —
// they are seeded directly into the database. No logic lives here.

import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware";
import { Role } from "../../generated/prisma/enums";

const router = Router()

// shorthand so we don't repeat authenticate + requireRole on every route
const guard = [authenticate, requireRole(Role.ADMIN)]

// --- Provider Verification ---

// UR-AD-001: view commercial/national registration numbers submitted by providers for manual review
router.get("/verifications", ...guard, async (_req, res) => {
    try {
        res.json({ message: "GET provider verifications" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// --- Reports ---

// UR-AD-002: view all student reports submitted against providers
router.get("/reports", ...guard, async (_req, res) => {
    try {
        res.json({ message: "GET provider reports" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// --- Provider Account Actions ---

// UR-AD-003: issue a warning to a provider account
router.post("/providers/:id/warn", ...guard, async (_req, res) => {
    try {
        res.json({ message: "POST warn provider" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-AD-003: suspend a provider account
router.post("/providers/:id/suspend", ...guard, async (_req, res) => {
    try {
        res.json({ message: "POST suspend provider" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

export { router }
