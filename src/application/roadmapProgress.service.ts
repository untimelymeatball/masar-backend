// Roadmap Progress Service: business logic for exploring selected roadmaps,
// completing tasks, updating item statuses, and retrieving progress analytics.
// All operations are scoped to the authenticated student and their selected
// career paths.
//
// NOTE: Points/badges/levels are NOT implemented in this milestone.
// The DB schema has a pointsAwarded field prepared for future gamification.

import { prisma } from "../infrastructure/prisma"
import { ServiceError } from "./studentAssessment.service"
import { RoadmapItemStatus } from "../generated/prisma/enums"
import { GamificationService } from "./gamification.service"
import { XP_RULES } from "../config/gamification"

// ─── Status Mapping ─────────────────────────────────────────────────────────
// Maps lowercase API status strings to the Prisma RoadmapItemStatus enum

const STATUS_MAP: Record<string, RoadmapItemStatus> = {
    not_started: RoadmapItemStatus.NOT_STARTED,
    in_progress: RoadmapItemStatus.IN_PROGRESS,
    completed: RoadmapItemStatus.COMPLETED
}

const STATUS_DISPLAY: Record<RoadmapItemStatus, string> = {
    [RoadmapItemStatus.NOT_STARTED]: "not_started",
    [RoadmapItemStatus.IN_PROGRESS]: "in_progress",
    [RoadmapItemStatus.COMPLETED]: "completed"
}

// ─── Helper: Verify career is selected ──────────────────────────────────────

async function verifyCareerSelected(userId: string, careerPathId: string) {
    const selection = await prisma.studentSelectedCareer.findUnique({
        where: {
            userId_careerPathId: { userId, careerPathId }
        }
    })

    if (!selection) {
        throw new ServiceError(
            404,
            "Career roadmap not found. You have not selected this career path."
        )
    }

    return selection
}

// ─── Helper: Verify item belongs to career ──────────────────────────────────

async function verifyItemBelongsToCareer(careerId: string, roadmapItemId: string) {
    const item = await prisma.careerRoadmapItem.findFirst({
        where: { id: roadmapItemId, careerId }
    })

    if (!item) {
        throw new ServiceError(
            404,
            "Roadmap item not found in this career roadmap."
        )
    }

    return item
}

// ─── Helper: Verify task belongs to item ────────────────────────────────────

async function verifyTaskBelongsToItem(roadmapItemId: string, taskId: string) {
    const task = await prisma.roadmapTask.findFirst({
        where: { id: taskId, roadmapItemId }
    })

    if (!task) {
        throw new ServiceError(
            404,
            "Task not found in this roadmap item."
        )
    }

    return task
}

// ─── Helper: Recalculate item progress from tasks ───────────────────────────
// Counts completed vs total tasks, updates status/percentage.

async function recalculateItemProgress(userId: string, roadmapItemId: string) {
    // Get all tasks for this item
    const tasks = await prisma.roadmapTask.findMany({
        where: { roadmapItemId },
        select: { id: true }
    })

    const totalTasks = tasks.length
    if (totalTasks === 0) {
        return
    }

    // Get completed tasks for this user
    const completedTasks = await prisma.userRoadmapTaskProgress.count({
        where: {
            userId,
            taskId: { in: tasks.map(t => t.id) },
            isCompleted: true
        }
    })

    const progressPercentage = Math.round((completedTasks / totalTasks) * 100)

    // Determine status based on task completion
    let newStatus: RoadmapItemStatus
    if (completedTasks === 0) {
        newStatus = RoadmapItemStatus.NOT_STARTED
    } else if (completedTasks < totalTasks) {
        newStatus = RoadmapItemStatus.IN_PROGRESS
    } else {
        newStatus = RoadmapItemStatus.COMPLETED
    }

    // Preserve existing completedAt if already completed
    const existing = await prisma.userRoadmapItemProgress.findUnique({
        where: { userId_roadmapItemId: { userId, roadmapItemId } }
    })

    const completedAt = newStatus === RoadmapItemStatus.COMPLETED
        ? (existing?.completedAt ?? new Date())
        : null

    // Upsert the progress record
    await prisma.userRoadmapItemProgress.upsert({
        where: { userId_roadmapItemId: { userId, roadmapItemId } },
        create: {
            userId,
            roadmapItemId,
            status: newStatus,
            progressPercentage,
            completedAt
        },
        update: {
            status: newStatus,
            progressPercentage,
            completedAt
        }
    })
}

// ─── Helper: Build roadmap progress summary ─────────────────────────────────

