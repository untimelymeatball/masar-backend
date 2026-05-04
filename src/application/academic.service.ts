import { prisma } from "../infrastructure/prisma";
import crypto from "crypto" // node module to generate a random string for affiliation code

// This file contains features related to users with the "ACADEMIC" role
// route handlers in routes/academic.routes.ts call the corresponding function

// getProfile takes userId as a parameter and queries AcademicProfile in the
// db, it returns a profile if found and throws an error if the profile
// is no found
async function getProfile(userId: string) {
    // find the profile in question
    const profile = await prisma.academicProfile.findUnique({
        where: {userId: userId} // can be shorthanded to { userId }
    })
    // throw error if profile not found
    if (!profile)
        return null

    // return the profile is it exists
    return profile
}

// updateProfile uses the PUT method to either set up the profile for the 
// first time, or update the fields
async function updateProfile(userId: string, data: { phone: string, profilePicture?: string, bio?: string, firstName: string, lastName: string, university: string, department: string, role: string }) {
    // find the profile in question and upsert
    const profile = await prisma.academicProfile.upsert({
        where: { userId }, // finds the record
        update: data, // updates data
        create: { userId, ...data} // inserts new row if not found
    })

    return profile
}

// generateAffiliationCode is tasked with generating a random 8 character code
// and then store it on the academic's profile then return the code
async function generateAffiliationCode(userId: string) {
    
    // check if the profile exists
    const existing = await prisma.academicProfile.findUnique({ where: { userId } })
    if (!existing)
        throw new Error("Profile not found. Complete your profile setup before generating an affiliation code.")

    
    // generate random 8 character code
    const affiliationCode = crypto.randomBytes(4).toString("hex")
    
    
    // find the profile and update, upsert would create an empty profile (row)
    await prisma.academicProfile.update({
        where: { userId },
        data: { affiliationCode }
    })

    return affiliationCode
}

// getStudents returns all StudentProfile records where academicId matches
// the academic's profile id, it should first find the academics profile
// then it queries StudentProfile where academicId === that id
async function getStudents(userId: string) {
    
    // find the academic profile
    const profile = await prisma.academicProfile.findUnique({
        where: { userId }
    })
    if (!profile)
        throw new Error("Profile not found. Complete your profile setup before moving further.")

    // find the student profiles where academicId matches
    const students = await prisma.studentProfile.findMany({
        where: { academicId : profile.id }
    })

    return students
}

// getStudentAnalytics returns the activity of a specific student for
// viewing by the academic. First we need to find the academics profile
// and verify that the student belongs to the academic, if the verification
// fails then either the student doesnt exist or they dont belong to this 
// academic, so we throw an error. Then we return the student with their 
// activity
async function getStudentAnalytics(userId: string, studentId: string) {

    // find the academic profile
    const profile = await prisma.academicProfile.findUnique({
        where: { userId }
    })
    if (!profile)
        throw new Error("Profile not found. Complete your profile setup before moving further.")

    // find the student and verify ownership
    const student = await prisma.studentProfile.findFirst({
        where: { id: studentId, academicId: profile.id },
        include: { roadmapEnrollments: true, applications: true }
    })

    if (!student)
        throw new Error("Student not found or not affiliated with your account.")

    return student
}



export { getProfile, updateProfile, generateAffiliationCode, getStudents, getStudentAnalytics }