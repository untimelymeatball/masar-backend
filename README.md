# Masar Student Backend README

## 1. Overview
This document covers the completed student backend milestone for Masar. It serves as a comprehensive guide to the features, business rules, and technical implementation of the student-facing API.

The student backend supports the complete student lifecycle on the platform:
- Registration and profile flows
- Career assessments and recommendations
- Career roadmap selection and progress tracking
- Gamification with XP, levels, and badges
- Opportunity interaction (discovery and matching)
- Participation confirmation and feedback submission
- Practical hours accumulation
- Dashboard data aggregation
- Recent activity composition
- Provider profile viewing
- Provider reporting and complaints
- Automated QA verification

## 2. Tech Stack
The backend is built with the following technologies:
- **Express.js**: Core routing and HTTP framework
- **TypeScript**: Static typing and compiler-level safety
- **Prisma**: ORM for database modeling and migrations
- **PostgreSQL**: Relational database
- **Zod**: Runtime payload validation and typing
- **JWT / Auth Middleware**: Existing role-based authentication system
- **ts-node**: Execution engine for self-contained QA testing scripts
- **JSON Data**: Local JSON configurations for static definitions (e.g., `careers.json`, `badges.json`, assessments)

## 3. Main Student Backend Features Completed

### 3.1 Student Profile and Registration Support
- Students can securely access and update their core profile and enrichment data (skills, hobbies, etc.).
- Reaching a completed profile state automatically triggers profile gamification XP.
- All student routes use authenticated JWT user identities.
- Strict isolation via `/students/me` style routing absolutely prevents cross-student data access.

### 3.2 Assessment and Career Recommendations
- Students can query active assessments and complete them interactively.
- Answers map to weighted tags and traits, executing a scoring algorithm to rank career paths.
- Recommendations return the top-ranked careers customized to the student.
- Duplicate assessment attempts are protected (returning `409 Conflict`).
- Successful assessment completion triggers automated XP and badge evaluation hooks.

### 3.3 Career Roadmap Selection
- Students can browse and select curated career roadmaps.
- Roadmap selection operates on a slug-based system.
- Roadmap data definitions are dynamically sourced from internal repositories (e.g., `careers.json`).
- A strict rule of **maximum 3 selected roadmaps** is enforced.
- Duplicate roadmap selections are prevented.
- Selecting a new roadmap triggers XP and badge evaluation hooks.

### 3.4 Roadmap Progress Tracking
- Students can complete individual nodes/items inside their chosen roadmaps.
- Duplicate roadmap item completion is protected and idempotent.
- Overall roadmap progress percentages are calculated sequentially.
- Completing a roadmap item, or an entire roadmap, triggers distinct XP and badge rewards.
- Rewards are inherently idempotent—a roadmap is awarded once upon completion.

### 3.5 Gamification: XP, Levels, and Badges
- Gamification serves as the core engagement loop for students.
- **XP events** are source-based (`sourceType` + `sourceId`) ensuring absolute idempotency.
- **Badges** are evaluated based on defined metadata criteria and awarded exactly once.
- **Levels** are mathematically calculated dynamically from total accumulated XP.
- Supported student actions that trigger gamification hooks:
  - Email verification
  - Profile completion
  - Assessment completion
  - Roadmap selection
  - Roadmap item completion
  - Full roadmap completion
  - Opportunity feedback submission
  - Practical hours accumulation
- Badge rules are centralized in configuration files.

### 3.6 Opportunity Interaction
- Students can discover and list approved/published opportunities.
- Full opportunity details and metadata are viewable.
- Students can mark opportunities as "interested".
- Duplicate interest interactions are prevented.
- Students can view a dashboard widget of interested opportunities.
- Students can securely confirm participation, but **only after an opportunity has historically passed**.
- Students **cannot** confirm future opportunities.
- Students **cannot** submit feedback without prior participation confirmation.
- Duplicate feedback submission is strictly prevented.

### 3.7 Practical Hours
- Practical hours are strictly awarded **after** valid opportunity feedback has been submitted.
- Hours are **never** awarded for merely expressing interest or confirming participation.
- Practical hour events utilize a source-based (`sourceType` + `sourceId`) idempotency strategy.
- Duplicate hour awarding is inherently prevented via database relationships.
- The practical hours summary endpoint aggregates total hours, level, progress percent, and hours to the next level threshold.

