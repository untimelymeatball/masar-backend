import { Request, Response } from "express"
import { StudentOpportunityService } from "./studentOpportunity.service"
import { validateRequest } from "./dashboard.validation"
import {
    opportunityQuerySchema,
    opportunityIdParamSchema,
    participationBodySchema,
    feedbackBodySchema
} from "./studentOpportunity.validation"

export const getOpportunities = async (req: Request, res: Response) => {
    const validation = validateRequest(opportunityQuerySchema, { query: req.query })
    if (!validation.success) return res.status(400).json({ success: false, errors: validation.errors })

    try {
        const result = await StudentOpportunityService.getApprovedOpportunities(req.user!.userId, req.query)
        res.status(200).json({ success: true, data: result })
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message })
    }
}

export const getOpportunity = async (req: Request, res: Response) => {
    const validation = validateRequest(opportunityIdParamSchema, { params: req.params })
    if (!validation.success) return res.status(400).json({ success: false, errors: validation.errors })

    try {
        const opportunity = await StudentOpportunityService.getOpportunityDetail(req.user!.userId, req.params.opportunityId as string)
        res.status(200).json({ success: true, data: opportunity })
    } catch (error: any) {
        const status = error.message === "Opportunity not found or not published" ? 404 : 500
        res.status(status).json({ success: false, message: error.message })
    }
}

export const markInterest = async (req: Request, res: Response) => {
    const validation = validateRequest(opportunityIdParamSchema, { params: req.params })
    if (!validation.success) return res.status(400).json({ success: false, errors: validation.errors })

    try {
        const interaction = await StudentOpportunityService.markInterested(req.user!.userId, req.params.opportunityId as string)
        res.status(200).json({ success: true, message: "Interest recorded", data: interaction })
    } catch (error: any) {
        const status = error.message === "Opportunity not found" ? 404 : 500
        res.status(status).json({ success: false, message: error.message })
    }
}

export const getInterested = async (req: Request, res: Response) => {
    try {
        const data = await StudentOpportunityService.getInterestedOpportunities(req.user!.userId)
        res.status(200).json({ success: true, data })
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message })
    }
}

export const confirmParticipation = async (req: Request, res: Response) => {
    const validation = validateRequest(participationBodySchema, { params: req.params, body: req.body })
    if (!validation.success) return res.status(400).json({ success: false, errors: validation.errors })

    try {
        const result = await StudentOpportunityService.confirmParticipation(req.user!.userId, req.params.opportunityId as string, req.body.participated)
        res.status(200).json({ success: true, message: "Participation confirmed", data: result })
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message })
    }
}

export const submitFeedback = async (req: Request, res: Response) => {
    const validation = validateRequest(feedbackBodySchema, { params: req.params, body: req.body })
    if (!validation.success) return res.status(400).json({ success: false, errors: validation.errors })

    try {
        const result = await StudentOpportunityService.submitFeedback(req.user!.userId, req.params.opportunityId as string, req.body)
        res.status(200).json({ success: true, message: "Feedback submitted and hours awarded", data: result })
    } catch (error: any) {
        res.status(400).json({ success: false, message: error.message })
    }
}

export const getPending = async (req: Request, res: Response) => {
    try {
        const data = await StudentOpportunityService.getPendingActions(req.user!.userId)
        res.status(200).json({ success: true, data })
    } catch (error: any) {
        res.status(500).json({ success: false, message: error.message })
    }
}
