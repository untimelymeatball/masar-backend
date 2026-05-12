import { z } from "zod"
import { ReportReason } from "../generated/prisma/enums"

export const reportProviderSchema = z.object({
    reason: z.enum([
        "MISLEADING_INFORMATION",
        "UNPROFESSIONAL_BEHAVIOR",
        "SCAM_OR_FRAUD",
        "INAPPROPRIATE_CONTENT",
        "SAFETY_CONCERN",
        "DISCRIMINATION_OR_HARASSMENT",
        "OTHER"
    ]),
    description: z.string().min(10).max(2000),
    opportunityId: z.string().uuid().optional()
})

export const providerOpportunitiesQuerySchema = z.object({
    page: z.string().optional().transform(v => v ? parseInt(v) : 1),
    limit: z.string().optional().transform(v => v ? parseInt(v) : 10),
    search: z.string().optional(),
    tag: z.string().optional(),
    mode: z.string().optional()
})
