import { prisma } from "../infrastructure/prisma";
import bcrypt from "bcrypt"
import jwt from "jsonwebtoken"

// This file contains the auth service, which is basically the logic behind
// authentication, any HTTP requests that come through go to the route handler
// first, then the route handler calls the correct function in the service
// Then all of this is wired together in src/app.ts

import { Role } from "../generated/prisma/enums";


// The register function does the following:
// 1. Checks if the email is already taken
// 2. Hashes the password
// 3. Creates the User record in the database
async function register(email: string, username: string, password: string, role: Role) {
    const existing = await prisma.user.findUnique({ 
        where: { email: email } // checks if a user exists with that email
    }) 
    if (existing) // if a user does exist an error is thrown
        throw new Error("Email already in use")

    // hash the password
    const hashedPassword = await bcrypt.hash(password, 12) 
    // 12 is the cost factor, the higher the number, 
    // the slower the hashing which results in the password being harder 
    // to brute force but also slower on the server side

    // create the user record in the database withh the passed parameters
    // prisma.user.create() inserts a new row and returns the created record
    const user = await prisma.user.create({
        data: {email, username, password: hashedPassword, role}
    })
    
    const { password: _, ...userWithoutPassword } = user
    return userWithoutPassword
}

// The login function does the following:
// 1. Finds the user by email, throws an error if not found
// 2. Compare the provided password against the stored hash, throw error if it doesn't match
// 3. Generate and return a JWT
async function login(email: string, password: string) {
    const user = await prisma.user.findUnique({
        where: {email: email} // search for a user with the provided email
    })
    if (!user)
        throw new Error("Invalid credentials")

    // bcrypt.compare takes the plain text password and the hash and compares them
    const passwordMatch = await bcrypt.compare(password, user.password)
    if (!passwordMatch) // checks the received password against the stored hash
        throw new Error("Invalid credentials")

    // finally the JWT is generated and returned if the previous
    // conditions pass
    const token = jwt.sign(
        { userId: user.id, role: user.role },
        process.env.JWT_SECRET!,
        { expiresIn: "7d"}
    )
    return token
}

export { register, login }