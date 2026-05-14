// Career Selection Service: business logic for selecting, retrieving, and
// managing a student's chosen career paths from their assessment results.
// Handles validation against assessment recommendations, CRUD operations
// on StudentSelectedCareer records, and roadmap data retrieval.

import { prisma } from "../infrastructure/prisma"
import { GamificationService } from "./gamification.service"
import { XP_RULES } from "../config/gamification"
import { ServiceError } from "./studentAssessment.service"
import { RoadmapItemStatus } from "../generated/prisma/enums"

// ─── Types ──────────────────────────────────────────────────────────────────

/** Shape of a single career match stored in UserAssessmentResult.careerMatches JSON */
interface StoredCareerMatch {
    careerId: string
    careerName: string
    slug: string
    matchPercentage: number
    reasons: string[]
    roadmapPreview: string[]
}

// ─── 1. getLatestCareerRecommendations ──────────────────────────────────────
// Returns the latest assessment result for the student with enriched career
// data including description and live roadmap preview topics from the DB.
// Returns null if no assessment result exists.
async function getLatestCareerRecommendations(userId: string) {
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

    // Parse the stored career matches JSON
    const storedMatches = result.careerMatches as unknown as StoredCareerMatch[]

    if (!Array.isArray(storedMatches) || storedMatches.length === 0) {
        return {
            resultId: result.id,
            assessmentTitle: result.assessment.title,
            submittedAt: result.createdAt,
            careers: []
        }
    }

    // Fetch full career data with roadmap items for the matched career IDs
    const careerIds = storedMatches.map(m => m.careerId)
    const careers = await prisma.careerPath.findMany({
        where: { id: { in: careerIds } },
        include: {
            roadmapItems: {
                include: { topic: true },
                orderBy: { order: "asc" }
            }
        }
    })

    // Build a lookup map for quick access
    const careerMap = new Map(careers.map(c => [c.id, c]))

    // Enrich each stored match with live DB data
    const enrichedCareers = storedMatches.map(match => {
        const career = careerMap.get(match.careerId)

        return {
            careerId: match.careerId,
            careerName: match.careerName,
            slug: match.slug,
            description: career?.description ?? null,
            matchPercentage: match.matchPercentage,
            reasons: match.reasons,
            roadmapPreview: career
                ? career.roadmapItems.map(item => ({
                    topicId: item.topic.id,
                    topicName: item.topic.name,
                    order: item.order
                }))
                : []
        }
    })

    return {
        resultId: result.id,
        assessmentTitle: result.assessment.title,
        submittedAt: result.createdAt,
        careers: enrichedCareers
    }
}