### 3.8 Student Dashboard Aggregation
- The `/students/me/dashboard` endpoint elegantly composes all student summary data into one payload.
- Included dashboard blocks:
  - Profile overview
  - Assessment readiness/status
  - Latest career recommendations
  - Selected roadmaps and progression
  - Skills and traits
  - XP, levels, and badges overview
  - Total practical hours
  - Interested opportunities
  - Pending participation confirmations (prompts)
  - Pending feedback submissions (prompts)
  - Recent activity feed preview
- The endpoint gracefully handles partial data and cleanly defaults values for newly registered students.

### 3.9 Recent Activity
- The `/students/me/recent-activity` feed is composed natively from real existing backend event records.
- Sourced events include: XP events, badge awards, roadmap progress, feedback submissions, and practical hours events.
- Output is merged and sorted newest-first chronologically.
- Supports limit and pagination queries natively.
- Dashboard endpoints reuse this central composition logic.

### 3.10 Provider Profile and Reporting from Student Side
- Students can view public profiles for companies and training centers.
- Students can view an aggregated list of opportunities hosted by specific providers.
- Provider public profiles strictly **exclude** sensitive admin verification fields.
- Public provider ratings are securely aggregated directly from student feedback.
- Students can raise official reports against providers (e.g., for misleading information).
- Duplicate pending reports from the same student for the same reason are prevented.
- Student reports seamlessly integrate with the admin-compatible report review architecture.

## 4. Important Business Rules
1. **Authentication:** Only authenticated and verified students can access student routes.
2. **Authorization:** Non-student roles (Providers, Academics) receive `403 Forbidden` on student paths.
3. **Identity:** All `/students/me` routes extract identity implicitly from the JWT token `userId`. Request bodies containing spoofed `studentId`s are ignored.
4. **Roadmap Capacity:** Maximum of 3 actively selected roadmaps per student.
5. **Roadmap Uniqueness:** No duplicate selected roadmaps allowed.
6. **XP Uniqueness:** No duplicate roadmap item XP; XP awarded exactly once per unique source.
7. **Opportunity Uniqueness:** No duplicate opportunity interest markers.
8. **Participation Legitimacy:** No duplicate participation confirmations, and participation cannot be confirmed for future events.
9. **Feedback Legitimacy:** Feedback inherently requires prior confirmed participation.
10. **Feedback Uniqueness:** No duplicate feedback submissions allowed.
11. **Hours Legitimacy:** Practical hours are securely awarded exactly once per valid source (feedback).
12. **Badge Uniqueness:** Badges are awarded exactly once per badge key.
13. **Reporting:** Spam reporting is prevented. A student cannot repeatedly file pending reports against a provider.
14. **Data Isolation:** Sensitive provider verification records and internal notes are never exposed to the student layer.

## 5. Main Endpoints

