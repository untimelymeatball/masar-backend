import { prisma } from "../infrastructure/prisma";

// ─── Types ──────────────────────────────────────────────────────────────────

/** A single answer: which option the user picked for which question */
interface AnswerInput {
  questionId: string;
  optionId: string;
}

/** Tag scores keyed by the tag's camelCase key */
interface TagScores {
  [tagKey: string]: number;
}

/** A single career match result returned to the client */
interface CareerMatchResult {
  careerId: string;
  careerName: string;
  matchPercentage: number;
  reasons: string[];
  roadmap: string[];
}

/** The full response returned from submitAssessment */
interface AssessmentResult {
  profile: TagScores;
  topCareers: CareerMatchResult[];
}

// ─── 1. calculateRawTagScores ───────────────────────────────────────────────
// For each selected option, sum up the weighted tag scores
async function calculateRawTagScores(
  answers: AnswerInput[]
): Promise<TagScores> {
  const rawScores: TagScores = {};

  // Fetch all selected options with their tag weights in one query
  const optionIds = answers.map((a) => a.optionId);

  const optionsWithTags = await prisma.assessmentOption.findMany({
    where: { id: { in: optionIds } },
    include: {
      tags: {
        include: {
          tag: true, // includes the Tag record with label and key
        },
      },
    },
  });

  for (const option of optionsWithTags) {
    for (const optionTag of option.tags) {
      const key = optionTag.tag.key;
      rawScores[key] = (rawScores[key] ?? 0) + optionTag.weight;
    }
  }

  return rawScores;
}

// ─── 2. calculateMaxPossibleScores ──────────────────────────────────────────
// For each tag, calculate the maximum possible score by summing the highest
// weight available for that tag from each question
async function calculateMaxPossibleScores(
  assessmentId: string
): Promise<TagScores> {
  const maxScores: TagScores = {};

  // Fetch all questions with their options and tag weights
  const questions = await prisma.assessmentQuestion.findMany({
    where: { assessmentId },
    include: {
      options: {
        include: {
          tags: {
            include: {
              tag: true,
            },
          },
        },
      },
    },
  });

  for (const question of questions) {
    // For each question, find the max weight per tag across all options
    const questionMaxPerTag: TagScores = {};

    for (const option of question.options) {
      for (const optionTag of option.tags) {
        const key = optionTag.tag.key;
        const currentMax = questionMaxPerTag[key] ?? 0;
        if (optionTag.weight > currentMax) {
          questionMaxPerTag[key] = optionTag.weight;
        }
      }
    }

    // Add this question's max contributions to the global max
    for (const [key, maxWeight] of Object.entries(questionMaxPerTag)) {
      maxScores[key] = (maxScores[key] ?? 0) + maxWeight;
    }
  }

  return maxScores;
}

// ─── 3. normalizeScores ─────────────────────────────────────────────────────
// Scale each raw tag score to a 0–5 range:
// normalizedScore = (rawScore / maxPossibleTagScore) * 5
function normalizeScores(
  rawScores: TagScores,
  maxScores: TagScores
): TagScores {
  const normalized: TagScores = {};

  // Get all tag keys from maxScores (ensures we include tags with 0 raw score)
  const allKeys = new Set([
    ...Object.keys(rawScores),
    ...Object.keys(maxScores),
  ]);

  for (const key of allKeys) {
    const raw = rawScores[key] ?? 0;
    const max = maxScores[key] ?? 0;

    if (max === 0) {
      normalized[key] = 0;
    } else {
      // Round to 1 decimal place for clean output
      normalized[key] = Math.round((raw / max) * 5 * 10) / 10;
    }
  }

  return normalized;
}

// ─── 4. calculateCareerMatch ────────────────────────────────────────────────
// Compare a student's normalized profile against a single career's trait profile
// using the weighted difference formula from the spec
function calculateCareerMatch(
  studentProfile: TagScores,
  careerTraits: { key: string; value: number }[]
): number {
  let weightedMatchSum = 0;
  let importanceSum = 0;

  for (const trait of careerTraits) {
    const studentValue = studentProfile[trait.key] ?? 0;
    const careerValue = trait.value;

    // How close is the student to this trait requirement (0–5 scale)
    const difference = Math.abs(studentValue - careerValue);
    const match = Math.max(0, 5 - difference);

    // Career trait value as importance weight; minimum 1 to avoid ignoring traits
    const importance = Math.max(1, careerValue);

    weightedMatchSum += match * importance;
    importanceSum += importance;
  }

  if (importanceSum === 0) return 0;

  const careerMatch = weightedMatchSum / importanceSum;
  const matchPercentage = Math.round((careerMatch / 5) * 100);

  return matchPercentage;
}

