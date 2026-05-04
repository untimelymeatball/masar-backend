// All academic staff routes. Every route requires a valid JWT (authenticate)
// and an ACADEMIC role (requireRole). No logic lives here — handlers read the
// request, call the relevant service, and send a response.

import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware";
import { Role } from "../../generated/prisma/enums";
import { generateAffiliationCode, getProfile, getStudentAnalytics, getStudents, updateProfile } from "../../application/academic.service";

const router = Router()

// shorthand so we don't repeat authenticate + requireRole on every route
const guard = [authenticate, requireRole(Role.ACADEMIC)]

// --- Profile ---

// UR-AC-007: view own academic profile
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


// UR-AC-007: update profile (picture, title, department, name, email)
router.put("/profile", ...guard, async (req, res) => {
    try {
        const { userId } = req.user!
        const data = req.body
        const profile = await updateProfile(userId, data)
        res.status(200).json(profile)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// --- Affiliation ---

// UR-AC-008/009: generate a unique affiliation code students use to link to this academic
router.post("/affiliation-code", ...guard, async (req, res) => {
    try {
        const { userId } = req.user!
        const affiliationCode = await generateAffiliationCode(userId)
        res.status(200).json({affiliationCode})
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// --- Students ---

// UR-AC-010: view list of students affiliated with this academic
router.get("/students", ...guard, async (req, res) => {
    try {
        const { userId } = req.user!
        const students = await getStudents(userId)
        res.status(200).json(students)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-AC-011: view analytics and academic info for a specific affiliated student
router.get("/students/:id/analytics", ...guard, async (req, res) => {
    try {
        const { userId } = req.user!
        const studentAnalytics = await getStudentAnalytics(userId, req.params.id as string)
        res.status(200).json(studentAnalytics)
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

export { router }
