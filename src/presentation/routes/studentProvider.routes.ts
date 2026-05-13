import { Router } from "express"
import { authenticate, requireRole, requireEmailVerified } from "../middleware/auth.middleware"
import { Role } from "../../generated/prisma/enums"
import { StudentProviderService } from "../../application/studentProvider.service"
import { reportProviderSchema, providerOpportunitiesQuerySchema } from "../../application/studentProvider.validation"

const router = Router()

const verifiedStudentGuard = [authenticate, requireRole(Role.STUDENT), requireEmailVerified]

// GET /api/students/me/providers/:providerId
router.get("/:providerId", ...verifiedStudentGuard, async (req, res) => {
    try {
        const providerId = req.params.providerId as string
        const profile = await StudentProviderService.getProviderProfile(providerId)
        res.status(200).json({ success: true, data: profile })
    } catch (error: any) {
        res.status(404).json({ success: false, message: error.message })
    }
})

// GET /api/students/me/providers/:providerId/opportunities
router.get("/:providerId/opportunities", ...verifiedStudentGuard, async (req, res) => {
    try {
        const providerId = req.params.providerId as string
        const validation = providerOpportunitiesQuerySchema.safeParse(req.query)
        if (!validation.success) {
            return res.status(400).json({ success: false, errors: validation.error.format() })
        }

        const data = await StudentProviderService.getProviderOpportunities(
            req.user!.userId,
            providerId,
            validation.data
        )
        res.status(200).json({ success: true, data })
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message })
    }
})

// POST /api/students/me/providers/:providerId/report
router.post("/:providerId/report", ...verifiedStudentGuard, async (req, res) => {
    try {
        const providerId = req.params.providerId as string
        const validation = reportProviderSchema.safeParse(req.body)
        if (!validation.success) {
            return res.status(400).json({ success: false, errors: validation.error.format() })
        }

        const report = await StudentProviderService.reportProvider(
            req.user!.userId,
            providerId,
            validation.data
        )
        res.status(201).json({ success: true, message: "Report submitted successfully", data: report })
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message })
    }
})

// GET /api/students/me/provider-reports
// NOTE: This route is actually /api/students/me/provider-reports, 
// so it should probably be mounted separately or handled carefully.
// I'll keep it here and mount this router at /api/students/me/providers 
// but handle the reports route separately in app.ts or similar.
// Wait, the user said GET /students/me/provider-reports.

export const reportsRouter = Router()
reportsRouter.get("/", ...verifiedStudentGuard, async (req, res) => {
    try {
        const reports = await StudentProviderService.getStudentReports(req.user!.userId)
        res.status(200).json({ success: true, data: reports })
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message })
    }
})

export { router as providerRouter }
