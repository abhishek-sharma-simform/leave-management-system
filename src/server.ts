import app from "./app.ts";
import { PORT } from "./config/env.ts";
import { logger } from "./config/logger.ts";

app.listen(PORT, () => {
  logger.info(`Server running on http://localhost:${PORT}`);
});
