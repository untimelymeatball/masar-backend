// Zod validation schemas for Student Dashboard + Profile Management.
// Validates PATCH requests for core profile fields and enrichment fields.

import { z } from "zod"

// ─── Constants ──────────────────────────────────────────────────────────────

const EDUCATION_LEVELS = [
    "HIGH_SCHOOL",
    "BACHELORS",
    "MASTERS",
    "PHD",
    "DIPLOMA"
] as const

const currentYear = new Date().getFullYear()

// ─── Core Profile Update Schema ────────────────────────────────────────────
// Used by PATCH /api/students/me — all fields optional for partial updates.

export const updateProfileSchema = z.object({
    firstName: z
        .string()
        .trim()
        .min(1, "firstName must not be empty")
        .optional(),

    lastName: z
        .string()
        .trim()
        .min(1, "lastName must not be empty")
        .optional(),

    email: z
        .string()
        .trim()
        .email("email must be a valid email address")
        .optional(),

    phone: z
        .string()
        .trim()
        .min(7, "phone must be at least 7 characters")
        .max(20, "phone must not exceed 20 characters")
        .optional(),

    province: z
        .string()
        .trim()
        .min(1, "province must not be empty")
        .optional(),

    city: z
        .string()
        .trim()
        .min(1, "city must not be empty")
        .optional(),

    birthdate: z
        .string()
        .refine(val => !isNaN(Date.parse(val)), {
            message: "birthdate must be a valid date (e.g. 2000-01-15)"
        })
        .optional(),

    profilePicture: z
        .string()
        .trim()
        .min(1, "profilePicture must not be empty")
        .nullable()
        .optional(),

    bio: z
        .string()
        .trim()
        .nullable()
        .optional(),

    educationLevel: z
        .enum(EDUCATION_LEVELS, {
            error: `educationLevel must be one of: ${EDUCATION_LEVELS.join(", ")}`
        })
        .optional(),

    major: z
        .string()
        .trim()
        .min(1, "major must not be empty")
        .optional(),

    graduationYear: z
        .number()
        .int("graduationYear must be an integer")
        .min(currentYear, `graduationYear must be ${currentYear} or later`)
        .max(currentYear + 10, `graduationYear must not exceed ${currentYear + 10}`)
        .optional()
}).strict() // reject unknown keys to prevent accidental field injection

// ─── Enrichment Update Schema ──────────────────────────────────────────────
// Used by PATCH /api/students/profile-enrichment — arrays replace existing values.

const nonEmptyStringArray = z
    .array(
        z.string().trim().min(1, "array items must be non-empty strings")
    )
    .default([])

export const updateEnrichmentSchema = z.object({
    interests: nonEmptyStringArray.optional(),

    hobbies: nonEmptyStringArray.optional(),

    talents: nonEmptyStringArray.optional(),

    preferences: nonEmptyStringArray.optional(),

    cvLink: z
        .string()
        .trim()
        .url("cvLink must be a valid URL")
        .nullable()
        .optional(),

    portfolioLink: z
        .string()
        .trim()
        .url("portfolioLink must be a valid URL")
        .nullable()
        .optional()
}).strict()

// ─── Validation Helper ─────────────────────────────────────────────────────
// Wraps Zod parsing into a clean result object for route handlers.

interface ValidationSuccess<T> {
    success: true
    data: T
}

interface ValidationFailure {
    success: false
    errors: string[]
}

type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

export function validateRequest<T>(
    schema: z.ZodSchema<T>,
    body: unknown
): ValidationResult<T> {
    const result = schema.safeParse(body)

    if (result.success) {
        return { success: true, data: result.data }
    }

    const errors = result.error.issues.map((issue) => {
        const path = issue.path.length > 0 ? `${issue.path.map(String).join(".")}: ` : ""
        return `${path}${issue.message}`
    })

    return { success: false, errors }
}

// ─── Type Exports ───────────────────────────────────────────────────────────
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>
export type UpdateEnrichmentInput = z.infer<typeof updateEnrichmentSchema>
export { EDUCATION_LEVELS }