| Feature | Method | Path | Description |
| :--- | :---: | :--- | :--- |
| **Profile** | `GET` | `/api/students/me` | Fetches the student's core dashboard profile. |
| **Profile** | `PATCH` | `/api/students/me` | Updates core student profile information. |
| **Profile** | `PATCH` | `/api/students/profile-enrichment` | Updates skills, hobbies, and optional metadata. |
| **Assessment** | `GET` | `/api/assessments/active` | Retrieves the currently active career assessment. |
| **Assessment** | `GET` | `/api/assessments/:id/start` | Initiates the assessment, returning formatted questions. |
| **Assessment** | `POST` | `/api/assessments/:id/submit` | Submits answers and calculates career matches. |
| **Careers** | `GET` | `/api/students/me/career-recommendations/latest` | Retrieves the top ranked careers from the latest assessment. |
| **Roadmaps** | `POST` | `/api/students/me/selected-careers` | Persists the student's chosen career paths (ID-based). |
| **Roadmaps** | `POST` | `/api/students/me/roadmaps/select` | Enrolls a student into a roadmap (Slug-based). |
| **Roadmaps** | `GET` | `/api/students/me/roadmaps` | Lists the student's actively enrolled roadmaps. |
| **Roadmaps** | `PATCH` | `/api/students/me/roadmaps/:slug/points/:key` | Marks a specific node within a roadmap as completed. |
| **Opportunities** | `GET` | `/api/students/me/opportunities` | Lists and filters all approved/published opportunities. |
| **Opportunities** | `GET` | `/api/students/me/opportunities/:id` | Views details for a single published opportunity. |
| **Opportunities** | `POST` | `/api/students/me/opportunities/:id/interest` | Expresses interest in an opportunity. |
| **Opportunities** | `POST` | `/api/students/me/opportunities/:id/participation` | Confirms participation for a past opportunity. |
| **Opportunities** | `POST` | `/api/students/me/opportunities/:id/feedback` | Submits feedback and securely processes practical hours. |
| **Practical Hrs** | `GET` | `/api/students/me/practical-hours` | Retrieves practical hour event history. |
| **Practical Hrs** | `GET` | `/api/students/me/practical-hours/summary` | Retrieves high-level total hours and level aggregations. |
| **Gamification** | `GET` | `/api/students/me/gamification` | Retrieves overall XP, Level, and Gamification stats. |
| **Gamification** | `GET` | `/api/students/me/gamification/xp/events` | Retrieves the paginated XP event ledger. |
| **Gamification** | `GET` | `/api/students/me/gamification/badges` | Retrieves the list of earned badges. |
| **Dashboard** | `GET` | `/api/students/me/dashboard` | Heavy composition endpoint serving the primary UI dashboard. |
| **Activity** | `GET` | `/api/students/me/recent-activity` | Merged event timeline of recent student achievements. |
| **Providers** | `GET` | `/api/students/me/providers/:id` | Views the sanitized public profile of a provider. |
| **Providers** | `GET` | `/api/students/me/providers/:id/opportunities` | Lists all opportunities hosted by a specific provider. |
| **Reports** | `POST` | `/api/students/me/providers/:id/report` | Submits a formal administrative complaint against a provider. |
| **Reports** | `GET` | `/api/students/me/provider-reports` | Lists the student's submitted reports and their statuses. |

## 6. Data and Models Used
The system relies on robust relational models defined in `prisma/schema.prisma`:
- **User & Profile Layer:** `User`, `StudentProfile`
- **Assessments:** `Assessment`, `Question`, `Option`, `UserAssessmentResult`
- **Careers & Roadmaps:** `CareerPath`, `StudentSelectedCareer`, `UserRoadmapProgress`, `UserRoadmapItemProgress`
- **Gamification:** `StudentGamification`, `StudentXpEvent`, `StudentBadge`
- **Opportunities:** `Opportunity`, `ProviderProfile`, `StudentOpportunityInteraction`, `OpportunityFeedback`
- **Practical Hours:** `PracticalHourSummary`, `PracticalHourEvent`
- **Compliance:** `Report`

## 7. Duplicate Prevention and Idempotency
Data integrity and idempotent operations are strict architectural requirements:
- **Database Constraints:** Prisma unique combinations (e.g., `@@unique([userId, opportunityId])`) are utilized extensively to prevent redundant records natively at the database level.
- **Service-Level Guards:** Business logic queries the database before insertion to reject illicit actions (e.g., verifying if participation was already confirmed).
- **Gamification Idempotency:** The `StudentXpEvent` and `PracticalHourEvent` tables use a `sourceType` and `sourceId` unique constraint strategy. This ensures that no matter how many times an action is triggered, XP or Hours for a specific source are awarded exactly once.
- **Expected Status `409 Conflict`:** Protected duplicate actions throw explicit HTTP `409` errors. 
  - *Example:* If a student attempts to start an assessment they have already completed, the API correctly responds with `409 Conflict`. Our QA script intentionally verifies this behavior.

## 8. QA and Testing
A fully self-contained QA testing script was developed to verify the entire student lifecycle iteratively.

- **Script Path:** `src/scripts/qa-test.ts`
- **Execution Command:** `npm run qa:student`
- **Validation Scope:** Verifies the backend flow end-to-end against a mock seeded database, validating positive flows, role-rejections, missing relations, validation failures, and duplicate-event blocks.

### Final Verified Results
- **Total Checks:** 45
- **Passed:** 45
- **Failed:** 0
- **Blocked:** 0
*(Note: One check inherently returns an expected `409` due to duplicate assessment protection logic, which the script tracks as a successful `PASS`.)*

### Typescript Integrity
The backend has been completely validated against TypeScript strict mode.

```bash
npx tsc --noEmit
```
**Result:** Passed successfully with 0 errors.