// ─── 5. generateCareerReasons ───────────────────────────────────────────────
// For each top career, compare the student's strongest traits with the
// career's strongest required traits. Return 3–5 reasons.
function generateCareerReasons(
  studentProfile: TagScores,
  careerTraits: { key: string; value: number; label: string }[]
): string[] {
  const reasons: string[] = [];

  // Sort career traits by value descending (most important first)
  const sortedTraits = [...careerTraits].sort((a, b) => b.value - a.value);

  for (const trait of sortedTraits) {
    if (reasons.length >= 5) break;

    const studentValue = studentProfile[trait.key] ?? 0;

    // Strong match: career requires ≥ 4 AND student has ≥ 4
    if (trait.value >= 4 && studentValue >= 4) {
      reasons.push(`Strong match in ${trait.label}`);
    }
    // Good match: career requires ≥ 3 AND student has ≥ 3
    else if (trait.value >= 3 && studentValue >= 3 && reasons.length < 4) {
      reasons.push(`Good match in ${trait.label}`);
    }
  }

  // If we have fewer than 3 reasons, add some based on closest alignment
  if (reasons.length < 3) {
    for (const trait of sortedTraits) {
      if (reasons.length >= 3) break;

      const studentValue = studentProfile[trait.key] ?? 0;
      const difference = Math.abs(studentValue - trait.value);
      const reason = `Your ${trait.label} aligns with this career`;

      if (difference <= 1.5 && trait.value >= 2 && !reasons.includes(reason)) {
        reasons.push(reason);
      }
    }
  }

  return reasons.slice(0, 5);
}

// ─── 6. submitAssessment (Orchestrator) ──────────────────────────────────────
// Validates input → computes scores → matches careers → saves result → returns
async function submitAssessment(
  assessmentId: string,
  userId: string | null,
  answers: AnswerInput[]
): Promise<AssessmentResult> {
  // ── Validation ──────────────────────────────────────────────────────────

  // 1. Assessment must exist
  const assessment = await prisma.assessment.findUnique({
    where: { id: assessmentId },
    include: {
      questions: {
        include: {
          options: true,
        },
      },
    },
  });

  if (!assessment) {
    throw new Error("Assessment not found");
  }

  // 2. Check for duplicate questionIds in answers
  const questionIds = answers.map((a) => a.questionId);
  const uniqueQuestionIds = new Set(questionIds);
  if (uniqueQuestionIds.size !== questionIds.length) {
    throw new Error("Duplicate question answers detected. Each question can only be answered once.");
  }

  // 3. Validate each answer: questionId belongs to assessment, optionId belongs to question
  const assessmentQuestionIds = new Set(assessment.questions.map((q) => q.id));

  for (const answer of answers) {
    if (!assessmentQuestionIds.has(answer.questionId)) {
      throw new Error(
        `Question "${answer.questionId}" does not belong to this assessment`
      );
    }

    const question = assessment.questions.find((q) => q.id === answer.questionId);
    const validOptionIds = new Set(question!.options.map((o) => o.id));

    if (!validOptionIds.has(answer.optionId)) {
      throw new Error(
        `Option "${answer.optionId}" does not belong to question "${answer.questionId}"`
      );
    }
  }

  // ── Compute Scores ─────────────────────────────────────────────────────

  const rawScores = await calculateRawTagScores(answers);
  const maxScores = await calculateMaxPossibleScores(assessmentId);
  const normalizedScores = normalizeScores(rawScores, maxScores);

  // ── Match Careers ──────────────────────────────────────────────────────

  // Fetch all career paths with their traits and roadmap items
  const careers = await prisma.careerPath.findMany({
    include: {
      traits: {
        include: {
          tag: true,
        },
      },
      roadmapItems: {
        include: {
          topic: true,
        },
        orderBy: {
          order: "asc",
        },
      },
    },
  });

  // Calculate match for each career
  const careerMatches: CareerMatchResult[] = careers.map((career) => {
    const traitData = career.traits.map((t) => ({
      key: t.tag.key,
      value: t.value,
      label: t.tag.label,
    }));

    const matchPercentage = calculateCareerMatch(normalizedScores, traitData);
    const reasons = generateCareerReasons(normalizedScores, traitData);
    const roadmap = career.roadmapItems.map((item) => item.topic.name);

    return {
      careerId: career.id,
      careerName: career.name,
      matchPercentage,
      reasons,
      roadmap,
    };
  });

  // Sort by match percentage descending and take top 5
  careerMatches.sort((a, b) => b.matchPercentage - a.matchPercentage);
  const topCareers = careerMatches.slice(0, 5);

  // ── Save Result ────────────────────────────────────────────────────────

  await prisma.userAssessmentResult.create({
    data: {
      userId: userId,
      assessmentId,
      rawScores: rawScores as any,
      normalizedScores: normalizedScores as any,
      careerMatches: topCareers as any,
    },
  });

  // ── Return ─────────────────────────────────────────────────────────────

  return {
    profile: normalizedScores,
    topCareers,
  };
}

// ─── Exports ─────────────────────────────────────────────────────────────────
export {
  calculateRawTagScores,
  calculateMaxPossibleScores,
  normalizeScores,
  calculateCareerMatch,
  generateCareerReasons,
  submitAssessment,
};

export type { AnswerInput, TagScores, CareerMatchResult, AssessmentResult };
