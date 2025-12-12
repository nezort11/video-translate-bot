import serverlessHttp from "serverless-http";
import { app } from "./app";
import { PORT } from "./env";

// Export handler for Yandex Cloud Functions
export const handler = serverlessHttp(app);

// Local development server
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Admin API server running on http://localhost:${PORT}`);
  });
}

