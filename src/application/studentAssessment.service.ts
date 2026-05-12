// Student Assessment Service: business logic for the authenticated student
// assessment flow. Orchestrates fetching, starting, submitting assessments,
// and retrieving results — all scoped to the authenticated student.
// Delegates scoring/matching to assessment.service.ts.

import { prisma } from "../infrastructure/prisma"
import { submitAssessment } from "./assessment.service"
import { GamificationService } from "./gamification.service"
import { XP_RULES } from "../config/gamification"
import type { AssessmentSubmissionInput } from "./assessment.validation"

// ─── Types ──────────────────────────────────────────────────────────────────

/** Custom error with an HTTP status code */
class ServiceError extends Error {
    constructor(public statusCode: number, message: string) {
        super(message)
        this.name = "ServiceError"
    }
}

// ─── 1. getActiveAssessment ─────────────────────────────────────────────────
// Returns the currently active assessment with question count and whether
// the authenticated student has already submitted a result for it.
async function getActiveAssessment(userId: string) {
    const assessment = await prisma.assessment.findFirst({
        where: { isActive: true },
        include: {
            _count: {
                select: { questions: true }
            }
        }
    })

    if (!assessment) {
        throw new ServiceError(404, "No active assessment found")
    }

    // Check if the student has already submitted
    const existingResult = await prisma.userAssessmentResult.findUnique({
        where: {
            userId_assessmentId: {
                userId,
                assessmentId: assessment.id
            }
        },
        select: { id: true, createdAt: true }
    })

    return {
        id: assessment.id,
        title: assessment.title,
        description: assessment.description,
        questionCount: assessment._count.questions,
        hasSubmitted: existingResult !== null,
        submittedAt: existingResult?.createdAt ?? null
    }
}

// ─── 2. startAssessment ─────────────────────────────────────────────────────
// Returns assessment questions + options (ordered) and the student's
// enrichment data for prefill. Blocks access if already submitted.
async function startAssessment(assessmentId: string, userId: string) {
    // Verify assessment exists
    const assessment = await prisma.assessment.findUnique({
        where: { id: assessmentId },
        include: {
            questions: {
                orderBy: { order: "asc" },
                include: {
                    options: {
                        orderBy: { order: "asc" },
                        select: {
                            id: true,
                            option: true,
                            order: true
                            // weights deliberately excluded
                        }
                    }
                }
            }
        }
    })

    if (!assessment) {
        throw new ServiceError(404, "Assessment not found")
    }

    // Check if student already submitted
    const existingResult = await prisma.userAssessmentResult.findUnique({
        where: {
            userId_assessmentId: {
                userId,
                assessmentId
            }
        },
        select: { id: true }
    })

    if (existingResult) {
        throw new ServiceError(409, "You have already submitted this assessment. Each assessment can only be taken once.")
    }

    // Fetch student profile enrichment data for prefill
    const profile = await prisma.studentProfile.findUnique({
        where: { userId },
        include: {
            skills: {
                select: { id: true, name: true }
            }
        }
    })

    if (!profile) {
        throw new ServiceError(404, "Student profile not found")
    }

    return {
        assessment: {
            id: assessment.id,
            title: assessment.title,
            description: assessment.description,
            questions: assessment.questions.map(q => ({
                id: q.id,
                question: q.question,
                order: q.order,
                options: q.options
            }))
        },
        prefill: {
            skills: profile.skills.map(s => s.name),
            hobbies: profile.hobbies,
            talents: profile.talents,
            interests: profile.interests,
            preferences: profile.preferences
        }
    }
}

// ─── 3. submitStudentAssessment ─────────────────────────────────────────────
// Validates, computes scores, matches careers, saves result, and merges
// new enrichment data into the student profile. Blocks duplicate submissions.
async function submitStudentAssessment(
    assessmentId: string,
    userId: string,
    body: AssessmentSubmissionInput
) {
    // Check for existing submission (single attempt enforcement)
    const existingResult = await prisma.userAssessmentResult.findUnique({
        where: {
            userId_assessmentId: {
                userId,
                assessmentId
            }
        },
        select: { id: true }
    })

    if (existingResult) {
        throw new ServiceError(
            409,
            "You have already submitted this assessment. Each assessment can only be taken once."
        )
    }

    // Verify assessment exists and get question count for completeness check
    const assessment = await prisma.assessment.findUnique({
        where: { id: assessmentId },
        include: {
            questions: {
                select: { id: true }
            }
        }
    })

    if (!assessment) {
        throw new ServiceError(404, "Assessment not found")
    }

    // Validate that all required questions are answered
    const assessmentQuestionIds = new Set(assessment.questions.map(q => q.id))
    const answeredQuestionIds = new Set(body.answers.map(a => a.questionId))

    // Check all assessment questions are covered
    for (const qId of assessmentQuestionIds) {
        if (!answeredQuestionIds.has(qId)) {
            throw new ServiceError(
                400,
                `Missing answer for question "${qId}". All questions must be answered.`
            )
        }
    }

    // Delegate to the existing assessment service (scoring + matching + persist)
    const result = await submitAssessment(assessmentId, userId, body.answers)

    // Merge new enrichment data into the student profile
    await mergeEnrichmentData(userId, body)

    // Update the StudentAssessment record to mark as COMPLETED
    await upsertStudentAssessment(userId)

    // Gamification Hook: Assessment Completed
    if (result && result.resultId) {
        await GamificationService.awardXp(
            userId,
            "ASSESSMENT_COMPLETED",
            result.resultId,
            XP_RULES.ASSESSMENT_COMPLETED,
            "Completed the career matching assessment"
        )
    }

    return result
}

