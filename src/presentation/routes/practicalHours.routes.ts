import { Router } from "express"
import { authenticate, requireRole, requireEmailVerified } from "../middleware/auth.middleware"
import { Role } from "../../generated/prisma/enums"
import { PracticalHoursService } from "../../application/practicalHours.service"

const router = Router()

const verifiedStudentGuard = [authenticate, requireRole(Role.STUDENT), requireEmailVerified]

// GET /api/students/me/practical-hours
router.get("/", ...verifiedStudentGuard, async (req, res) => {
    try {
        const result = await PracticalHoursService.getPracticalHoursHistory(req.user!.userId)
        res.status(200).json({ success: true, data: result })
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message })
    }
})

// GET /api/students/me/practical-hours/summary
router.get("/summary", ...verifiedStudentGuard, async (req, res) => {
    try {
        const result = await PracticalHoursService.getPracticalHoursSummary(req.user!.userId)
        res.status(200).json({ success: true, data: result })
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message })
    }
})

export { router }
