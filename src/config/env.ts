import dotenv from "dotenv";
import path from "path";

dotenv.config({
  path: path.resolve(process.cwd(), ".env"),
});

if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
  console.error("❌ Environment variables not loaded");
  process.exit(1);
}
