// Validation helpers for student registration input.
// No external libraries — manual checks to stay consistent with the
// project's existing conventions.

interface ValidationResult {
    valid: boolean
    errors: string[]
}

// Validates the full registration payload (steps 2 + 3 of the workflow)
function validateRegistrationInput(body: any): ValidationResult {
    const errors: string[] = []

    // --- Step 2 fields: credentials ---
    if (!body.email || typeof body.email !== "string") {
        errors.push("email is required")
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email)) {
        errors.push("email must be a valid email address")
    }

    if (!body.username || typeof body.username !== "string") {
        errors.push("username is required")
    } else if (body.username.length < 3) {
        errors.push("username must be at least 3 characters")
    }

    if (!body.password || typeof body.password !== "string") {
        errors.push("password is required")
    } else if (body.password.length < 8) {
        errors.push("password must be at least 8 characters")
    }

    if (!body.studentId || typeof body.studentId !== "string") {
        errors.push("studentId is required")
    }

    // --- Step 3 fields: profile details ---
    if (!body.firstName || typeof body.firstName !== "string") {
        errors.push("firstName is required")
    }

    if (!body.lastName || typeof body.lastName !== "string") {
        errors.push("lastName is required")
    }

    if (!body.phone || typeof body.phone !== "string") {
        errors.push("phone is required")
    }

    if (!body.province || typeof body.province !== "string") {
        errors.push("province is required")
    }

    if (!body.birthdate || typeof body.birthdate !== "string") {
        errors.push("birthdate is required")
    } else if (isNaN(Date.parse(body.birthdate))) {
        errors.push("birthdate must be a valid date (e.g. 2000-01-15)")
    }

    if (!body.educationLevel || typeof body.educationLevel !== "string") {
        errors.push("educationLevel is required")
    }

    if (!body.major || typeof body.major !== "string") {
        errors.push("major is required")
    }

    if (body.graduationYear === undefined || body.graduationYear === null) {
        errors.push("graduationYear is required")
    } else if (typeof body.graduationYear !== "number" || !Number.isInteger(body.graduationYear)) {
        errors.push("graduationYear must be an integer")
    }

    return {
        valid: errors.length === 0,
        errors
    }
}

export { validateRegistrationInput }
export type { ValidationResult }
