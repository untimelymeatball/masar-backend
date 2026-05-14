import "dotenv/config";
import bcrypt from "bcrypt";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  Role,
  ProviderType,
  WorkMode,
  OpportunityType,
  CompanyVerificationStatus,
  ProviderAccountStatus,
} from "../src/generated/prisma/enums";
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

  // ── 0. Upsert Admin Users ──────────────────────────────────────────────
  console.log("0/9 Seeding admin users...");
  const hashedPassword = await bcrypt.hash("admin1234", 12);

  await prisma.user.upsert({
    where: { email: "mohammad@masar.com" },
    update: {},
    create: {
      username: "mohammad",
      email: "mohammad@masar.com",
      password: hashedPassword,
      role: Role.ADMIN
    }
  });

  await prisma.user.upsert({
    where: { email: "lina@masar.com" },
    update: {},
    create: {
      username: "lina",
      email: "lina@masar.com",
      password: hashedPassword,
      role: Role.ADMIN
    }
  });
  console.log("   ✅ Admin users seeded\n");

  // ── 1. Upsert Tags ─────────────────────────────────────────────────────
  console.log("1/9 Seeding tags...");
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
  console.log("2/9 Seeding assessment...");

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
      isActive: true,
    },
  });
  console.log(`   ✅ Assessment created: "${assessment.title}" (${assessment.id})\n`);

  // ── 3. Create Questions, Options, and Option-Tag weights ───────────────
  console.log("3/9 Seeding questions & options...");
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
  console.log("4/9 Seeding career paths & traits...");

  // Clear existing career traits for idempotency (delete in dependency order)
  await prisma.careerTrait.deleteMany({});
  await prisma.userRoadmapTaskProgress.deleteMany({});
  await prisma.userRoadmapItemProgress.deleteMany({});
  await prisma.roadmapTask.deleteMany({});
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
  console.log("5/9 Seeding roadmap topics...");

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
  console.log("6/9 Seeding career roadmap items...");
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
  console.log("7/9 Seeding onboarding objectives...");

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

  // ── 8. Generate Default Roadmap Tasks ─────────────────────────────────
  console.log("8/9 Seeding roadmap tasks...");

  // Clear existing tasks for idempotency (delete progress first due to FK)
  await prisma.userRoadmapTaskProgress.deleteMany({});
  await prisma.userRoadmapItemProgress.deleteMany({});
  await prisma.roadmapTask.deleteMany({});

  // Fetch all roadmap items with their topic names
  const allRoadmapItems = await prisma.careerRoadmapItem.findMany({
    include: { topic: true },
    orderBy: [{ careerId: "asc" }, { order: "asc" }]
  });

  let taskCount = 0;
  for (const item of allRoadmapItems) {
    const topicName = item.topic.name;

    const defaultTasks = [
      { title: `Complete learning material for ${topicName}`, order: 1 },
      { title: `Complete practice exercise for ${topicName}`, order: 2 },
      { title: `Mark ${topicName} as understood`, order: 3 }
    ];

    for (const task of defaultTasks) {
      await prisma.roadmapTask.create({
        data: {
          roadmapItemId: item.id,
          title: task.title,
          order: task.order
        }
      });
      taskCount++;
    }
  }
  console.log(`   ✅ ${taskCount} roadmap tasks seeded (${allRoadmapItems.length} items × 3 tasks)\n`);

  // ── 9. Seed Jordan Providers & Opportunities ──────────────────────────
  console.log("9/9 Seeding Jordan opportunities...");

  const providerPassword = await bcrypt.hash("provider1234", 12);

  // Provider 1: Aramex
  const aramexUser = await prisma.user.upsert({
    where: { email: "careers@aramex.com" },
    update: {},
    create: {
      username: "aramex_jordan",
      email: "careers@aramex.com",
      password: providerPassword,
      role: Role.PROVIDER,
      isEmailVerified: true,
    },
  });

  const aramexProfile = await prisma.providerProfile.upsert({
    where: { userId: aramexUser.id },
    update: {},
    create: {
      userId: aramexUser.id,
      providerType: ProviderType.COMPANY,
      organizationName: "Aramex Jordan",
      firstName: "Omar",
      lastName: "Al-Rashid",
      phone: "+962 6 510 7070",
      email: "careers@aramex.com",
      location: "Amman, Jordan",
      website: "https://www.aramex.com",
      description:
        "Aramex is a leading global provider of comprehensive logistics and transportation solutions. Our Amman headquarters drives innovation in supply chain and last-mile delivery across the MENA region.",
      verificationStatus: CompanyVerificationStatus.VERIFIED,
      accountStatus: ProviderAccountStatus.ACTIVE,
    },
  });

  // Provider 2: Zain Jordan
  const zainUser = await prisma.user.upsert({
    where: { email: "internships@jo.zain.com" },
    update: {},
    create: {
      username: "zain_jordan",
      email: "internships@jo.zain.com",
      password: providerPassword,
      role: Role.PROVIDER,
      isEmailVerified: true,
    },
  });

  const zainProfile = await prisma.providerProfile.upsert({
    where: { userId: zainUser.id },
    update: {},
    create: {
      userId: zainUser.id,
      providerType: ProviderType.COMPANY,
      organizationName: "Zain Jordan",
      firstName: "Rania",
      lastName: "Khalil",
      phone: "+962 7 9000 0000",
      email: "internships@jo.zain.com",
      location: "Amman, Jordan",
      website: "https://www.zain.com/jo",
      description:
        "Zain Jordan is the country's leading mobile telecom operator, driving digital transformation through 5G, IoT, and cloud services across the Kingdom.",
      verificationStatus: CompanyVerificationStatus.VERIFIED,
      accountStatus: ProviderAccountStatus.ACTIVE,
    },
  });

  // Provider 3: Royal Scientific Society
  const rssUser = await prisma.user.upsert({
    where: { email: "training@rss.gov.jo" },
    update: {},
    create: {
      username: "rss_jordan",
      email: "training@rss.gov.jo",
      password: providerPassword,
      role: Role.PROVIDER,
      isEmailVerified: true,
    },
  });

  const rssProfile = await prisma.providerProfile.upsert({
    where: { userId: rssUser.id },
    update: {},
    create: {
      userId: rssUser.id,
      providerType: ProviderType.TRAINING_CENTER,
      organizationName: "Royal Scientific Society",
      firstName: "Khaled",
      lastName: "Mansour",
      phone: "+962 6 535 7000",
      email: "training@rss.gov.jo",
      location: "Amman, Jordan",
      website: "https://www.rss.gov.jo",
      description:
        "The Royal Scientific Society is Jordan's leading applied research and industrial services center, fostering innovation and technical education across the Kingdom since 1970.",
      verificationStatus: CompanyVerificationStatus.VERIFIED,
      accountStatus: ProviderAccountStatus.ACTIVE,
    },
  });

  // Idempotency: delete existing opportunities for these providers before recreating
  const seededProviderIds = [aramexProfile.id, zainProfile.id, rssProfile.id];
  const existingOpps = await prisma.opportunity.findMany({
    where: { providerId: { in: seededProviderIds } },
    select: { id: true },
  });
  const existingOppIds = existingOpps.map((o) => o.id);

  if (existingOppIds.length > 0) {
    await prisma.feedback.deleteMany({ where: { opportunityId: { in: existingOppIds } } });
    await prisma.studentOpportunityInteraction.deleteMany({ where: { opportunityId: { in: existingOppIds } } });
    await prisma.opportunityApplication.deleteMany({ where: { opportunityId: { in: existingOppIds } } });
    await prisma.opportunityFeedback.deleteMany({ where: { opportunityId: { in: existingOppIds } } });
    await prisma.practicalHourEvent.deleteMany({ where: { opportunityId: { in: existingOppIds } } });
    await prisma.report.deleteMany({ where: { opportunityId: { in: existingOppIds } } });
    await prisma.opportunity.deleteMany({ where: { providerId: { in: seededProviderIds } } });
  }

  const opportunitiesData = [
    // Aramex
    {
      providerId: aramexProfile.id,
      title: "Software Engineering Intern",
      type: OpportunityType.INTERNSHIP,
      workMode: WorkMode.ONSITE,
      location: "Amman, Jordan",
      description:
        "Join Aramex's engineering team in Amman for a hands-on internship building internal tools and logistics automation systems. You will work alongside senior engineers on real production features spanning the full stack.",
      expectedHours: 160,
      capacity: 5,
      deadline: new Date("2026-07-01"),
      startDate: new Date("2026-07-15"),
      endDate: new Date("2026-09-15"),
      isApproved: true,
      isPublished: true,
    },
    {
      providerId: aramexProfile.id,
      title: "Logistics Tech Innovation Workshop",
      type: OpportunityType.WORKSHOP,
      workMode: WorkMode.ONSITE,
      location: "Amman, Jordan",
      description:
        "A two-day intensive workshop exploring how emerging technologies — AI route optimization, real-time tracking, and drone delivery — are reshaping the logistics industry. Includes hands-on labs and a case study competition.",
      expectedHours: 16,
      capacity: 30,
      deadline: new Date("2026-06-10"),
      startDate: new Date("2026-06-20"),
      endDate: new Date("2026-06-21"),
      isApproved: true,
      isPublished: true,
    },
    // Zain Jordan
    {
      providerId: zainProfile.id,
      title: "Mobile App Development Intern",
      type: OpportunityType.INTERNSHIP,
      workMode: WorkMode.HYBRID,
      location: "Amman, Jordan",
      description:
        "Work with Zain Jordan's digital products team to design, build, and ship features for Zain's consumer-facing Android and iOS apps. You will participate in sprint planning, code reviews, and user-testing sessions.",
      expectedHours: 200,
      capacity: 3,
      deadline: new Date("2026-06-20"),
      startDate: new Date("2026-07-01"),
      endDate: new Date("2026-09-30"),
      isApproved: true,
      isPublished: true,
    },
    {
      providerId: zainProfile.id,
      title: "Cybersecurity Awareness Workshop",
      type: OpportunityType.WORKSHOP,
      workMode: WorkMode.ONSITE,
      location: "Amman, Jordan",
      description:
        "A one-day workshop covering practical cybersecurity fundamentals: threat modeling, social engineering defense, secure coding basics, and incident response. Delivered by Zain Jordan's internal security team.",
      expectedHours: 8,
      capacity: 50,
      deadline: new Date("2026-05-28"),
      startDate: new Date("2026-06-07"),
      endDate: new Date("2026-06-07"),
      isApproved: true,
      isPublished: true,
    },
    // Royal Scientific Society
    {
      providerId: rssProfile.id,
      title: "Data Science with Python",
      type: OpportunityType.COURSE,
      workMode: WorkMode.ONLINE,
      location: null,
      description:
        "A six-week online course covering the full data science workflow: data wrangling with Pandas, exploratory analysis, machine learning with scikit-learn, and data visualization. Includes weekly live Q&A sessions with RSS instructors.",
      expectedHours: 60,
      capacity: 100,
      deadline: new Date("2026-07-05"),
      startDate: new Date("2026-07-15"),
      endDate: new Date("2026-08-25"),
      isApproved: true,
      isPublished: true,
    },
    {
      providerId: rssProfile.id,
      title: "Community Tech Education Volunteer",
      type: OpportunityType.VOLUNTEERING,
      workMode: WorkMode.ONSITE,
      location: "Zarqa, Jordan",
      description:
        "Volunteer with RSS to deliver digital literacy and basic coding workshops to school students in Zarqa governorate. Volunteers will be trained in the curriculum beforehand and supported throughout by RSS education coordinators.",
      expectedHours: 80,
      capacity: 20,
      deadline: new Date("2026-06-05"),
      startDate: new Date("2026-06-20"),
      endDate: new Date("2026-08-20"),
      isApproved: true,
      isPublished: true,
    },
  ];

  for (const opp of opportunitiesData) {
    await prisma.opportunity.create({ data: opp });
  }

  console.log(`   ✅ 3 providers and ${opportunitiesData.length} opportunities seeded\n`);

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
  console.log(`   Tasks:         ${taskCount}`);
  console.log(`   Opportunities: ${opportunitiesData.length}`);
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
