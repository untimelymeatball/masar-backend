import "dotenv/config";
import { PrismaClient } from "../src/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import bcrypt from "bcrypt";

const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
});
const prisma = new PrismaClient({ adapter });

async function main() {
    console.log("🌱 Seeding test data...");

    const password = await bcrypt.hash("Password123!", 12);

    // 1. Students
    const student1 = await prisma.user.upsert({
        where: { email: "student1@example.com" },
        update: {},
        create: {
            email: "student1@example.com",
            username: "student1",
            password,
            role: "STUDENT",
            isEmailVerified: true,
            studentProfile: {
                create: {
                    firstName: "Test",
                    lastName: "Student 1",
                    studentId: "STU001",
                    phone: "1234567890",
                    province: "Riyadh",
                    birthdate: new Date("2000-01-01"),
                    major: "Software Engineering",
                    educationLevel: "Bachelor",
                    graduationYear: 2024,
                    onboardingStatus: "COMPLETED"
                }
            }
        }
    });

    const student2 = await prisma.user.upsert({
        where: { email: "student2@example.com" },
        update: {},
        create: {
            email: "student2@example.com",
            username: "student2",
            password,
            role: "STUDENT",
            isEmailVerified: true,
            studentProfile: {
                create: {
                    firstName: "Test",
                    lastName: "Student 2",
                    studentId: "STU002",
                    phone: "0987654321",
                    province: "Jeddah",
                    birthdate: new Date("2001-01-01"),
                    major: "Data Science",
                    educationLevel: "Bachelor",
                    graduationYear: 2025,
                    onboardingStatus: "COMPLETED"
                }
            }
        }
    });

    // 2. Providers
    const provider1User = await prisma.user.upsert({
        where: { email: "provider1@example.com" },
        update: {},
        create: {
            email: "provider1@example.com",
            username: "provider1",
            password,
            role: "PROVIDER",
            isEmailVerified: true,
            providerProfile: {
                create: {
                    organizationName: "Verified Corp",
                    providerType: "COMPANY",
                    firstName: "John",
                    lastName: "Doe",
                    phone: "1122334455",
                    email: "info@verifiedcorp.com",
                    description: "A verified test company.",
                    verificationStatus: "VERIFIED",
                    accountStatus: "ACTIVE"
                }
            }
        },
        include: { providerProfile: true }
    });

    const provider2User = await prisma.user.upsert({
        where: { email: "provider2@example.com" },
        update: {},
        create: {
            email: "provider2@example.com",
            username: "provider2",
            password,
            role: "PROVIDER",
            isEmailVerified: true,
            providerProfile: {
                create: {
                    organizationName: "Unverified Inc",
                    providerType: "TRAINING_CENTER",
                    firstName: "Jane",
                    lastName: "Smith",
                    phone: "5544332211",
                    email: "info@unverifiedinc.com",
                    description: "An unverified test center.",
                    verificationStatus: "PENDING",
                    accountStatus: "ACTIVE"
                }
            }
        },
        include: { providerProfile: true }
    });

    const provider3User = await prisma.user.upsert({
        where: { email: "provider3@example.com" },
        update: {},
        create: {
            email: "provider3@example.com",
            username: "provider3",
            password,
            role: "PROVIDER",
            isEmailVerified: true,
            providerProfile: {
                create: {
                    organizationName: "Banned Corp",
                    providerType: "COMPANY",
                    firstName: "Bad",
                    lastName: "Actor",
                    phone: "0000000000",
                    email: "info@banned.com",
                    description: "A suspended provider.",
                    verificationStatus: "VERIFIED",
                    accountStatus: "SUSPENDED"
                }
            }
        },
        include: { providerProfile: true }
    });

    // 3. Opportunities
    const provider1Id = provider1User.providerProfile!.id;

    // Past & Published
    await prisma.opportunity.create({
        data: {
            title: "Past Internship",
            description: "A past internship opportunity.",
            providerId: provider1Id,
            type: "INTERNSHIP",
            workMode: "ONSITE",
            expectedHours: 40,
            isApproved: true,
            isPublished: true,
            startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
            endDate: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
            deadline: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000)
        }
    });

    // Future & Published
    await prisma.opportunity.create({
        data: {
            title: "Future Workshop",
            description: "A future workshop opportunity.",
            providerId: provider1Id,
            type: "WORKSHOP",
            workMode: "ONLINE",
            expectedHours: 10,
            isApproved: true,
            isPublished: true,
            startDate: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000),
            endDate: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000),
            deadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
        }
    });

    // Unpublished
    await prisma.opportunity.create({
        data: {
            title: "Draft Post",
            description: "A draft opportunity.",
            providerId: provider1Id,
            type: "VOLUNTEERING",
            workMode: "HYBRID",
            expectedHours: 20,
            isApproved: false,
            isPublished: false
        }
    });

    console.log("✅ Test data seeded successfully.");
}

main()
    .catch((e) => {
        console.error(e);
        process.exit(1);
    })
    .finally(async () => {
        await prisma.$disconnect();
    });