async function buildRoadmapProgressSummary(userId: string, careerId: string) {
    const items = await prisma.careerRoadmapItem.findMany({
        where: { careerId },
        include: {
            tasks: { select: { id: true } },
            userProgress: {
                where: { userId },
                select: {
                    status: true,
                    progressPercentage: true
                }
            }
        }
    })

    const totalItems = items.length
    let completedItems = 0
    let totalTasks = 0

    for (const item of items) {
        const progress = item.userProgress[0]
        if (progress?.status === RoadmapItemStatus.COMPLETED) {
            completedItems++
        }
        totalTasks += item.tasks.length
    }

    // Count completed tasks across all items
    let completedTasksCount = 0
    const allTaskIds = items.flatMap(item => item.tasks.map(t => t.id))
    if (allTaskIds.length > 0) {
        completedTasksCount = await prisma.userRoadmapTaskProgress.count({
            where: {
                userId,
                taskId: { in: allTaskIds },
                isCompleted: true
            }
        })
    }

    const progressPercentage = totalItems > 0
        ? Math.round((completedItems / totalItems) * 100)
        : 0

    return {
        progressPercentage,
        completedItems,
        totalItems,
        completedTasks: completedTasksCount,
        totalTasks,
        tasksRemaining: totalTasks - completedTasksCount
    }
}

// ─── 1. getSelectedRoadmapDetail ────────────────────────────────────────────
// Returns the full selected roadmap for a career, with real progress data.

async function getSelectedRoadmapDetail(userId: string, careerId: string) {
    // Verify career is selected
    const selection = await verifyCareerSelected(userId, careerId)

    // Get career info with roadmap items, tasks, and user progress
    const career = await prisma.careerPath.findUnique({
        where: { id: careerId },
        include: {
            roadmapItems: {
                include: {
                    topic: true,
                    tasks: { select: { id: true } },
                    userProgress: {
                        where: { userId },
                        select: {
                            status: true,
                            progressPercentage: true,
                            completedAt: true
                        }
                    }
                },
                orderBy: { order: "asc" }
            }
        }
    })

    if (!career) {
        throw new ServiceError(404, "Career path not found.")
    }

    // Count completed tasks per item for this user
    const allTaskIds = career.roadmapItems.flatMap(item => item.tasks.map(t => t.id))
    const completedTaskRecords = allTaskIds.length > 0
        ? await prisma.userRoadmapTaskProgress.findMany({
            where: {
                userId,
                taskId: { in: allTaskIds },
                isCompleted: true
            },
            select: { taskId: true }
        })
        : []
    const completedTaskIdSet = new Set(completedTaskRecords.map(r => r.taskId))

    // Build items with real progress
    const items = career.roadmapItems.map(item => {
        const progress = item.userProgress[0]
        const totalTaskCount = item.tasks.length
        const completedTaskCount = item.tasks.filter(t => completedTaskIdSet.has(t.id)).length

        return {
            roadmapItemId: item.id,
            topicId: item.topic.id,
            topicName: item.topic.name,
            order: item.order,
            status: progress ? STATUS_DISPLAY[progress.status] : "not_started",
            progressPercentage: progress?.progressPercentage ?? 0,
            completedTaskCount,
            totalTaskCount,
            completedAt: progress?.completedAt ?? null
        }
    })

    // Build progress summary
    const progressSummary = await buildRoadmapProgressSummary(userId, careerId)

    return {
        roadmap: {
            careerId: career.id,
            careerName: career.name,
            slug: career.slug,
            description: career.description,
            selectedAt: selection.selectedAt,
            progress: progressSummary,
            items
        }
    }
}

// ─── 2. getRoadmapItemDetail ────────────────────────────────────────────────
// Returns one roadmap item with its tasks and per-task completion status.

async function getRoadmapItemDetail(userId: string, careerId: string, roadmapItemId: string) {
    await verifyCareerSelected(userId, careerId)
    await verifyItemBelongsToCareer(careerId, roadmapItemId)

    // Get the item with topic, tasks, and user progress
    const item = await prisma.careerRoadmapItem.findUnique({
        where: { id: roadmapItemId },
        include: {
            topic: true,
            tasks: {
                orderBy: { order: "asc" }
            },
            userProgress: {
                where: { userId },
                select: {
                    status: true,
                    progressPercentage: true,
                    completedAt: true
                }
            }
        }
    })

    if (!item) {
        throw new ServiceError(404, "Roadmap item not found.")
    }

    // Get task completion status for this user
    const taskProgressRecords = await prisma.userRoadmapTaskProgress.findMany({
        where: {
            userId,
            taskId: { in: item.tasks.map(t => t.id) }
        }
    })
    const taskProgressMap = new Map(taskProgressRecords.map(r => [r.taskId, r]))

    const progress = item.userProgress[0]

    const tasks = item.tasks.map(task => {
        const tp = taskProgressMap.get(task.id)

        return {
            taskId: task.id,
            title: task.title,
            description: task.description,
            order: task.order,
            isCompleted: tp?.isCompleted ?? false,
            completedAt: tp?.completedAt ?? null
        }
    })

    return {
        item: {
            roadmapItemId: item.id,
            topicId: item.topic.id,
            topicName: item.topic.name,
            order: item.order,
            status: progress ? STATUS_DISPLAY[progress.status] : "not_started",
            progressPercentage: progress?.progressPercentage ?? 0,
            completedAt: progress?.completedAt ?? null,
            tasks
        }
    }
}

