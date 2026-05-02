import { Router } from "express";
import { authenticate, requireRole } from "../middleware/auth.middleware";
import { Role } from "../../generated/prisma/enums";

const router = Router()

router.get("/profile", authenticate, requireRole(Role.STUDENT), async (req, res) => {
    try {
        res.json({ message: "student profile route" })
    } catch {

    }
})

export { router }

