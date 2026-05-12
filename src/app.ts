import express from 'express'; // imports the express library
import { router as authRouter } from "./presentation/routes/auth.routes"
import { router as studentRouter } from './presentation/routes/student.routes';
import { router as providerRouter } from './presentation/routes/provider.routes';
import { router as academicRouter } from './presentation/routes/academic.routes';
import { router as adminRouter } from './presentation/routes/admin.routes';
import { router as assessmentRouter } from './presentation/routes/assessment.routes';
import { router as studentRegRouter } from './presentation/routes/studentRegistration.routes';
import { router as studentOppRouter } from './presentation/routes/studentOpportunity.routes';
import { router as practicalHoursRouter } from './presentation/routes/practicalHours.routes';
import { router as gamificationRouter } from './presentation/routes/gamification.routes';
import { router as studentDashboardRouter } from './presentation/routes/studentDashboard.routes';
import { router as recentActivityRouter } from './presentation/routes/recentActivity.routes';
import { providerRouter as studentProviderRouter, reportsRouter as studentReportsRouter } from './presentation/routes/studentProvider.routes';

// function to create an instance of "app"
// function gets called
const app = express();

// registers a middleware
app.use(express.json());

// every route inside auth.routes.ts gets prefixed with /auth
// so /register becomes /auth/register
app.use("/auth", authRouter)
app.use("/student", studentRouter)
app.use("/provider", providerRouter)
app.use("/academic", academicRouter)
app.use("/admin", adminRouter)
app.use("/api/assessments", assessmentRouter)
app.use("/api/students", studentRegRouter)
app.use("/api/students/me/opportunities", studentOppRouter)
app.use("/api/students/me/practical-hours", practicalHoursRouter)
app.use("/api/students/me/gamification", gamificationRouter)
app.use("/api/students/me/dashboard", studentDashboardRouter)
app.use("/api/students/me/recent-activity", recentActivityRouter)
app.use("/api/students/me/providers", studentProviderRouter)
app.use("/api/students/me/provider-reports", studentReportsRouter)



// makes app available for import
export default app;
