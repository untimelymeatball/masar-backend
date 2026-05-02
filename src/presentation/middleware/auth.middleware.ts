// Middleware regulates access to the routes
// It's going to read the JWT from the request header and verify it's valid
// and not expired, then it will attach the decoded user info to the 
// request so route handlers can use it. If anything is wrong
// the request is rejected with code 401

import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken"
import { Role } from "../../generated/prisma/enums";

// authenticate is a function that takes three Express objects. The
// Request, Response, and NextFunction, these are TypeScript types
function authenticate(req: Request, res: Response, next: NextFunction) {
    // Line 14 reads the authorization header from the incoming request
    // and takes it as a whole string
    const authHeader = req.headers.authorization
    // Line 17 checks if the header is empty or doesn't start with "Bearer "
    // and sents back error 401 
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
        res.status(401).json({ error: "No token provided" })
        return
    }
    // Line 23 splits the header into two separate strings and string with index
    // 1 is the token part that we want
    const token = authHeader.split(" ")[1]
    // the condition checks whether the token is empty and returns as such
    if (!token) {
        res.status(401).json({ error: "No token provided"})
        return
    }
    
    try {
        // Line 33 verifies the token using the secret key, if valid,
        // it returns the payload (userId and role), if expired or invalid,
        // it throws an error
        const decoded = jwt.verify(token, process.env.JWT_SECRET!) as unknown as { userId: string, role: Role }
        req.user = decoded // attached the decoded payload onto req so the next middleware or route handler can acces it via req.user
        next() // hands the request to whatever comes next due to checks passing
    } catch {
        // errors thrown by jwt.verify are caught here and the request
        // is rejected returning error 401
        res.status(401).json({ error: "Invalid or expired token" })
    }

}

function requireRole(role: Role) {
    return function(req: Request, res: Response, next: NextFunction) {
        if(!req.user) {
            res.status(401).json({ error: "Unauthorized"})
            return
        }
        if(req.user.role === role) {
            next()
        }
        else {
            res.status(403).json({ error: "Forbidden Access"})
            return
        }
    }
}



export { authenticate, requireRole }