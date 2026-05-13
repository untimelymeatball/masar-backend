# Masar Student API Documentation

This document outlines the student-facing backend API for the Masar platform.

## Authentication
- **Bearer Token**: All `/api/students/me` routes require a valid JWT in the `Authorization` header.
- **Role Requirement**: Only users with the `STUDENT` role can access these endpoints.
- **Email Verification**: Most endpoints require `isEmailVerified: true` (enforced by `requireEmailVerified` middleware).

---

## 1. Profile & Registration
| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/students/register` | Create student account + profile. |
| `POST` | `/api/students/verify-email` | Verify email with `{ "token": "..." }`. |
| `GET` | `/api/students/me` | Get full student dashboard aggregation. |
| `PATCH` | `/api/students/me` | Update core profile (firstName, lastName, bio, etc). |
| `PATCH` | `/api/students/me/profile-enrichment` | Update optional enrichment (interests, hobbies, etc). |

---

## 2. Assessment
| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/assessments/active` | Fetch active assessment metadata. |
| `GET` | `/api/assessments/:id/start` | Get questions + prefill data. |
| `POST` | `/api/assessments/:id/submit` | Submit answers and receive career matches. |
| `GET` | `/api/students/me/career-recommendations/latest` | Get latest enriched recommendations. |

---

## 3. Career Roadmaps
| Method | Path | Purpose |
| :--- | :--- | :--- |
| `POST` | `/api/students/me/roadmaps/select` | Select 1-3 roadmaps via `{ "careerSlugs": ["slug1", ...] }`. |
| `GET` | `/api/students/me/roadmaps` | View progress. Use `?format=slug` for slug-based view. |
| `PATCH` | `/api/students/me/roadmaps/:slug/points/:key` | Mark a point as completed via `{ "isCompleted": true }`. |
| `GET` | `/api/students/me/roadmaps/:id` | View single roadmap with full progress details. |

---

## 4. Gamification & Activity
| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/students/me/gamification` | View XP, Level, and Hours summary. |
| `GET` | `/api/students/me/badges` | View earned and locked badges. |
| `GET` | `/api/students/me/recent-activity` | View recent achievement events. |

---

## 5. Opportunities Flow (Prefix: `/api/students/me/opportunities`)
| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/students/me/opportunities/` | List approved/published opportunities. |
| `GET` | `/api/students/me/opportunities/:id` | View opportunity details. |
| `POST` | `/api/students/me/opportunities/:id/interest` | Mark interest. |
| `POST` | `/api/students/me/opportunities/:id/participation` | Confirm participation (after end date). `{ "participated": true }`. |
| `POST` | `/api/students/me/opportunities/:id/feedback` | Submit feedback and earn practical hours. |

---

## 6. Providers & Reporting
| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/students/me/providers/:id` | View public provider profile and rating summary. |
| `POST` | `/api/students/me/providers/:id/report` | Submit a report/complaint. |
| `GET` | `/api/students/me/provider-reports` | View history of your reports. |

---

## 7. Dashboard
| Method | Path | Purpose |
| :--- | :--- | :--- |
| `GET` | `/api/students/me/dashboard` | Aggregated view of profile, progress, and actions. |

---

## Data Consistency Rules
- **Reports**: Duplicate pending reports for the same reason/provider are blocked.
- **Participation**: Feedback can only be submitted *after* participation is confirmed.

## Known Limitations
- Admin response to reports is currently PENDING review by the administrative team.
- Badge metadata (icons/names) are managed via `badges.json`.
