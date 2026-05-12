import { prisma } from "../infrastructure/prisma"
import { GamificationService } from "./gamification.service"
import { BadgeService } from "./badge.service"
import { PracticalHoursService } from "./practicalHours.service"
import { CareerSelectionService } from "./careerSelection.service"
import { RoadmapProgressService } from "./roadmapProgress.service"
import { StudentAssessmentService } from "./studentAssessment.service"
import { StudentOpportunityService } from "./studentOpportunity.service"

import { StudentActivityService } from "./studentActivity.service"

async function getStudentDashboard(userId: string) {
    const [
        user,
        gamification,
        badges,
        practicalHoursSummary,
        practicalHoursHistory,
        selectedCareers,
        latestAssessment,
        pendingActions
    ] = await Promise.all([
        prisma.user.findUnique({
            where: { id: userId },
            include: {
                studentProfile: { include: { skills: true } },
                opportunityInteractions: {
                    include: { opportunity: { include: { provider: true } } },
                    orderBy: { interestedAt: "desc" },
                    take: 5
                }
            }
        }),
        GamificationService.getStudentGamification(userId),
        BadgeService.getStudentBadges(userId),
        PracticalHoursService.getPracticalHoursSummary(userId),
        PracticalHoursService.getPracticalHoursHistory(userId),
        CareerSelectionService.getSelectedCareers(userId),
        StudentAssessmentService.getLatestAssessmentResult(userId),
        StudentOpportunityService.getPendingActions(userId)
    ])

    if (!user) throw new Error("User not found")

    const profile = user.studentProfile
    const interactions = user.opportunityInteractions

    // Calculate profile completion percentage
    let completionCount = 0
    const fields = [
        profile?.firstName, profile?.lastName, profile?.phone, 
        profile?.province, profile?.birthdate, profile?.major, 
        profile?.educationLevel, profile?.graduationYear
    ]
    fields.forEach(f => { if (f) completionCount++ })
    const profileCompletionPercent = Math.round((completionCount / fields.length) * 100)

    // Composition: Roadmap Progress (Active Roadmap)
    // We consider the most recently selected roadmap as "active" for the dashboard summary
    const firstSelected = selectedCareers.selectedCareers[0]
    let activeRoadmap = null
    if (firstSelected) {
        activeRoadmap = await RoadmapProgressService.getRoadmapProgress(userId, firstSelected.careerId)
    }

    // Composition: Recent Activity
    const recentActivity = await StudentActivityService.getStudentRecentActivity(userId, { limit: 10 })

    return {
        profile: {
            studentId: profile?.studentId || "",
            fullName: profile ? `${profile.firstName} ${profile.lastName}` : "",
            username: user.username,
            email: user.email,
            profilePicture: profile?.profilePicture || null,
            major: profile?.major || "",
            educationLevel: profile?.educationLevel || "",
            expectedGraduationYear: profile?.graduationYear || 0,
            city: profile?.province || "",
            profileCompletionPercent,
            isEmailVerified: user.isEmailVerified
        },
        assessment: {
            hasCompletedAssessment: !!latestAssessment,
            completedAt: latestAssessment?.submittedAt || null,
            latestAssessmentId: latestAssessment?.assessmentId || null,
            topTraitScores: latestAssessment?.profile || null,
            needsAssessment: !latestAssessment
        },
        careerRecommendations: latestAssessment?.topCareers || [],
        roadmaps: {
            selected: selectedCareers.selectedCareers,
            active: activeRoadmap
        },
        skills: {
            top: profile?.skills.slice(0, 5) || [],
            recent: profile?.skills.slice(-5).reverse() || []
        },
        gamification: {
            xp: {
                totalXp: gamification.totalXp,
                level: gamification.level,
                currentLevelXp: gamification.currentLevelXp,
                nextLevelXp: gamification.nextLevelXp
            },
            badges: {
                earnedCount: badges.earnedBadges.length,
                recent: badges.earnedBadges.slice(0, 5)
            }
        },
        practicalHours: {
            ...practicalHoursSummary,
            recentHourEvents: practicalHoursHistory.events.slice(0, 5)
        },
        opportunities: {
            interested: interactions.map((i: any) => ({
                id: i.opportunity.id,
                title: i.opportunity.title,
                provider: i.opportunity.provider.organizationName,
                endDate: i.opportunity.endDate || i.opportunity.deadline,
                status: i.status,
                interestedAt: i.interestedAt
            })),
            pendingParticipationConfirmations: pendingActions.filter((a: any) => a.action === "CONFIRM_PARTICIPATION"),
            pendingFeedbackPrompts: pendingActions.filter((a: any) => a.action === "SUBMIT_FEEDBACK")
        },
        recentActivity
    }
}

export const StudentDashboardService = {
    getStudentDashboard
}
