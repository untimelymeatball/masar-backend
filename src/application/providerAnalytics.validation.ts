import { z } from "zod"

export const opportunityIdParamSchema = z.object({
    params: z.object({
        opportunityId: z.string().uuid("Invalid opportunity ID format")
    })
})
