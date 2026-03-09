import http from "serverless-http";
import { app } from "./app";
import { PORT } from "./env";

export const handler = http(app);

if (require.main === module) {
  console.log(`🚀 Started video translate server on port ${PORT}`);

  app.listen(PORT);
}
