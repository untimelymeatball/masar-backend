import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import assessmentData from "./data/assessment.json";
import careersData from "./data/careers.json";

// ─── Prisma Client Setup ────────────────────────────────────────────────────
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

// ─── Tag label → camelCase key mapping ──────────────────────────────────────
// Maps the human-readable tag labels from assessment.json to camelCase keys
// used as JSON property names in score profiles
const TAG_KEY_MAP: Record<string, string> = {
  "Coding Intensity": "codingIntensity",
  "Math Level": "mathLevel",
  "Creativity": "creativity",
  "System Design": "systemDesign",
  "User Interaction": "userInteraction",
  "Infrastructure/Systems": "infrastructureSystems",
  "Security Focus": "securityFocus",
  "Data/AI Focus": "dataAiFocus",
  "Hardware Interaction": "hardwareInteraction",
  "Debugging/Testing": "debuggingTesting",
  "Collaboration/Communication": "collaborationCommunication",
};

// ─── Slug helper ────────────────────────────────────────────────────────────
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// ─── Main seed function ─────────────────────────────────────────────────────
async function main() {
  console.log("🌱 Starting seed...\n");

  // ── 1. Upsert Tags ─────────────────────────────────────────────────────
  console.log("1/7 Seeding tags...");
  const tagRecords: Record<string, string> = {}; // label → id

  for (const label of assessmentData.tags) {
    const key = TAG_KEY_MAP[label];
    if (!key) {
      throw new Error(`No key mapping found for tag: "${label}"`);
    }

    const tag = await prisma.tag.upsert({
      where: { label },
      update: { key },
      create: { label, key },
    });
    tagRecords[label] = tag.id;
  }
  console.log(`   ✅ ${Object.keys(tagRecords).length} tags seeded\n`);

  // ── 2. Create Assessment ───────────────────────────────────────────────
  console.log("2/7 Seeding assessment...");

  // Delete existing assessment data for idempotency
  // (delete in reverse dependency order)
  await prisma.assessmentOptionTag.deleteMany({});
  await prisma.studentAssessmentAnswer.deleteMany({});
  await prisma.assessmentOption.deleteMany({});
  await prisma.assessmentQuestion.deleteMany({});
  await prisma.userAssessmentResult.deleteMany({});
  await prisma.assessment.deleteMany({});

  const assessment = await prisma.assessment.create({
    data: {
      title: "Career Discovery Assessment",
      description:
        "Discover which tech career path best matches your natural strengths, interests, and thinking style.",
    },
  });
  console.log(`   ✅ Assessment created: "${assessment.title}" (${assessment.id})\n`);

  // ── 3. Create Questions, Options, and Option-Tag weights ───────────────
  console.log("3/7 Seeding questions & options...");
  let questionCount = 0;
  let optionCount = 0;

  for (let qi = 0; qi < assessmentData.questions.length; qi++) {
    const qData = assessmentData.questions[qi]!;

    const question = await prisma.assessmentQuestion.create({
      data: {
        assessmentId: assessment.id,
        question: qData.question,
        order: qi + 1,
      },
    });
    questionCount++;

    for (let oi = 0; oi < qData.options.length; oi++) {
      const optData = qData.options[oi]!;

      const option = await prisma.assessmentOption.create({
        data: {
          questionId: question.id,
          option: optData.text,
          order: oi + 1,
        },
      });
      optionCount++;

      // Create option-tag weight entries
      for (const tagWeight of optData.tags) {
        const tagId = tagRecords[tagWeight.name];
        if (!tagId) {
          throw new Error(
            `Tag "${tagWeight.name}" referenced in question ${qi + 1}, option ${oi + 1} not found in tag records`
          );
        }

        await prisma.assessmentOptionTag.create({
          data: {
            optionId: option.id,
            tagId: tagId,
            weight: tagWeight.weight,
          },
        });
      }
    }
  }
  console.log(`   ✅ ${questionCount} questions and ${optionCount} options seeded\n`);

  // ── 4. Upsert Career Paths with traits ─────────────────────────────────
  console.log("4/7 Seeding career paths & traits...");

  // Clear existing career traits for idempotency
  await prisma.careerTrait.deleteMany({});
  await prisma.careerRoadmapItem.deleteMany({});

  let careerCount = 0;
  let traitCount = 0;

  for (const careerData of careersData.careers) {
    const career = await prisma.careerPath.upsert({
      where: { name: careerData.name },
      update: {
        slug: careerData.slug,
      },
      create: {
        name: careerData.name,
        slug: careerData.slug,
      },
    });
    careerCount++;

    // Create career traits (the 0-5 matrix)
    for (const [traitKey, traitValue] of Object.entries(careerData.traits)) {
      // Find the tag by its key
      const tagLabel = Object.entries(TAG_KEY_MAP).find(
        ([, key]) => key === traitKey
      )?.[0];

      if (!tagLabel) {
        throw new Error(`No tag label found for trait key: "${traitKey}"`);
      }

      const tagId = tagRecords[tagLabel];
      if (!tagId) {
        throw new Error(`Tag record not found for label: "${tagLabel}"`);
      }

      await prisma.careerTrait.create({
        data: {
          careerId: career.id,
          tagId: tagId,
          value: traitValue as number,
        },
      });
      traitCount++;
    }
  }
  console.log(`   ✅ ${careerCount} careers and ${traitCount} traits seeded\n`);

  // ── 5. Upsert Roadmap Topics ───────────────────────────────────────────
  console.log("5/7 Seeding roadmap topics...");

  // Collect all unique topic names across all careers
  const allTopicNames = new Set<string>();
  for (const careerData of careersData.careers) {
    for (const topicName of careerData.roadmap) {
      allTopicNames.add(topicName);
    }
  }

  const topicRecords: Record<string, string> = {}; // name → id

  for (const topicName of allTopicNames) {
    const topic = await prisma.roadmapTopic.upsert({
      where: { name: topicName },
      update: {},
      create: {
        name: topicName,
        slug: slugify(topicName),
      },
    });
    topicRecords[topicName] = topic.id;
  }
  console.log(`   ✅ ${allTopicNames.size} roadmap topics seeded\n`);

  // ── 6. Create Career ↔ Roadmap Topic links ────────────────────────────
  console.log("6/7 Seeding career roadmap items...");
  let roadmapItemCount = 0;

  for (const careerData of careersData.careers) {
    // Get the career record by name
    const career = await prisma.careerPath.findUnique({
      where: { name: careerData.name },
    });
    if (!career) {
      throw new Error(`Career "${careerData.name}" not found`);
    }

    for (let i = 0; i < careerData.roadmap.length; i++) {
      const topicName = careerData.roadmap[i]!;
      const topicId = topicRecords[topicName];
      if (!topicId) {
        throw new Error(
          `Topic "${topicName}" for career "${careerData.name}" not found in topic records`
        );
      }

      await prisma.careerRoadmapItem.create({
        data: {
          careerId: career.id,
          topicId: topicId,
          order: i + 1,
        },
      });
      roadmapItemCount++;
    }
  }
  console.log(`   ✅ ${roadmapItemCount} career-roadmap links seeded\n`);

  // ── 7. Upsert Onboarding Objectives ──────────────────────────────────
  console.log("7/7 Seeding onboarding objectives...");

  const objectives = [
    { key: "improve_skills", label: "Opportunities to improve skills and practically apply them" },
    { key: "explore_careers", label: "Explore possible career paths" },
    { key: "track_progress", label: "Track progress" }
  ];

  for (const obj of objectives) {
    await prisma.onboardingObjective.upsert({
      where: { key: obj.key },
      update: { label: obj.label },
      create: { key: obj.key, label: obj.label }
    });
  }
  console.log(`   ✅ ${objectives.length} onboarding objectives seeded\n`);

  // ── Summary ────────────────────────────────────────────────────────────
  console.log("═══════════════════════════════════════════");
  console.log("🎉 Seed completed successfully!");
  console.log(`   Assessment ID: ${assessment.id}`);
  console.log(`   Tags:          ${Object.keys(tagRecords).length}`);
  console.log(`   Questions:     ${questionCount}`);
  console.log(`   Options:       ${optionCount}`);
  console.log(`   Careers:       ${careerCount}`);
  console.log(`   Traits:        ${traitCount}`);
  console.log(`   Topics:        ${allTopicNames.size}`);
  console.log(`   Roadmap Links: ${roadmapItemCount}`);
  console.log(`   Objectives:    ${objectives.length}`);
  console.log("═══════════════════════════════════════════");
}

// ─── Run ─────────────────────────────────────────────────────────────────────
main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error("❌ Seed failed:", e);
    await prisma.$disconnect();
    process.exit(1);
  });

