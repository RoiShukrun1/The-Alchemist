/**
 * Sanitizes user input to prevent XSS and injection attacks
 */
export function sanitizeInput(input: string): string {
  return input
    .trim()
    .replace(/[<>]/g, "") // Remove potential HTML tags
    .slice(0, 1000); // Enforce max length
}

/**
 * Validates session ID format
 */
export function isValidSessionId(sessionId: string): boolean {
  return /^[a-zA-Z0-9_-]+$/.test(sessionId) && sessionId.length <= 100;
}

/**
 * Validates city name format
 */
export function isValidCityName(city: string): boolean {
  return (
    city.trim().length > 0 &&
    city.length <= 100 &&
    /^[a-zA-Z\s'-]+$/.test(city)
  );
}

/**
 * Validates array of strings (for mood, personality, etc.)
 */
export function isValidStringArray(
  arr: unknown,
  maxLength: number = 50
): arr is string[] {
  if (!Array.isArray(arr)) return false;
  return (
    arr.length <= maxLength &&
    arr.every((item) => typeof item === "string" && item.trim().length > 0)
  );
}

/**
 * Validates gender value
 */
export function isValidGender(gender: unknown): gender is string {
  if (typeof gender !== "string") return false;
  const normalized = gender.toLowerCase();
  return (
    normalized === "male" ||
    normalized === "female" ||
    normalized === "men" ||
    normalized === "women" ||
    normalized === "woman" ||
    normalized === "man" ||
    normalized === "boy" ||
    normalized === "girl" ||
    normalized === "unisex"
  );
}

