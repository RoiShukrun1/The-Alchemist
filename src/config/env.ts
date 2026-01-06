import { ValidationError } from "../errors.js";

interface EnvConfig {
  GOOGLE_PROJECT_ID: string;
  GOOGLE_LOCATION: string;
  GOOGLE_KEY_PATH: string;
  OPENWEATHER_API_KEY: string;
  CORS_ORIGIN: string;
  PORT: number;
}

function validateEnv(): EnvConfig {
  const errors: string[] = [];

  const GOOGLE_PROJECT_ID = process.env.GOOGLE_PROJECT_ID;
  if (!GOOGLE_PROJECT_ID) {
    errors.push("GOOGLE_PROJECT_ID is required");
  }

  const GOOGLE_LOCATION = process.env.GOOGLE_LOCATION || "us-central1";
  const GOOGLE_KEY_PATH = process.env.GOOGLE_KEY_PATH || "service-account.json";
  const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || "";
  const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:5173";
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  if (errors.length > 0) {
    throw new ValidationError(
      `Missing required environment variables:\n${errors.join("\n")}\n\n` +
        "Please check your .env file or environment configuration."
    );
  }

  if (isNaN(PORT) || PORT < 1 || PORT > 65535) {
    throw new ValidationError(
      `Invalid PORT value: ${process.env.PORT}. Must be a number between 1 and 65535.`
    );
  }

  return {
    GOOGLE_PROJECT_ID: GOOGLE_PROJECT_ID!,
    GOOGLE_LOCATION,
    GOOGLE_KEY_PATH,
    OPENWEATHER_API_KEY,
    CORS_ORIGIN,
    PORT,
  };
}

export const env = validateEnv();

