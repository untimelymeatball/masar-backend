import { PrismaClient } from "../generated/prisma/client"
import { PrismaPg } from "@prisma/adapter-pg"

// PrismaClient is the object we use to run queries, we will create a single
// instance of PrismaClient (singleton) so that it's a shared connection
// between all the files that need it
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
export const prisma = new PrismaClient({adapter})

// The adapter was needed since Prisma doesn't read the database URL
// automatically, we need to explicitly hand it a "driver adapter" which
// is the thing that knows how to open and manage connections to a specific
// database type. PrismaPg is the PostgreSQL one.