// ─── 3. updateRoadmapItemStatus ─────────────────────────────────────────────
// Manually updates the status of a roadmap item.
// On completion: sets completedAt and marks all tasks as completed.
// On not_started: clears completedAt.
// Does NOT award points in this milestone.

async function updateRoadmapItemStatus(
    userId: string,
    careerId: string,
    roadmapItemId: string,
    statusStr: string
) {
    await verifyCareerSelected(userId, careerId)
    await verifyItemBelongsToCareer(careerId, roadmapItemId)

    const newStatus = STATUS_MAP[statusStr]
    if (!newStatus) {
        throw new ServiceError(400, "Invalid status value.")
    }

    // Get existing progress to preserve completedAt if already set
    const existing = await prisma.userRoadmapItemProgress.findUnique({
        where: { userId_roadmapItemId: { userId, roadmapItemId } }
    })

    const completedAt = newStatus === RoadmapItemStatus.COMPLETED
        ? (existing?.completedAt ?? new Date())
        : null

    // Get all tasks for this item
    const tasks = await prisma.roadmapTask.findMany({
        where: { roadmapItemId },
        select: { id: true }
    })

    // If marking as completed, also mark all tasks as completed
    if (newStatus === RoadmapItemStatus.COMPLETED && tasks.length > 0) {
        const now = new Date()
        for (const task of tasks) {
            await prisma.userRoadmapTaskProgress.upsert({
                where: { userId_taskId: { userId, taskId: task.id } },
                create: {
                    userId,
                    taskId: task.id,
                    isCompleted: true,
                    completedAt: now
                },
                update: {
                    isCompleted: true,
                    completedAt: now
                }
            })
        }
    }

    // Calculate progress percentage from tasks
    let progressPercentage = 0
    if (tasks.length > 0) {
        if (newStatus === RoadmapItemStatus.COMPLETED) {
            progressPercentage = 100
        } else {
            const completedTaskCount = await prisma.userRoadmapTaskProgress.count({
                where: {
                    userId,
                    taskId: { in: tasks.map(t => t.id) },
                    isCompleted: true
                }
            })
            progressPercentage = Math.round((completedTaskCount / tasks.length) * 100)
        }
    }

    // Upsert progress record
    await prisma.userRoadmapItemProgress.upsert({
        where: { userId_roadmapItemId: { userId, roadmapItemId } },
        create: {
            userId,
            roadmapItemId,
            status: newStatus,
            progressPercentage,
            completedAt
        },
        update: {
            status: newStatus,
            progressPercentage,
            completedAt
        }
    })

    // Get updated item detail and progress summary
    const itemDetail = await getRoadmapItemDetail(userId, careerId, roadmapItemId)
    const progressSummary = await buildRoadmapProgressSummary(userId, careerId)

    // Gamification Hook: Roadmap Item Completed
    if (newStatus === RoadmapItemStatus.COMPLETED) {
        // Use the progress record ID or roadmapItemId + userId to ensure uniqueness.
        // The DB upsert gives us the existing/new record ID
        const progressRecord = await prisma.userRoadmapItemProgress.findUnique({
            where: { userId_roadmapItemId: { userId, roadmapItemId } },
            select: { id: true }
        })
        if (progressRecord) {
            await GamificationService.awardXp(
                userId,
                "ROADMAP_ITEM_COMPLETED",
                progressRecord.id, // ID of UserRoadmapItemProgress
                XP_RULES.ROADMAP_ITEM_COMPLETED,
                `Completed roadmap item: ${itemDetail.item.topicName}`
            )
        }
    }

    // Gamification Hook: Full Roadmap Completed
    if (progressSummary.progressPercentage === 100) {
        // We use the StudentSelectedCareer record ID as the source ID
        const selection = await prisma.studentSelectedCareer.findUnique({
            where: { userId_careerPathId: { userId, careerPathId: careerId } },
            include: { careerPath: { select: { name: true } } }
        })
        if (selection) {
            await GamificationService.awardXp(
                userId,
                "ROADMAP_COMPLETED",
                selection.id, // StudentSelectedCareer ID
                XP_RULES.ROADMAP_COMPLETED,
                `Completed the ${selection.careerPath.name} roadmap`
            )
        }
    }

    return {
        ...itemDetail,
        roadmapProgress: progressSummary
    }
}

