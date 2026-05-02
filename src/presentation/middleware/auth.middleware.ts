// Middleware regulates access to the routes
// It's going to reat the JWT from the request header and verify it's valid
// and not expired, then it will attach the decoded user info to the 
// request so route handlers can use it. If anything is wrong
// the request is rejected with code 401

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken"

function authenticate(req: Request, res: Response, next: NextFunction) {
    const authHeader = req.headers.authorization
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "No token provided" })
        return
    }
    
    const token = authHeader.split(" ")[1]
    if (!token) {
        res.status(401).json({ error: "No token provided"})
        return
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as unknown as { userId: string, role: string }
        (req as any).user = decoded
        next()
    } catch {
        res.status(401).json({ error: "Invalid or expired token" })
    }



}



export { authenticate }