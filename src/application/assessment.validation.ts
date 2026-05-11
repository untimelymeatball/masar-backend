// Zod validation schemas for Assessment endpoints.
// Validates route params and submission body for the assessment flow.

import { z } from "zod"

// ─── Route Param Schemas ────────────────────────────────────────────────────

export const assessmentIdParamSchema = z.object({
    assessmentId: z
        .string()
        .trim()
        .min(1, "assessmentId is required")
})

// ─── Submission Body Schema ─────────────────────────────────────────────────

const answerSchema = z.object({
    questionId: z
        .string()
        .trim()
        .min(1, "questionId is required"),
    optionId: z
        .string()
        .trim()
        .min(1, "optionId is required")
})

const nonEmptyStringArray = z
    .array(
        z.string().trim().min(1, "array items must be non-empty strings")
    )

export const assessmentSubmissionSchema = z.object({
    answers: z
        .array(answerSchema)
        .min(1, "answers must be a non-empty array")
        .refine(
            (answers) => {
                const questionIds = answers.map(a => a.questionId)
                return new Set(questionIds).size === questionIds.length
            },
            { message: "Duplicate questionId values are not allowed" }
        ),

    // Optional enrichment fields — merged into student profile on submission
    skills: nonEmptyStringArray.optional(),
    hobbies: nonEmptyStringArray.optional(),
    talents: nonEmptyStringArray.optional()
}).strict()

// ─── Type Exports ───────────────────────────────────────────────────────────
export type AssessmentIdParam = z.infer<typeof assessmentIdParamSchema>
export type AssessmentSubmissionInput = z.infer<typeof assessmentSubmissionSchema>