// ─── 2. selectCareers ───────────────────────────────────────────────────────
// Validates career IDs exist and belong to the student's latest top 5,
// then replaces any existing selections with the new set.
// Returns the saved selections with roadmap summaries.
async function selectCareers(userId: string, careerIds: string[]) {
    // 1. Validate all career IDs exist in the database
    const uniqueIds = Array.from(new Set(careerIds))
    if (uniqueIds.length !== careerIds.length) {
        throw new ServiceError(400, "Duplicate career IDs provided")
    }

    if (uniqueIds.length < 1 || uniqueIds.length > 3) {
        throw new ServiceError(400, "You must select between 1 and 3 career paths")
    }

    const careers = await prisma.careerPath.findMany({
        where: { id: { in: careerIds } },
        select: { id: true }
    })

    const foundIds = new Set(careers.map(c => c.id))
    const missingIds = careerIds.filter(id => !foundIds.has(id))

    if (missingIds.length > 0) {
        throw new ServiceError(
            400,
            `The following career IDs do not exist: ${missingIds.join(", ")}`
        )
    }

    // 2. Validate career IDs are from the student's latest assessment top 5
    const latestResult = await prisma.userAssessmentResult.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { careerMatches: true }
    })

    if (!latestResult) {
        throw new ServiceError(
            400,
            "You must complete the assessment before selecting career paths"
        )
    }

    const storedMatches = latestResult.careerMatches as unknown as StoredCareerMatch[]
    const recommendedIds = new Set(
        Array.isArray(storedMatches) ? storedMatches.map(m => m.careerId) : []
    )

    const notRecommended = careerIds.filter(id => !recommendedIds.has(id))
    if (notRecommended.length > 0) {
        throw new ServiceError(
            400,
            `The following career IDs were not in your latest recommendations: ${notRecommended.join(", ")}. You can only select from your top recommended careers.`
        )
    }

    // 3. Replace existing selections with the new set in a transaction
    await prisma.$transaction(async (tx) => {
        // Delete all existing selections for this user
        await tx.studentSelectedCareer.deleteMany({
            where: { userId }
        })

        // Create new selections
        await tx.studentSelectedCareer.createMany({
            data: careerIds.map(careerPathId => ({
                userId,
                careerPathId
            }))
        })
    })

    // 4. Award XP for selected roadmaps
    for (const careerId of careerIds) {
        await GamificationService.awardXp(
            userId,
            "ROADMAP_SELECTED",
            careerId, // Use careerId directly to prevent duplicate XP if they re-select the same career later
            XP_RULES.ROADMAP_SELECTED,
            "Selected a career roadmap"
        )
    }

    // 5. Return the saved selections with roadmap summaries
    return getSelectedCareers(userId)
}

// ─── 3. getSelectedCareers ──────────────────────────────────────────────────
// Returns the student's selected career paths with career details,
// roadmap item counts, and real progress from UserRoadmapItemProgress.
async function getSelectedCareers(userId: string) {
    const selections = await prisma.studentSelectedCareer.findMany({
        where: { userId },
        orderBy: { selectedAt: "asc" },
        include: {
            careerPath: {
                include: {
                    roadmapItems: {
                        select: { id: true }
                    }
                }
            }
        }
    })

    // Build progress data for each selected career
    const selectedCareers = await Promise.all(
        selections.map(async (sel) => {
            const totalItems = sel.careerPath.roadmapItems.length

            // Count completed items for this career/user
            const completedItems = await prisma.userRoadmapItemProgress.count({
                where: {
                    userId,
                    roadmapItemId: {
                        in: sel.careerPath.roadmapItems.map(i => i.id)
                    },
                    status: RoadmapItemStatus.COMPLETED
                }
            })

            const progressPercentage = totalItems > 0
                ? Math.round((completedItems / totalItems) * 100)
                : 0

            return {
                careerId: sel.careerPath.id,
                careerName: sel.careerPath.name,
                slug: sel.careerPath.slug,
                description: sel.careerPath.description,
                selectedAt: sel.selectedAt,
                roadmapItemCount: totalItems,
                progress: {
                    completedItems,
                    totalItems,
                    progressPercentage
                }
            }
        })
    )

    return { selectedCareers }
}

// ─── 4. removeSelectedCareer ────────────────────────────────────────────────
// Deletes one selected career path for the student.
// Returns the remaining selected careers.
// NOTE: After deletion, a student may temporarily have 0 selected careers.
//       This is acceptable — the student can re-select via POST.
async function removeSelectedCareer(userId: string, careerPathId: string) {
    // Verify the selection exists
    const existing = await prisma.studentSelectedCareer.findUnique({
        where: {
            userId_careerPathId: {
                userId,
                careerPathId
            }
        }
    })

    if (!existing) {
        throw new ServiceError(
            404,
            "Selected career not found. You have not selected this career path."
        )
    }

    // Delete the selection
    await prisma.studentSelectedCareer.delete({
        where: { id: existing.id }
    })

    // Return remaining selections
    return getSelectedCareers(userId)
}

