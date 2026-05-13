// Zod validation schemas for Roadmap Progress endpoints.
// Validates route params (careerId, roadmapItemId, taskId),
// status update body, and task completion body.

import { z } from "zod"

// ─── Route Param Schemas ────────────────────────────────────────────────────

export const roadmapCareerIdParamSchema = z.object({
    careerId: z.string().trim().min(1, "careerId is required")
})

export const roadmapItemParamSchema = z.object({
    careerId: z.string().trim().min(1, "careerId is required"),
    roadmapItemId: z.string().trim().min(1, "roadmapItemId is required")
})

export const roadmapTaskParamSchema = z.object({
    careerId: z.string().trim().min(1, "careerId is required"),
    roadmapItemId: z.string().trim().min(1, "roadmapItemId is required"),
    taskId: z.string().trim().min(1, "taskId is required")
})

// ─── Slug-based Route Param Schemas ──────────────────────────────────────────

export const roadmapSlugParamSchema = z.object({
    careerSlug: z.string().trim().min(1, "careerSlug is required")
})

export const roadmapPointSlugParamSchema = z.object({
    careerSlug: z.string().trim().min(1, "careerSlug is required"),
    pointKey: z.string().trim().min(1, "pointKey is required")
})

// ─── Body Schemas ───────────────────────────────────────────────────────────

// Allowed status values match the RoadmapItemStatus enum
export const updateItemStatusSchema = z.object({
    status: z.enum(["not_started", "in_progress", "completed"], {
        error: "status must be one of: not_started, in_progress, completed"
    })
}).strict()

export const updateTaskCompletionSchema = z.object({
    isCompleted: z.boolean({
        error: "isCompleted must be a boolean"
    })
}).strict()

// ─── Slug-based Body Schemas ────────────────────────────────────────────────

export const selectSlugsSchema = z.object({
    careerSlugs: z
        .array(z.string().trim().min(1, "careerSlug must not be empty"))
        .min(1, "You must select at least 1 career")
        .max(3, "You can select at most 3 careers")
        // refine out duplicates
        .refine((items) => new Set(items).size === items.length, {
            message: "Duplicate career selections are not allowed"
        })
}).strict()

export const updatePointCompletionSchema = z.object({
    isCompleted: z.boolean({
        error: "isCompleted must be a boolean"
    })
}).strict()

// ─── Type Exports ───────────────────────────────────────────────────────────
export type RoadmapCareerIdParam = z.infer<typeof roadmapCareerIdParamSchema>
export type RoadmapItemParam = z.infer<typeof roadmapItemParamSchema>
export type RoadmapTaskParam = z.infer<typeof roadmapTaskParamSchema>
export type UpdateItemStatusInput = z.infer<typeof updateItemStatusSchema>
export type UpdateTaskCompletionInput = z.infer<typeof updateTaskCompletionSchema>

// Slug-based types
export type RoadmapSlugParam = z.infer<typeof roadmapSlugParamSchema>
export type RoadmapPointSlugParam = z.infer<typeof roadmapPointSlugParamSchema>
export type SelectSlugsInput = z.infer<typeof selectSlugsSchema>
export type UpdatePointCompletionInput = z.infer<typeof updatePointCompletionSchema>
