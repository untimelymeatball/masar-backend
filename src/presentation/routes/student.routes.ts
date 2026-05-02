// All student-facing routes. Every route here requires a valid JWT (authenticate)
// and a STUDENT role (requireRole). No logic lives here — handlers read the request,
// call the relevant service, and send a response.

import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware";
import { Role } from "../../generated/prisma/enums";

const router = Router()

// shorthand so we don't repeat authenticate + requireRole on every route
const guard = [authenticate, requireRole(Role.STUDENT)]

// --- Profile ---

// UR-STU-010: view own profile
router.get("/profile", ...guard, async (_req, res) => {
    try {
        res.json({ message: "GET student profile" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-STU-010: update account info (name, birthdate, email, picture, education details)
router.put("/profile", ...guard, async (_req, res) => {
    try {
        res.json({ message: "PUT student profile" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// --- Assessment ---

// UR-STU-012: initiate assessment from dashboard
router.get("/assessment", ...guard, async (_req, res) => {
    try {
        res.json({ message: "GET assessment questions" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-STU-013: submit completed assessment answers
router.post("/assessment", ...guard, async (_req, res) => {
    try {
        res.json({ message: "POST assessment submission" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// --- Career Paths & Roadmaps ---

// UR-STU-014: view career path options after assessment results
router.get("/career-paths", ...guard, async (_req, res) => {
    try {
        res.json({ message: "GET career paths" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-STU-015: view roadmaps available for a chosen career path
router.get("/roadmaps", ...guard, async (_req, res) => {
    try {
        res.json({ message: "GET roadmaps" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-STU-016: explore a specific roadmap and its nodes
router.get("/roadmaps/:id", ...guard, async (_req, res) => {
    try {
        res.json({ message: "GET roadmap by id" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-STU-018: mark progress on a roadmap node
router.put("/roadmaps/:id/progress", ...guard, async (_req, res) => {
    try {
        res.json({ message: "PUT roadmap progress" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// --- Opportunities ---

// UR-STU-019: view all available opportunities on the postings page
router.get("/opportunities", ...guard, async (_req, res) => {
    try {
        res.json({ message: "GET opportunities" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-STU-020: view detailed info for a specific opportunity
router.get("/opportunities/:id", ...guard, async (_req, res) => {
    try {
        res.json({ message: "GET opportunity by id" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-STU-021: indicate interest in an opportunity
router.post("/opportunities/:id/interest", ...guard, async (_req, res) => {
    try {
        res.json({ message: "POST opportunity interest" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-STU-022: indicate that the student has availed an opportunity
router.post("/opportunities/:id/availed", ...guard, async (_req, res) => {
    try {
        res.json({ message: "POST opportunity availed" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-STU-023/024: submit feedback for an opportunity the student participated in
router.post("/opportunities/:id/feedback", ...guard, async (_req, res) => {
    try {
        res.json({ message: "POST opportunity feedback" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// --- Providers ---

// UR-STU-025: view a provider's public profile from the opportunity listing
router.get("/providers/:id", ...guard, async (_req, res) => {
    try {
        res.json({ message: "GET provider profile" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

// UR-STU-026: report a provider
router.post("/providers/:id/report", ...guard, async (_req, res) => {
    try {
        res.json({ message: "POST provider report" })
    } catch (error: any) {
        res.status(500).json({ error: error.message })
    }
})

export { router }
