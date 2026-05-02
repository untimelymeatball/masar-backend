// This file defines the HTTP endpoints and connects them to the relevant
// service. For example when a POST /auth/register request comes in, this
// handler reads the body, calls register(), and sends back a response.
// This file contains no logic, just HTTP call comes in, service gets 
// called, response out.

import { Router } from "express";
import { login, register } from "../../application/auth.service";
import { authenticate } from "../middleware/auth.middleware"


// Router creation
const router = Router()

// register route handler
// try, catch block to prevent error code 500 when any user error occurs
router.post("/register", async (req, res) => { // listens for POST requests
    try {
        const { email, username, password, role } = req.body // req.body is the JSON body sent from the client
        const user = await register(email, username, password, role)
        res.status(201).json(user) // response 201 "resource created" and sends created user back as JSON
    }   catch (error: any) {
        res.status(400).json({ error: error.message })
    }

})

// login route handler
// try, catch block to prevent error code 500 when any user error occurs
router.post("/login", async (req, res) => {
    try {
        const { email, password } = req.body
        const token = await login(email, password)
        res.status(200).json({token})
    } catch (error: any) {
        res.status(400).json({ error: error.message})
    }
})


export {router}