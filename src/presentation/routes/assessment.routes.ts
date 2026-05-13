// This file defines the HTTP endpoint for submitting assessment answers
// and receiving career match recommendations.
//
// POST /:assessmentId/submit
//   Request body: { userId?: string, answers: [{ questionId, optionId }] }
//   Response: { profile: {...}, topCareers: [...] }

import { Router } from "express";
import { submitAssessment } from "../../application/assessment.service";

const router = Router();

// POST /api/assessments/:assessmentId/submit
router.post("/:assessmentId/submit", async (req, res) => {
  try {
    const { assessmentId } = req.params;

    // ── Request body validation ──────────────────────────────────────────
    const { userId, answers } = req.body;

    if (!answers || !Array.isArray(answers) || answers.length === 0) {
      res.status(400).json({
        error: "Request body must include a non-empty 'answers' array",
      });
      return;
    }

    // Validate each answer has required fields
    for (let i = 0; i < answers.length; i++) {
      const answer = answers[i];
      if (!answer.questionId || typeof answer.questionId !== "string") {
        res.status(400).json({
          error: `Answer at index ${i} is missing a valid 'questionId'`,
        });
        return;
      }
      if (!answer.optionId || typeof answer.optionId !== "string") {
        res.status(400).json({
          error: `Answer at index ${i} is missing a valid 'optionId'`,
        });
        return;
      }
    }

    // ── Call service ─────────────────────────────────────────────────────
    const result = await submitAssessment(
      assessmentId!,
      userId ?? null,
      answers
    );

    res.status(200).json(result);
  } catch (error: any) {
    // Distinguish validation errors from unexpected errors
    const isValidationError = [
      "Assessment not found",
      "Duplicate question answers",
      "does not belong to",
    ].some((msg) => error.message?.includes(msg));

    if (isValidationError) {
      res.status(400).json({ error: error.message });
    } else {
      console.error("Assessment submission error:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  }
});

export { router };
