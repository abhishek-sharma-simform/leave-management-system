import express from "express";
import routes from "./routes/index.ts";
import { notFoundHandler } from "./middleware/notFound.middleware.ts";
import { errorHandler } from "./middleware/errorHandler.middleware.ts";

const app = express();

// Parse incoming JSON request bodies into req.body
app.use(express.json());

// All routes for the app live behind this one entry point
app.use("/api/v1", routes);

// Runs only if no route above matched the request
app.use(notFoundHandler);

// Runs only if something threw/called next(err) above
app.use(errorHandler);

export default app;
