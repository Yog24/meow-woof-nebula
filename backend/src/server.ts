import { config as loadEnv } from "dotenv";
import { createApp } from "./app";

loadEnv({ path: ".env.local", override: false });
loadEnv({ override: false });

const port = Number(process.env.BACKEND_PORT || 3100);

const app = createApp();

app.listen(port, "0.0.0.0", () => {
  console.log(`[backend] server started on http://0.0.0.0:${port}`);
});
