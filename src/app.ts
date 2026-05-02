import express from 'express'; // imports the express library
import { router as authRouter } from "./presentation/routes/auth.routes"
import { router as studentRouter } from './presentation/routes/student.routes';
import { router as providerRouter } from './presentation/routes/provider.routes';
import { router as academicRouter } from './presentation/routes/academic.routes';
import { router as adminRouter } from './presentation/routes/admin.routes';

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



// makes app available for import
export default app;