// ─── 4. getAssessmentResults ────────────────────────────────────────────────
// Returns all assessment results for the student, newest first.
// Strips rawScores (internal scoring data).
async function getAssessmentResults(userId: string) {
    const results = await prisma.userAssessmentResult.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: {
            assessment: {
                select: { id: true, title: true }
            }
        }
    })

    return results.map(r => ({
        resultId: r.id,
        assessmentId: r.assessmentId,
        assessmentTitle: r.assessment.title,
        profile: r.normalizedScores,
        topCareers: r.careerMatches,
        submittedAt: r.createdAt
    }))
}

// ─── 5. getLatestAssessmentResult ───────────────────────────────────────────
// Returns the most recent assessment result, or null if none exists.
async function getLatestAssessmentResult(userId: string) {
    const result = await prisma.userAssessmentResult.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        include: {
            assessment: {
                select: { id: true, title: true }
            }
        }
    })

    if (!result) {
        return null
    }

    return {
        resultId: result.id,
        assessmentId: result.assessmentId,
        assessmentTitle: result.assessment.title,
        profile: result.normalizedScores,
        topCareers: result.careerMatches,
        submittedAt: result.createdAt
    }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

// Merges skills, hobbies, and talents from the assessment submission into
// the student profile, avoiding duplicates.
async function mergeEnrichmentData(userId: string, body: AssessmentSubmissionInput) {
    const profile = await prisma.studentProfile.findUnique({
        where: { userId },
        include: { skills: true }
    })

    if (!profile) return

    // ── Skills (many-to-many via Skill model) ────────────────────────────
    if (body.skills && body.skills.length > 0) {
        const existingSkillNames = new Set(
            profile.skills.map(s => s.name.toLowerCase())
        )

        const newSkills = body.skills.filter(
            s => !existingSkillNames.has(s.toLowerCase())
        )

        for (const skillName of newSkills) {
            // Upsert the Skill record (shared across students)
            const skill = await prisma.skill.upsert({
                where: { name: skillName },
                create: { name: skillName },
                update: {}
            })

            // Connect it to the student profile
            await prisma.studentProfile.update({
                where: { userId },
                data: {
                    skills: { connect: { id: skill.id } }
                }
            })
        }
    }

    // ── Hobbies (string array on profile) ────────────────────────────────
    if (body.hobbies && body.hobbies.length > 0) {
        const existingHobbies = new Set(
            profile.hobbies.map(h => h.toLowerCase())
        )
        const newHobbies = body.hobbies.filter(
            h => !existingHobbies.has(h.toLowerCase())
        )

        if (newHobbies.length > 0) {
            await prisma.studentProfile.update({
                where: { userId },
                data: {
                    hobbies: [...profile.hobbies, ...newHobbies]
                }
            })
        }
    }

    // ── Talents (string array on profile) ────────────────────────────────
    if (body.talents && body.talents.length > 0) {
        const existingTalents = new Set(
            profile.talents.map(t => t.toLowerCase())
        )
        const newTalents = body.talents.filter(
            t => !existingTalents.has(t.toLowerCase())
        )

        if (newTalents.length > 0) {
            await prisma.studentProfile.update({
                where: { userId },
                data: {
                    talents: [...profile.talents, ...newTalents]
                }
            })
        }
    }
    // ── Gamification Hook: Profile Completeness ─────────────────────────
    await GamificationService.checkProfileCompleteness(userId)
}

// Upserts the StudentAssessment record to mark the student's assessment
// as COMPLETED. If no record exists, creates one.
async function upsertStudentAssessment(userId: string) {
    const profile = await prisma.studentProfile.findUnique({
        where: { userId },
        select: { id: true }
    })

    if (!profile) return

    await prisma.studentAssessment.upsert({
        where: { studentId: profile.id },
        create: {
            studentId: profile.id,
            status: "COMPLETED"
        },
        update: {
            status: "COMPLETED"
        }
    })
}

export const StudentAssessmentService = {
    getActiveAssessment,
    startAssessment,
    submitStudentAssessment,
    getAssessmentResults,
    getLatestAssessmentResult
}

export {
    getActiveAssessment,
    startAssessment,
    submitStudentAssessment,
    getAssessmentResults,
    getLatestAssessmentResult,
    ServiceError
}
