import { Pool } from "pg";
import { POSTGRES_URL } from "./src/env";

const main = async () => {
  if (!POSTGRES_URL) {
    console.log("POSTGRES_URL is not set");
    return;
  }
  const pool = new Pool({ connectionString: POSTGRES_URL });
  const userId = "776696185";
  const res = await pool.query(
    'SELECT key, session FROM "telegraf-sessions" WHERE key LIKE $1',
    [`%${userId}%`]
  );
  console.log("Matching keys in telegraf-sessions:");
  res.rows.forEach((row: any) => {
    console.log(`Key: ${row.key}`);
    console.log(`Session: ${JSON.stringify(row.session).substring(0, 100)}...`);
  });
  await pool.end();
};

main();
