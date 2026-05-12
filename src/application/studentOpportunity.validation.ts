import { z } from "zod"

export const opportunityQuerySchema = z.object({
    query: z.object({
        search: z.string().optional(),
        tag: z.string().optional(),
        mode: z.enum(["ONLINE", "ONSITE", "HYBRID"]).optional(),
        location: z.string().optional(),
        providerId: z.string().uuid().optional(),
        page: z.string().regex(/^\d+$/).transform(Number).optional(),
        limit: z.string().regex(/^\d+$/).transform(Number).optional()
    })
})

export const opportunityIdParamSchema = z.object({
    params: z.object({
        opportunityId: z.string().uuid("Invalid opportunity ID")
    })
})

export const participationBodySchema = z.object({
    params: z.object({
        opportunityId: z.string().uuid("Invalid opportunity ID")
    }),
    body: z.object({
        participated: z.boolean()
    })
})

export const feedbackBodySchema = z.object({
    params: z.object({
        opportunityId: z.string().uuid("Invalid opportunity ID")
    }),
    body: z.object({
        ratingOverall: z.number().int().min(1).max(5),
        ratingContent: z.number().int().min(1).max(5).optional(),
        ratingOrganization: z.number().int().min(1).max(5).optional(),
        ratingCommunication: z.number().int().min(1).max(5).optional(),
        comment: z.string().optional(),
        isAnonymous: z.boolean().default(true)
    })
})
