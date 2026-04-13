// imports the express library
import express from 'express';

// function to create an instance of "app"
// function gets called
const app = express();

// registers a middleware
app.use(express.json());

// makes app available for import
export default app;