// ─── 4. updateTaskCompletion ────────────────────────────────────────────────
// Marks a task as completed or not completed. Recalculates item progress.
// If all tasks are completed, auto-completes the item.
// If some tasks are completed, sets item to in_progress.
// If no tasks are completed, sets item to not_started.
// Does NOT award points in this milestone.

async function updateTaskCompletion(
    userId: string,
    careerId: string,
    roadmapItemId: string,
    taskId: string,
    isCompleted: boolean
) {
    await verifyCareerSelected(userId, careerId)
    await verifyItemBelongsToCareer(careerId, roadmapItemId)
    await verifyTaskBelongsToItem(roadmapItemId, taskId)

    const now = new Date()

    // Upsert the task progress
    await prisma.userRoadmapTaskProgress.upsert({
        where: { userId_taskId: { userId, taskId } },
        create: {
            userId,
            taskId,
            isCompleted,
            completedAt: isCompleted ? now : null
        },
        update: {
            isCompleted,
            completedAt: isCompleted ? now : null
        }
    })

    // Recalculate item progress (may auto-complete)
    await recalculateItemProgress(userId, roadmapItemId)

    // Get updated task, item detail, and roadmap progress
    const updatedTask = await prisma.userRoadmapTaskProgress.findUnique({
        where: { userId_taskId: { userId, taskId } },
        include: {
            task: {
                select: { title: true, description: true, order: true }
            }
        }
    })

    const itemDetail = await getRoadmapItemDetail(userId, careerId, roadmapItemId)
    const progressSummary = await buildRoadmapProgressSummary(userId, careerId)

    // Gamification Hook: Roadmap Item Completed
    if (itemDetail.item.status === "completed") {
        const progressRecord = await prisma.userRoadmapItemProgress.findUnique({
            where: { userId_roadmapItemId: { userId, roadmapItemId } },
            select: { id: true }
        })
        if (progressRecord) {
            await GamificationService.awardXp(
                userId,
                "ROADMAP_ITEM_COMPLETED",
                progressRecord.id,
                XP_RULES.ROADMAP_ITEM_COMPLETED,
                `Completed roadmap item: ${itemDetail.item.topicName}`
            )
        }
    }

    // Gamification Hook: Full Roadmap Completed
    if (progressSummary.progressPercentage === 100) {
        const selection = await prisma.studentSelectedCareer.findUnique({
            where: { userId_careerPathId: { userId, careerPathId: careerId } },
            include: { careerPath: { select: { name: true } } }
        })
        if (selection) {
            await GamificationService.awardXp(
                userId,
                "ROADMAP_COMPLETED",
                selection.id,
                XP_RULES.ROADMAP_COMPLETED,
                `Completed the ${selection.careerPath.name} roadmap`
            )
        }
    }

    return {
        task: {
            taskId: updatedTask!.taskId,
            title: updatedTask!.task.title,
            description: updatedTask!.task.description,
            order: updatedTask!.task.order,
            isCompleted: updatedTask!.isCompleted,
            completedAt: updatedTask!.completedAt
        },
        ...itemDetail,
        roadmapProgress: progressSummary
    }
}

// ─── 5. getRoadmapProgress ──────────────────────────────────────────────────
// Returns progress analytics for a selected roadmap.
// Does NOT include points/badges/level data in this milestone.

async function getRoadmapProgress(userId: string, careerId: string) {
    await verifyCareerSelected(userId, careerId)

    const career = await prisma.careerPath.findUnique({
        where: { id: careerId },
        select: { id: true, name: true, slug: true }
    })

    if (!career) {
        throw new ServiceError(404, "Career path not found.")
    }

    const progressSummary = await buildRoadmapProgressSummary(userId, careerId)

    // Find current phase (first non-completed item)
    const items = await prisma.careerRoadmapItem.findMany({
        where: { careerId },
        include: {
            topic: true,
            userProgress: {
                where: { userId },
                select: { status: true }
            }
        },
        orderBy: { order: "asc" }
    })

    const currentPhase = items.find(item => {
        const status = item.userProgress[0]?.status
        return status !== RoadmapItemStatus.COMPLETED
    })

    return {
        careerId: career.id,
        careerName: career.name,
        slug: career.slug,
        ...progressSummary,
        currentPhase: currentPhase
            ? {
                roadmapItemId: currentPhase.id,
                topicName: currentPhase.topic.name,
                order: currentPhase.order
            }
            : null
    }
}

export const RoadmapProgressService = {
    getSelectedRoadmapDetail,
    getRoadmapItemDetail,
    updateRoadmapItemStatus,
    updateTaskCompletion,
    getRoadmapProgress
}

export {
    getSelectedRoadmapDetail,
    getRoadmapItemDetail,
    updateRoadmapItemStatus,
    updateTaskCompletion,
    getRoadmapProgress
}
