import { Router } from "express"
import { authenticate, requireRole, requireEmailVerified } from "../middleware/auth.middleware"
import { Role } from "../../generated/prisma/enums"
import { StudentDashboardService } from "../../application/studentDashboard.service"

const router = Router()

const verifiedStudentGuard = [authenticate, requireRole(Role.STUDENT), requireEmailVerified]

// GET /api/students/me/dashboard
router.get("/", ...verifiedStudentGuard, async (req, res) => {
    try {
        const userId = req.user!.userId
        const dashboard = await StudentDashboardService.getStudentDashboard(userId)
        res.status(200).json({ success: true, data: dashboard })
    } catch (error: any) {
        console.error("Dashboard error:", error)
        res.status(500).json({ success: false, message: error.message || "Internal server error" })
    }
})

export { router }
