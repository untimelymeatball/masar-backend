import { Role } from "../generated/prisma/enums"

declare module "express-serve-static-core" {
    interface Request {
        user?: {
            userId: string
            role: Role
        }
    }
}