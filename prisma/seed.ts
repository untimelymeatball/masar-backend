// This file contains the admin profiles seeded into the database

import { prisma } from "../src/infrastructure/prisma";
import bcrypt from "bcrypt";
import { Role } from "../src/generated/prisma/enums";

async function main() {
    // hashes the plain text password before storing it
    const hashedPassword = await bcrypt.hash("admin1234", 12)

    await prisma.user.upsert({
        where: { email: "mohammad@masar.com" },
        update: {},
        create: {
            username: "mohammad",
            email: "mohammad@masar.com",
            password: hashedPassword,
            role: Role.ADMIN
        }
    })

    await prisma.user.upsert({
        where: { email: "lina@masar.com" },
        update: {},
        create: {
            username: "lina",
            email: "lina@masar.com",
            password: hashedPassword,
            role: Role.ADMIN
        }
    })

    console.log("Admin users seeded.")
}

main()
    .catch((e) => { console.error(e); process.exit(1) })
    .finally(async () => { await prisma.$disconnect() })
