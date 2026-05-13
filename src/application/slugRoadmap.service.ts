import { prisma } from "../infrastructure/prisma"
import { ServiceError } from "./studentAssessment.service"
import { selectCareers, getSelectedRoadmaps } from "./careerSelection.service"
import { updateRoadmapItemStatus } from "./roadmapProgress.service"
import { GamificationService } from "./gamification.service"
import fs from "fs"
import path from "path"

// Cache for careers.json
let careersCache: any = null
function getCareersJson() {
    if (!careersCache) {
        const filePath = path.join(__dirname, "../../prisma/data/careers.json")
        const raw = fs.readFileSync(filePath, "utf-8")
        careersCache = JSON.parse(raw)
    }
    return careersCache
}

/**
 * 1. selectRoadmapsBySlug
 * Wrapper around selectCareers that resolves slugs to IDs.
 */
export async function selectRoadmapsBySlug(userId: string, careerSlugs: string[]) {
    // Validate that all slugs exist in careers.json as an extra check
    const data = getCareersJson()
    const validSlugs = new Set(data.careers.map((c: any) => c.slug))
    const invalidSlugs = careerSlugs.filter(slug => !validSlugs.has(slug))

    if (invalidSlugs.length > 0) {
        throw new ServiceError(400, `Invalid career slugs provided: ${invalidSlugs.join(", ")}`)
    }

    // Resolve slugs to IDs from the database
    const careers = await prisma.careerPath.findMany({
        where: { slug: { in: careerSlugs } },
        select: { id: true, slug: true }
    })

    const foundSlugs = new Set(careers.map(c => c.slug))
    const missingDbSlugs = careerSlugs.filter(s => !foundSlugs.has(s))

    if (missingDbSlugs.length > 0) {
        throw new ServiceError(400, `Careers not found in database: ${missingDbSlugs.join(", ")}`)
    }

    const careerIds = careers.map(c => c.id)

    // Delegate to existing logic (validates against assessment results, limits, etc.)
    return selectCareers(userId, careerIds)
}

/**
 * 2. getRoadmapsSlugFormat
 * Retrieves the user's selected roadmaps and formats them according to the slug-based prompt.
 */
export async function getRoadmapsSlugFormat(userId: string) {
    const { roadmaps } = await getSelectedRoadmaps(userId)

    // Get the JSON data to map topic IDs to topic slugs
    const data = getCareersJson()
    const careerMap = new Map(data.careers.map((c: any) => [c.slug, c]))

    return roadmaps.map(rm => {
        const jsonCareer: any = careerMap.get(rm.slug)
        const jsonRoadmapArray = jsonCareer?.roadmap || []

        // Create a lookup for point completions from the DB
        const completionMap = new Map(
            rm.items.map((item: any) => [item.topicName, item.status])
        )

        // Map the DB roadmap into a slug-based points array
        // We use careers.json as the source of roadmap points ordering/list
        const roadmapItems = jsonRoadmapArray.map((topicName: string) => {
            const status = completionMap.get(topicName) || "not_started"
            
            // To generate a pointKey, we'll try to match the RoadmapTopic slug.
            // Since the DB has the actual topic slugs, we should ideally find it from the DB data.
            const dbItem = rm.items.find((item: any) => item.topicName === topicName)
            const pointKey = dbItem ? topicName.toLowerCase().replace(/[^a-z0-9]+/g, "-") : topicName.toLowerCase().replace(/[^a-z0-9]+/g, "-")

            return {
                pointKey,
                name: topicName,
                isCompleted: status === "completed"
            }
        })

        const completedItemCount = roadmapItems.filter((p: any) => p.isCompleted).length
        const totalItemCount = roadmapItems.length
        const progressPercentage = totalItemCount > 0 ? Math.round((completedItemCount / totalItemCount) * 100) : 0

        return {
            careerSlug: rm.slug,
            roadmapTitle: rm.careerName,
            completedItemCount,
            totalItemCount,
            progressPercentage,
            isCompleted: progressPercentage === 100,
            roadmapItems
        }
    })
}

/**
 * 3. updateRoadmapPointBySlug
 * Resolves slugs to IDs, marks the item as completed/not_started via existing service,
 * and calls gamification hooks.
 */
export async function updateRoadmapPointBySlug(
    userId: string,
    careerSlug: string,
    pointKey: string,
    isCompleted: boolean
) {
    // 1. Resolve careerSlug to careerId
    const career = await prisma.careerPath.findUnique({
        where: { slug: careerSlug },
        select: { id: true }
    })

    if (!career) {
        throw new ServiceError(404, `Career with slug '${careerSlug}' not found`)
    }

    // 2. Resolve pointKey to roadmapItemId
    // pointKey matches RoadmapTopic.slug
    const topic = await prisma.roadmapTopic.findUnique({
        where: { slug: pointKey },
        select: { id: true, name: true }
    })

    if (!topic) {
        throw new ServiceError(404, `Roadmap point with key '${pointKey}' not found`)
    }

    const roadmapItem = await prisma.careerRoadmapItem.findUnique({
        where: {
            careerId_topicId: {
                careerId: career.id,
                topicId: topic.id
            }
        },
        select: { id: true }
    })

    if (!roadmapItem) {
        throw new ServiceError(404, `This point does not belong to the selected career roadmap`)
    }

    // 3. Update the status using existing service (which cascades to tasks)
    const newStatus = isCompleted ? "completed" : "not_started"
    await updateRoadmapItemStatus(userId, career.id, roadmapItem.id, newStatus)

    // 4. Trigger gamification hooks
    if (isCompleted) {
        await GamificationService.handleRoadmapPointCompleted(userId, careerSlug, pointKey)
    } else {
        await GamificationService.handleRoadmapPointUncompleted(userId, careerSlug, pointKey)
    }

    // 5. Check if the entire roadmap is now completed to trigger that hook
    // We can do this by checking if all items for this career are completed
    const allItems = await prisma.careerRoadmapItem.findMany({
        where: { careerId: career.id },
        select: { id: true }
    })

    const completedItems = await prisma.userRoadmapItemProgress.count({
        where: {
            userId,
            roadmapItemId: { in: allItems.map(item => item.id) },
            status: "COMPLETED"
        }
    })

    if (completedItems === allItems.length && allItems.length > 0 && isCompleted) {
        await GamificationService.handleRoadmapCompleted(userId, careerSlug)
    }

    return { success: true, message: "Roadmap point updated successfully" }
}
