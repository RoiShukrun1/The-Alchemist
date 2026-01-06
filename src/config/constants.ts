// Scoring weights for matching algorithm
export const SCORING_WEIGHTS = {
  PERSONALITY_EXCLUSIVE: 20, // Points per matching personality trait (exclusive mode)
  MOOD_EXCLUSIVE: 30, // Points per matching mood (exclusive mode)
  OCCASION_EXCLUSIVE: 30, // Points per matching occasion (exclusive mode)
  DAILY_BASE: 50, // Base score for daily items
  DAILY_MOOD_BONUS: 10, // Bonus per matching mood for daily items
  PERSONALITY_COMBINED: 15, // Points per matching personality trait (combined mode)
  MOOD_COMBINED: 20, // Points per matching mood (combined mode)
  OCCASION_COMBINED: 15, // Points per matching occasion (combined mode)
  WEATHER_COMBINED: 10, // Points per matching weather tag (combined mode)
} as const;

// API Configuration
export const API_CONFIG = {
  WEATHER_TIMEOUT: 5000, // 5 seconds
  WEATHER_MAX_RETRIES: 3,
  WEATHER_RETRY_BASE_DELAY: 1000, // 1 second
} as const;

// Cache Configuration
export const CACHE_CONFIG = {
  WEATHER_TTL: 5 * 60 * 1000, // 5 minutes in milliseconds
} as const;

// Session Configuration
export const SESSION_CONFIG = {
  EXPIRY_TIME: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
} as const;

// Rate Limiting Configuration
export const RATE_LIMIT_CONFIG = {
  MAX_REQUESTS: 10, // requests per window
  WINDOW_MS: 60 * 1000, // 1 minute in milliseconds
} as const;

