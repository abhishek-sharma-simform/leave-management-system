import app from "./app.ts";
import { PORT } from "./config/env.ts";

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
