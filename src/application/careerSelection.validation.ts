// Zod validation schemas for Career Selection endpoints.
// Validates POST body (career IDs array) and DELETE route params.

import { z } from "zod"

// ─── POST Body Schema ───────────────────────────────────────────────────────
// Validates the request body for selecting career paths.
// Rules: 1–3 unique, non-empty career IDs.

export const selectCareersSchema = z.object({
    careerIds: z
        .array(
            z.string().trim().min(1, "careerIds items must be non-empty strings")
        )
        .min(1, "You must select at least 1 career path")
        .max(3, "You may select at most 3 career paths")
        .refine(
            (ids) => new Set(ids).size === ids.length,
            { message: "Duplicate careerIds are not allowed" }
        )
}).strict()

// ─── DELETE Route Param Schema ──────────────────────────────────────────────
// Validates the careerId path parameter for single-career deletion.

export const careerIdParamSchema = z.object({
    careerId: z
        .string()
        .trim()
        .min(1, "careerId is required")
})

// ─── Type Exports ───────────────────────────────────────────────────────────
export type SelectCareersInput = z.infer<typeof selectCareersSchema>
export type CareerIdParam = z.infer<typeof careerIdParamSchema>
