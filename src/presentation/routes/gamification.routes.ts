import { Router } from "express"
import { authenticate, requireRole, requireEmailVerified } from "../middleware/auth.middleware"
import { Role } from "../../generated/prisma/enums"
import { GamificationService } from "../../application/gamification.service"
import { BadgeService } from "../../application/badge.service"
import { prisma } from "../../infrastructure/prisma"

const router = Router()

const verifiedStudentGuard = [authenticate, requireRole(Role.STUDENT), requireEmailVerified]

// GET /api/students/me/gamification
router.get("/", ...verifiedStudentGuard, async (req, res) => {
    try {
        const userId = req.user!.userId
        const stats = await GamificationService.getStudentGamification(userId)
        const badges = await BadgeService.getStudentBadges(userId)
        
        res.status(200).json({
            success: true,
            data: {
                xp: {
                    totalXp: stats.totalXp,
                    level: stats.level,
                    currentLevelXp: stats.currentLevelXp,
                    nextLevelXp: stats.nextLevelXp
                },
                badges: badges.earnedBadges,
                recentXpEvents: stats.recentXpEvents
            }
        })
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message })
    }
})

// GET /api/students/me/xp/events
router.get("/xp/events", ...verifiedStudentGuard, async (req, res) => {
    try {
        const userId = req.user!.userId
        const events = await prisma.studentXpEvent.findMany({
            where: { userId },
            orderBy: { createdAt: "desc" }
        })
        res.status(200).json({ success: true, data: events })
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message })
    }
})

// GET /api/students/me/badges
router.get("/badges", ...verifiedStudentGuard, async (req, res) => {
    try {
        const userId = req.user!.userId
        const result = await BadgeService.getStudentBadges(userId)
        res.status(200).json({ success: true, data: result })
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message })
    }
})

export { router }
