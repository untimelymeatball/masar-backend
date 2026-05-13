import "dotenv/config"
import app from "../app"
import http from "http"

const BASE = "http://localhost:4444"
const results: { test: string; status: string; note: string }[] = []
let TOKEN = ""
let PROVIDER_TOKEN = ""
let PAST_OPP_ID = ""
let FUTURE_OPP_ID = ""
let PROVIDER_ID = ""
let ASSESSMENT_ID = ""

function log(test: string, status: string, note = "") {
  const icon = status === "PASS" ? "✅" : status === "FAIL" ? "❌" : "⚠️"
  console.log(`${icon} ${test} — ${status}${note ? ": " + note : ""}`)
  results.push({ test, status, note })
}

async function req(method: string, path: string, body?: any, token?: string): Promise<{ status: number; data: any }> {
  const url = new URL(path, BASE)
  const headers: Record<string, string> = { "Content-Type": "application/json" }
  if (token) headers["Authorization"] = `Bearer ${token}`

  const res = await fetch(url.toString(), {
    method,
    headers,
    body: body ? JSON.stringify(body) : null,
  })
  let data: any
  try { data = await res.json() } catch { data = null }
  return { status: res.status, data }
}

async function runTests() {
  // ══════════════════════════════════════════════════════════════════════════
  // 1. AUTH
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ 1. AUTHENTICATION ═══")

  // Login as seeded student
  let r = await req("POST", "/auth/login", { email: "student1@example.com", password: "Password123!" })
  if (r.status === 200 && r.data?.token) {
    TOKEN = r.data.token
    log("Login as student1", "PASS")
  } else {
    log("Login as student1", "FAIL", JSON.stringify(r.data))
    return // Can't continue without token
  }

  // Login as provider (for 403 checks)
  r = await req("POST", "/auth/login", { email: "provider1@example.com", password: "Password123!" })
  if (r.status === 200 && r.data?.token) {
    PROVIDER_TOKEN = r.data.token
    log("Login as provider1", "PASS")
  } else {
    log("Login as provider1", "FAIL", JSON.stringify(r.data))
  }

  // Unauthenticated → 401
  r = await req("GET", "/api/students/me")
  log("Unauth GET /me → 401", r.status === 401 ? "PASS" : "FAIL", `got ${r.status}`)

  // Provider token → 403
  r = await req("GET", "/api/students/me", undefined, PROVIDER_TOKEN)
  log("Provider GET /me → 403", r.status === 403 ? "PASS" : "FAIL", `got ${r.status}`)

  // ══════════════════════════════════════════════════════════════════════════
  // 2. PROFILE
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ 2. PROFILE ═══")

  r = await req("GET", "/api/students/me", undefined, TOKEN)
  log("GET /me (dashboard profile)", r.status === 200 ? "PASS" : "FAIL", `status ${r.status}`)

  // Update profile enrichment to trigger profile completeness XP
  r = await req("PATCH", "/api/students/profile-enrichment", {
    interests: ["AI", "Web Dev"], hobbies: ["Reading"], talents: ["Problem Solving"]
  }, TOKEN)
  log("PATCH enrichment", r.status === 200 ? "PASS" : "FAIL", `status ${r.status}`)

  // Check gamification for PROFILE_COMPLETED XP
  r = await req("GET", "/api/students/me/gamification", undefined, TOKEN)
  const profileXp = r.data?.data?.recentXpEvents?.find((e: any) => e.sourceType === "PROFILE_COMPLETED")
  log("Profile completion XP awarded", profileXp ? "PASS" : "FAIL", profileXp ? `${profileXp.xpAmount} XP` : "no event found")

  // Update enrichment again — should NOT duplicate XP
  r = await req("PATCH", "/api/students/profile-enrichment", { interests: ["AI", "Web Dev", "ML"] }, TOKEN)
  r = await req("GET", "/api/students/me/gamification", undefined, TOKEN)
  const profileXpCount = r.data?.data?.recentXpEvents?.filter((e: any) => e.sourceType === "PROFILE_COMPLETED").length
  log("No duplicate profile XP", profileXpCount <= 1 ? "PASS" : "FAIL", `count: ${profileXpCount}`)

  // ══════════════════════════════════════════════════════════════════════════
  // 3. ASSESSMENT
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ 3. ASSESSMENT ═══")

  r = await req("GET", "/api/assessments/active", undefined, TOKEN)
  if (r.status === 200 && r.data?.id) {
    ASSESSMENT_ID = r.data.id
    log("GET active assessment", "PASS", `id=${ASSESSMENT_ID}, questions=${r.data.questionCount}`)
  } else {
    log("GET active assessment", "FAIL", JSON.stringify(r.data).slice(0, 200))
  }

  if (ASSESSMENT_ID) {
    // Start assessment — get questions
    r = await req("GET", `/api/assessments/${ASSESSMENT_ID}/start`, undefined, TOKEN)
    if (r.status === 200 && r.data?.assessment?.questions) {
      const questions = r.data.assessment.questions
      log("GET assessment/start", "PASS", `${questions.length} questions`)

      // Build answers: pick first option for each question
      const answers = questions.map((q: any) => ({
        questionId: q.id,
        optionId: q.options[0]?.id
      }))

      // Submit assessment
      r = await req("POST", `/api/assessments/${ASSESSMENT_ID}/submit`, {
        answers, skills: ["JavaScript", "TypeScript"], hobbies: ["Coding"]
      }, TOKEN)
      if (r.status === 200) {
        log("POST assessment/submit", "PASS", `resultId=${r.data?.resultId}`)
      } else {
        log("POST assessment/submit", "FAIL", JSON.stringify(r.data).slice(0, 200))
      }

      // Check assessment XP
      r = await req("GET", "/api/students/me/gamification", undefined, TOKEN)
      const assessXp = r.data?.data?.recentXpEvents?.find((e: any) => e.sourceType === "ASSESSMENT_COMPLETED")
      log("Assessment XP awarded", assessXp ? "PASS" : "FAIL")

      // Duplicate submit should fail
      r = await req("POST", `/api/assessments/${ASSESSMENT_ID}/submit`, {
        answers, skills: ["JavaScript"]
      }, TOKEN)
      log("Duplicate submit blocked", r.status === 409 ? "PASS" : "FAIL", `got ${r.status}`)
    } else if (r.status === 409) {
      log("GET assessment/start", "PASS", "Expected 409 (Assessment already completed in seed)")
    } else {
      log("GET assessment/start", "FAIL", `status ${r.status}`)
    }

    // Career recommendations
    r = await req("GET", "/api/students/me/career-recommendations/latest", undefined, TOKEN)
    log("GET career recommendations", r.status === 200 && r.data?.result?.careers ? "PASS" : "FAIL",
      r.data?.result?.careers ? `${r.data.result.careers.length} careers` : `status ${r.status}`)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 4. ROADMAPS
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ 4. ROADMAPS ═══")

  // Get recommendations to find valid slugs
  r = await req("GET", "/api/students/me/career-recommendations/latest", undefined, TOKEN)
  const careerSlugs = r.data?.result?.careers?.map((c: any) => c.slug) || []

  if (careerSlugs.length >= 2) {
    // Select 2 roadmaps
    r = await req("POST", "/api/students/me/selected-careers", { careerIds: [r.data.result.careers[0].careerId, r.data.result.careers[1].careerId] }, TOKEN)
    log("Select 2 roadmaps (by ID)", r.status === 200 ? "PASS" : "FAIL", `status ${r.status}`)

    // Try selecting 4 slugs
    const fourSlugs = careerSlugs.slice(0, 4)
    if (fourSlugs.length >= 4) {
      r = await req("POST", "/api/students/me/roadmaps/select", { careerSlugs: fourSlugs }, TOKEN)
      log("Select 4 roadmaps blocked", r.status === 400 ? "PASS" : "FAIL", `got ${r.status}`)
    } else {
      log("Select 4 roadmaps blocked", "BLOCKED", "not enough careers")
    }

    // Try duplicate slugs
    r = await req("POST", "/api/students/me/roadmaps/select", { careerSlugs: [careerSlugs[0], careerSlugs[0]] }, TOKEN)
    log("Duplicate slugs blocked", r.status === 400 ? "PASS" : "FAIL", `got ${r.status}`)

    // Select via slug
    r = await req("POST", "/api/students/me/roadmaps/select", { careerSlugs: careerSlugs.slice(0, 2) }, TOKEN)
    log("Select 2 roadmaps (by slug)", r.status === 200 ? "PASS" : "FAIL", `status ${r.status}`)

    // Get roadmaps
    r = await req("GET", "/api/students/me/roadmaps?format=slug", undefined, TOKEN)
    if (r.status === 200 && Array.isArray(r.data) && r.data.length > 0) {
      log("GET roadmaps (slug format)", "PASS", `${r.data.length} roadmaps`)

      // Complete a roadmap point
      const firstRoadmap = r.data[0]
      const firstPoint = firstRoadmap.roadmapItems?.[0]
      if (firstPoint) {
        r = await req("PATCH", `/api/students/me/roadmaps/${firstRoadmap.careerSlug}/points/${firstPoint.pointKey}`, { isCompleted: true }, TOKEN)
        log("Complete roadmap point", r.status === 200 ? "PASS" : "FAIL", `status ${r.status}`)

        // Duplicate completion — should not duplicate XP
        r = await req("PATCH", `/api/students/me/roadmaps/${firstRoadmap.careerSlug}/points/${firstPoint.pointKey}`, { isCompleted: true }, TOKEN)
        log("Duplicate completion (idempotent)", r.status === 200 ? "PASS" : "FAIL", `status ${r.status}`)
      }
    } else {
      log("GET roadmaps (slug format)", "FAIL", `status ${r.status}`)
    }
  } else {
    log("Roadmap tests", "BLOCKED", "no career slugs available")
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 5. OPPORTUNITIES
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ 5. OPPORTUNITIES ═══")

  r = await req("GET", "/api/students/me/opportunities", undefined, TOKEN)
  if (r.status === 200 && r.data?.data?.opportunities) {
    const opps = r.data.data.opportunities
    log("GET opportunities", "PASS", `${opps.length} found`)

    // Draft should not appear
    const hasDraft = opps.some((o: any) => o.title === "Draft Post")
    log("Draft not visible", !hasDraft ? "PASS" : "FAIL")

    // Find past and future opportunities
    const pastOpp = opps.find((o: any) => o.title === "Past Internship")
    const futureOpp = opps.find((o: any) => o.title === "Future Workshop")
    if (pastOpp) PAST_OPP_ID = pastOpp.id
    if (futureOpp) FUTURE_OPP_ID = futureOpp.id

    // Get opportunity detail
    if (PAST_OPP_ID) {
      r = await req("GET", `/api/students/me/opportunities/${PAST_OPP_ID}`, undefined, TOKEN)
      log("GET opportunity detail", r.status === 200 ? "PASS" : "FAIL", `status ${r.status}`)
    }

    // Mark interest
    if (PAST_OPP_ID) {
      r = await req("POST", `/api/students/me/opportunities/${PAST_OPP_ID}/interest`, {}, TOKEN)
      log("Mark interest", r.status === 200 ? "PASS" : "FAIL", `status ${r.status}`)

      // Duplicate interest (idempotent)
      r = await req("POST", `/api/students/me/opportunities/${PAST_OPP_ID}/interest`, {}, TOKEN)
      log("Duplicate interest (idempotent)", r.status === 200 ? "PASS" : "FAIL", `status ${r.status}`)

      PROVIDER_ID = pastOpp.provider?.id || ""
    }

    // Try confirming future opportunity → should fail
    if (FUTURE_OPP_ID) {
      r = await req("POST", `/api/students/me/opportunities/${FUTURE_OPP_ID}/interest`, {}, TOKEN)
      r = await req("POST", `/api/students/me/opportunities/${FUTURE_OPP_ID}/participation`, { participated: true }, TOKEN)
      log("Future participation blocked", r.status === 400 ? "PASS" : "FAIL", `got ${r.status}: ${r.data?.message}`)
    }

    // Confirm past participation
    if (PAST_OPP_ID) {
      r = await req("POST", `/api/students/me/opportunities/${PAST_OPP_ID}/participation`, { participated: true }, TOKEN)
      log("Confirm past participation", r.status === 200 ? "PASS" : "FAIL", `status ${r.status}`)

      // Feedback without participation first (try on future opp)
      // Already covered above

      // Submit feedback
      r = await req("POST", `/api/students/me/opportunities/${PAST_OPP_ID}/feedback`, {
        ratingOverall: 5, ratingContent: 4, ratingOrganization: 4, ratingCommunication: 5,
        comment: "Great experience!", isAnonymous: true
      }, TOKEN)
      log("Submit feedback", r.status === 200 ? "PASS" : "FAIL", `status ${r.status}`)

      // Duplicate feedback
      r = await req("POST", `/api/students/me/opportunities/${PAST_OPP_ID}/feedback`, {
        ratingOverall: 5, comment: "duplicate"
      }, TOKEN)
      log("Duplicate feedback blocked", r.status === 400 ? "PASS" : "FAIL", `got ${r.status}`)
    }
  } else {
    log("GET opportunities", "FAIL", `status ${r.status}`)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 6. PRACTICAL HOURS
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ 6. PRACTICAL HOURS ═══")

  r = await req("GET", "/api/students/me/practical-hours", undefined, TOKEN)
  log("GET practical hours", r.status === 200 ? "PASS" : "FAIL", `totalHours=${r.data?.data?.totalHours}`)

  r = await req("GET", "/api/students/me/practical-hours/summary", undefined, TOKEN)
  log("GET practical hours summary", r.status === 200 ? "PASS" : "FAIL", `level=${r.data?.data?.level}`)

  // ══════════════════════════════════════════════════════════════════════════
  // 7. GAMIFICATION
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ 7. GAMIFICATION ═══")

  r = await req("GET", "/api/students/me/gamification", undefined, TOKEN)
  log("GET gamification", r.status === 200 ? "PASS" : "FAIL", `xp=${r.data?.data?.xp?.totalXp}, level=${r.data?.data?.xp?.level}`)

  r = await req("GET", "/api/students/me/gamification/xp/events", undefined, TOKEN)
  log("GET XP events", r.status === 200 ? "PASS" : "FAIL", `count=${r.data?.data?.length}`)

  // Check for duplicate XP
  if (r.status === 200 && r.data?.data) {
    const events = r.data.data as any[]
    const sourceKeys = events.map((e: any) => `${e.sourceType}:${e.sourceId}`)
    const hasDupes = sourceKeys.length !== new Set(sourceKeys).size
    log("No duplicate XP events", !hasDupes ? "PASS" : "FAIL", hasDupes ? "DUPLICATES FOUND" : `${events.length} unique events`)
  }

  r = await req("GET", "/api/students/me/gamification/badges", undefined, TOKEN)
  log("GET badges", r.status === 200 ? "PASS" : "FAIL")

  // ══════════════════════════════════════════════════════════════════════════
  // 8. DASHBOARD
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ 8. DASHBOARD ═══")

  r = await req("GET", "/api/students/me/dashboard", undefined, TOKEN)
  if (r.status === 200 && r.data?.data) {
    const d = r.data.data
    log("GET dashboard", "PASS")
    log("Dashboard has profile", d.profile ? "PASS" : "FAIL")
    log("Dashboard has gamification", d.gamification ? "PASS" : "FAIL")
    log("Dashboard has roadmaps", d.roadmaps !== undefined ? "PASS" : "FAIL")
    log("Dashboard has practicalHours", d.practicalHours !== undefined ? "PASS" : "FAIL")
    log("Dashboard has recentActivity", d.recentActivity !== undefined ? "PASS" : "FAIL")
  } else {
    log("GET dashboard", "FAIL", `status ${r.status}: ${JSON.stringify(r.data).slice(0, 200)}`)
  }

  // ══════════════════════════════════════════════════════════════════════════
  // 9. RECENT ACTIVITY
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ 9. RECENT ACTIVITY ═══")

  r = await req("GET", "/api/students/me/recent-activity", undefined, TOKEN)
  log("GET recent-activity", r.status === 200 ? "PASS" : "FAIL")

  r = await req("GET", "/api/students/me/recent-activity?limit=3", undefined, TOKEN)
  log("Recent activity limit=3", r.status === 200 ? "PASS" : "FAIL",
    `returned=${r.data?.data?.activities?.length ?? r.data?.data?.length ?? "?"} items`)

  // ══════════════════════════════════════════════════════════════════════════
  // 10. PROVIDER PROFILE & REPORTS
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n═══ 10. PROVIDERS & REPORTS ═══")

  if (PROVIDER_ID) {
    r = await req("GET", `/api/students/me/providers/${PROVIDER_ID}`, undefined, TOKEN)
    if (r.status === 200 && r.data?.data) {
      log("GET provider profile", "PASS")
      const hasVerifFields = r.data.data.verificationStatus !== undefined || r.data.data.verificationDocuments !== undefined
      log("No sensitive provider fields", !hasVerifFields ? "PASS" : "FAIL")
    } else {
      log("GET provider profile", "FAIL", `status ${r.status}`)
    }

    // Submit report
    r = await req("POST", `/api/students/me/providers/${PROVIDER_ID}/report`, {
      reason: "MISLEADING_INFORMATION",
      description: "This is a test report for QA verification purposes."
    }, TOKEN)
    log("Submit provider report", r.status === 201 ? "PASS" : "FAIL", r.status === 201 ? `status ${r.status}` : JSON.stringify(r.data))

    // Duplicate report blocked
    r = await req("POST", `/api/students/me/providers/${PROVIDER_ID}/report`, {
      reason: "MISLEADING_INFORMATION",
      description: "This is a duplicate test report."
    }, TOKEN)
    log("Duplicate report blocked", r.status === 400 ? "PASS" : "FAIL", `got ${r.status}`)

    // Report with wrong opportunityId
    if (PAST_OPP_ID) {
      // Use a random UUID that doesn't belong
      r = await req("POST", `/api/students/me/providers/${PROVIDER_ID}/report`, {
        reason: "OTHER",
        description: "Test report with wrong opportunity.",
        opportunityId: "00000000-0000-0000-0000-000000000000"
      }, TOKEN)
      log("Report wrong opportunityId blocked", r.status === 400 ? "PASS" : "FAIL", `got ${r.status}`)
    }

    // Get student reports
    r = await req("GET", "/api/students/me/provider-reports", undefined, TOKEN)
    log("GET student reports", r.status === 200 ? "PASS" : "FAIL", r.status === 200 ? `count=${r.data?.data?.length}` : JSON.stringify(r.data))
  } else {
    log("Provider tests", "BLOCKED", "no provider ID")
  }

  // ══════════════════════════════════════════════════════════════════════════
  // SUMMARY
  // ══════════════════════════════════════════════════════════════════════════
  console.log("\n══════════════════════════════════════════")
  console.log("       QA TEST SUMMARY")
  console.log("══════════════════════════════════════════")
  const passed = results.filter(r => r.status === "PASS").length
  const failed = results.filter(r => r.status === "FAIL").length
  const blocked = results.filter(r => r.status === "BLOCKED").length
  console.log(`  PASS:    ${passed}`)
  console.log(`  FAIL:    ${failed}`)
  console.log(`  BLOCKED: ${blocked}`)
  console.log(`  TOTAL:   ${results.length}`)
  console.log("══════════════════════════════════════════")

  if (failed > 0) {
    console.log("\nFailed tests:")
    results.filter(r => r.status === "FAIL").forEach(r => console.log(`  ❌ ${r.test}: ${r.note}`))
  }

  // Write results JSON
  const fs = await import("fs")
  fs.writeFileSync("qa-results.json", JSON.stringify({ date: new Date().toISOString(), results, summary: { passed, failed, blocked, total: results.length } }, null, 2))
  console.log("\nResults written to qa-results.json")
}

// Start server and run tests
const server = app.listen(4444, async () => {
  console.log("QA test server running on port 4444")
  try {
    await runTests()
  } catch (e) {
    console.error("Test runner error:", e)
  } finally {
    server.close()
    process.exit(0)
  }
})