// ─── 5. getSelectedRoadmaps ────────────────────────────────────────────────
// Returns full roadmap details for all selected careers, including ordered
// CareerRoadmapItem → RoadmapTopic data and real progress from DB.
async function getSelectedRoadmaps(userId: string) {
    const selections = await prisma.studentSelectedCareer.findMany({
        where: { userId },
        orderBy: { selectedAt: "asc" },
        include: {
            careerPath: {
                include: {
                    roadmapItems: {
                        include: {
                            topic: true,
                            userProgress: {
                                where: { userId },
                                select: {
                                    status: true,
                                    completedAt: true
                                }
                            }
                        },
                        orderBy: { order: "asc" }
                    }
                }
            }
        }
    })

    const STATUS_DISPLAY: Record<string, string> = {
        NOT_STARTED: "not_started",
        IN_PROGRESS: "in_progress",
        COMPLETED: "completed"
    }

    const roadmaps = selections.map(sel => {
        let completedItems = 0

        const items = sel.careerPath.roadmapItems.map(item => {
            const progress = item.userProgress[0]
            const status = progress ? STATUS_DISPLAY[progress.status] ?? "not_started" : "not_started"

            if (progress?.status === RoadmapItemStatus.COMPLETED) {
                completedItems++
            }

            return {
                roadmapItemId: item.id,
                topicId: item.topic.id,
                topicName: item.topic.name,
                order: item.order,
                status,
                completedAt: progress?.completedAt ?? null
            }
        })

        const totalItems = items.length
        const progressPercentage = totalItems > 0
            ? Math.round((completedItems / totalItems) * 100)
            : 0

        return {
            careerId: sel.careerPath.id,
            careerName: sel.careerPath.name,
            slug: sel.careerPath.slug,
            description: sel.careerPath.description,
            selectedAt: sel.selectedAt,
            progress: {
                completedItems,
                totalItems,
                progressPercentage
            },
            items
        }
    })

    return { roadmaps }
}

// ─── 6. addCareer ───────────────────────────────────────────────────────────
// Appends one career to the student's selections without touching existing ones.
// Used from the "Explore more roadmaps" section after all current roadmaps are
// completed. Unlike selectCareers, this never deletes existing selections.
async function addCareer(userId: string, careerId: string) {
    // Validate career exists
    const career = await prisma.careerPath.findUnique({
        where: { id: careerId },
        select: { id: true }
    })

    if (!career) {
        throw new ServiceError(404, "Career path not found")
    }

    // Validate career is from the student's latest assessment recommendations
    const latestResult = await prisma.userAssessmentResult.findFirst({
        where: { userId },
        orderBy: { createdAt: "desc" },
        select: { careerMatches: true }
    })

    if (!latestResult) {
        throw new ServiceError(400, "You must complete the assessment before adding career paths")
    }

    const storedMatches = latestResult.careerMatches as unknown as StoredCareerMatch[]
    const recommendedIds = new Set(
        Array.isArray(storedMatches) ? storedMatches.map(m => m.careerId) : []
    )

    if (!recommendedIds.has(careerId)) {
        throw new ServiceError(400, "This career was not in your latest assessment recommendations")
    }

    // Reject if already selected
    const existing = await prisma.studentSelectedCareer.findUnique({
        where: { userId_careerPathId: { userId, careerPathId: careerId } }
    })

    if (existing) {
        throw new ServiceError(409, "You have already selected this career path")
    }

    await prisma.studentSelectedCareer.create({
        data: { userId, careerPathId: careerId }
    })

    await GamificationService.awardXp(
        userId,
        "ROADMAP_SELECTED",
        careerId,
        XP_RULES.ROADMAP_SELECTED,
        "Selected a career roadmap"
    )

    return getSelectedCareers(userId)
}

export {
    getLatestCareerRecommendations,
    selectCareers,
    getSelectedCareers,
    removeSelectedCareer,
    getSelectedRoadmaps,
    addCareer
}
export const CareerSelectionService = {
    getSelectedCareers,
    removeSelectedCareer
}
