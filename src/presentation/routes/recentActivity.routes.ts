import { Router } from "express"
import { z } from "zod"
import { authenticate, requireRole, requireEmailVerified } from "../middleware/auth.middleware"
import { Role } from "../../generated/prisma/enums"
import { StudentActivityService } from "../../application/studentActivity.service"

const router = Router()

const verifiedStudentGuard = [authenticate, requireRole(Role.STUDENT), requireEmailVerified]

const querySchema = z.object({
    limit: z.string().optional().transform(v => v ? parseInt(v) : undefined).pipe(z.number().min(1).max(50).optional()),
    type: z.string().optional()
})

// GET /api/students/me/recent-activity
router.get("/", ...verifiedStudentGuard, async (req, res) => {
    try {
        const userId = req.user!.userId
        
        // Validate query params
        const validation = querySchema.safeParse(req.query)
        if (!validation.success) {
            return res.status(400).json({ 
                success: false, 
                message: "Invalid query parameters", 
                errors: validation.error.format() 
            })
        }

        const activity = await StudentActivityService.getStudentRecentActivity(userId, {
            limit: validation.data.limit ?? undefined,
            type: validation.data.type ?? undefined
        })
        res.status(200).json({ success: true, data: activity })
    } catch (error: any) {
        console.error("Recent activity error:", error)
        res.status(500).json({ success: false, message: error.message || "Internal server error" })
    }
})

export { router }
