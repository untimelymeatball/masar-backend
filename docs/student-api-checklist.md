# Student Backend API Verification Checklist

Manual test sequence to verify full student workflow using seeded test data.

## 1. Setup & Auth
- [ ] **Registration**: `POST /api/students/register` with new email.
- [ ] **Verification**: Find token in console log and `POST /api/students/verify-email`.
- [ ] **Login**: `POST /api/auth/login` to get JWT.
- [ ] **Profile**: `GET /api/students/me` should return 200 with student profile.

## 2. Assessment & Careers
- [ ] **Active Assessment**: `GET /api/assessments/active` should return "Career Mapping Assessment".
- [ ] **Start**: `GET /api/assessments/:id/start` to get questions.
- [ ] **Submit**: `POST /api/assessments/:id/submit` with valid answers.
- [ ] **Verification**:
    - [ ] `GET /api/students/me/career-recommendations/latest` should return top 5.
    - [ ] `GET /api/students/me/gamification` should show assessment XP.

## 3. Roadmaps
- [ ] **Selection**: `POST /api/students/me/roadmaps/select` with 2 valid slugs.
- [ ] **Limit Check**: Try selecting 4 slugs (should fail with 400).
- [ ] **Duplicate Check**: Try selecting same slug twice (should fail with 400).
- [ ] **Completion**: `PATCH /api/students/me/roadmaps/:slug/points/:key` with `{ "isCompleted": true }`.
- [ ] **Verification**: `GET /api/students/me/dashboard` should show progress update.

## 4. Opportunities Flow
- [ ] **List**: `GET /api/opportunities` (should see "Future Workshop" and "Past Internship").
- [ ] **Interest**: `POST /api/opportunities/:id/interest` for "Past Internship".
- [ ] **Participation**: `POST /api/opportunities/:id/confirm` with `{ "participated": true }`.
- [ ] **Feedback**: `POST /api/opportunities/:id/feedback` with rating and comment.
- [ ] **Verification**:
    - [ ] `GET /api/students/me/practical-hours` should show hours from internship.
    - [ ] `GET /api/students/me/recent-activity` should show feedback event.

## 5. Providers & Reports
- [ ] **Profile**: `GET /api/students/me/providers/:id` for "Verified Corp".
- [ ] **Report**: `POST /api/students/me/providers/:id/report` with reason `MISLEADING_CONTENT`.
- [ ] **Verification**: `GET /api/students/me/provider-reports` should show the pending report.

## 6. Dashboard Final Pass
- [ ] `GET /api/students/me` returns full profile, roadmap progress, badges, and recent activity.
