import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import fs from "fs";
import path from "path";
import {
  VertexAI,
  FunctionDeclaration,
  SchemaType,
  ChatSession,
} from "@google-cloud/vertexai";
import { z } from "zod";
import { AlchemyEngine } from "./engine.js";
import {
  AlchemyError,
  ValidationError,
  APIError,
  DataError,
  SessionError,
} from "./errors.js";
import {
  FunctionCall,
  FunctionResponse,
  GeminiPart,
  GeminiResponse,
  GeminiFunctionResponse,
} from "./types/gemini.js";
import { SessionManager, SessionState } from "./sessionManager.js";
import "dotenv/config";

import { env } from "./config/env.js";

const PROJECT_ID = env.GOOGLE_PROJECT_ID;
const LOCATION = env.GOOGLE_LOCATION;
const KEY_PATH = env.GOOGLE_KEY_PATH;
const WEATHER_API_KEY = env.OPENWEATHER_API_KEY;
const PORT = env.PORT;

// CORS configuration
const allowedOrigins = env.CORS_ORIGIN.split(",").map((origin) =>
  origin.trim()
);

// Initialize Engine
const engine = new AlchemyEngine(WEATHER_API_KEY);

// --- Tool Definitions ---
const toolDefinitions: FunctionDeclaration[] = [
  {
    name: "recommend_cocktail",
    description:
      "Find the SINGLE BEST cocktail match based on the selected pairing basis (personality, mood, occasion, or daily).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        mood: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        weather: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        occasion: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        personality: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        basis: {
          type: SchemaType.STRING,
          description:
            "Optional matching basis. If not specified, all available data will be used automatically.",
        },
        includeWeather: {
          type: SchemaType.BOOLEAN,
        },
      },
      required: [],
    },
  },
  {
    name: "recommend_perfume",
    description:
      "Find the SINGLE BEST perfume match based on the selected pairing basis (personality, mood, occasion, or daily).",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        mood: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        weather: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        gender: { type: SchemaType.STRING },
        occasion: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        personality: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        basis: {
          type: SchemaType.STRING,
          description:
            "Optional matching basis. If not specified, all available data will be used automatically.",
        },
        includeWeather: {
          type: SchemaType.BOOLEAN,
        },
      },
      required: ["gender"],
    },
  },
  {
    name: "get_weather",
    description: "Get real weather tags for a city name.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        city: { type: SchemaType.STRING },
      },
      required: ["city"],
    },
  },
  {
    name: "save_preferences",
    description:
      "Store user preferences (personality, mood, occasion, weather, gender, city). At least one field must be provided.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        personality: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        mood: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        occasion: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        weather: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
        gender: { type: SchemaType.STRING },
        city: { type: SchemaType.STRING },
      },
      required: [],
    },
  },
  {
    name: "check_preferences",
    description:
      "Check if we have enough preferences to make a recommendation. Returns what fields are filled and whether we're ready.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {},
      required: [],
    },
  },
];

// --- Server Setup ---
const app = express();
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);
      if (allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);
app.use(bodyParser.json());

// Memory Store: sessionId -> ChatSession
const chatSessions = new Map<string, ChatSession>();

// Session Manager for persistence
const sessionManager = new SessionManager();

// Load existing sessions on startup
const loadedSessions = sessionManager.loadAllSessions();
logger.info(`Loaded ${loadedSessions.size} existing sessions`);

// Cleanup expired sessions on startup
const cleaned = sessionManager.cleanupExpiredSessions();
if (cleaned > 0) {
  logger.info(`Cleaned up ${cleaned} expired sessions`);
}

// Rate limiting: track requests per session
interface RateLimitEntry {
  count: number;
  resetTime: number;
}
const rateLimitStore = new Map<string, RateLimitEntry>();
import { RATE_LIMIT_CONFIG } from "./config/constants.js";
import { ToolHandler } from "./tools/index.js";
import { logger } from "./utils/logger.js";
import {
  recommendCocktailArgsSchema,
  recommendPerfumeArgsSchema,
  getWeatherArgsSchema,
  savePreferencesArgsSchema,
} from "./tools/schemas.js";

const RATE_LIMIT_MAX = RATE_LIMIT_CONFIG.MAX_REQUESTS;
const RATE_LIMIT_WINDOW = RATE_LIMIT_CONFIG.WINDOW_MS;

function checkRateLimit(sessionId: string): boolean {
  const now = Date.now();
  const entry = rateLimitStore.get(sessionId);

  if (!entry || now > entry.resetTime) {
    // Create new window
    rateLimitStore.set(sessionId, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW,
    });
    return true;
  }

  if (entry.count >= RATE_LIMIT_MAX) {
    return false; // Rate limit exceeded
  }

  entry.count++;
  return true;
}

// Validate service account key path
const keyPath = path.resolve(KEY_PATH);
if (!fs.existsSync(keyPath)) {
  logger.error(`Service account key file not found at: ${keyPath}`, {
    keyPath,
  });
  console.error(
    `ERROR: Service account key file not found at: ${keyPath}\n` +
      `Please ensure GOOGLE_KEY_PATH environment variable points to a valid service account JSON file.`
  );
  process.exit(1);
}

// Input validation schema
const chatRequestSchema = z.object({
  message: z
    .string()
    .min(1, "Message cannot be empty")
    .max(1000, "Message cannot exceed 1000 characters")
    .refine(
      (msg) => msg.trim().length > 0,
      "Message cannot be only whitespace"
    ),
  sessionId: z
    .string()
    .min(1, "Session ID cannot be empty")
    .max(100, "Session ID cannot exceed 100 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "Session ID contains invalid characters"),
});

// Initialize Vertex AI
const vertex_ai = new VertexAI({
  project: PROJECT_ID,
  location: LOCATION,
  googleAuthOptions: {
    keyFilename: KEY_PATH,
  },
});
const model = vertex_ai.getGenerativeModel({
  model: "gemini-2.0-flash",
  systemInstruction: {
    role: "system",
    parts: [
      {
        text: `
        You are "The Alchemist", a master of sensory alchemy. You are not a rigid system - you are a wise, intuitive, and emotionally attuned guide who reads between the lines and responds to the user's energy, emotions, and unspoken desires.

        YOUR ESSENCE:
        - You feel the user's emotional state and respond authentically to their words
        - You gather information organically through natural conversation, not rigid questionnaires
        - You notice what they emphasize, what excites them, what they're hesitant about
        - You adapt your approach based on their personality and communication style

        CONVERSATION FLOW:
        1. Start with a warm, mystical greeting that invites them to share what's in their heart
        
        2. Collect information FIELD BY FIELD through natural questions:
           - Ask about ONE field at a time in this order: personality, mood, occasion, gender, weather
           - If the user doesn't want to provide a field or says "skip", move to the next field
           - Use save_preferences to store each field as you collect it
           - For gender: ALWAYS ask before making recommendations (required for perfume). Ask naturally questions like: "Do you want the pair to base on your gender?" 
            - if yes then get the gender and 
            - if not use unisex
           - For weather: ALWAYS ask questions like "Would you like me to consider today's weather in the pairing?" 
             - If yes: ask for their city, use get_weather, then save it
             - If no: skip weather
           - Continue until you have AT LEAST ONE field filled (minimum requirement) but make sure you ask about all the parameters (personality, mood, occasion, gender, weather)
           - You can collect more fields if the user is willing, but only one is required
        
        3. Use check_preferences to verify what data you have
        
        4. Make recommendations - CRITICAL: DO THIS IMMEDIATELY IN THE SAME TURN:
           - After collecting information and checking preferences, if you have at least one field filled, IMMEDIATELY proceed to make recommendations
           - DO NOT wait for another user message
           - DO NOT just say "I'm ready" - actually call the tools right away
           - In the SAME response where you check preferences and confirm readiness, IMMEDIATELY call both tools:
             * FIRST call recommend_cocktail
             * THEN call recommend_perfume (requires gender - use "unisex" if not provided)
           - Use all saved preferences from session state
           - Do not specify a basis - just use all available data automatically
           - Set includeWeather to true only if weather data exists in preferences
           - IMPORTANT: Always call BOTH tools to provide a complete pairing
           - The flow should be: collect info → check_preferences → (if ready) IMMEDIATELY call both recommendation tools → present results

        TOOL USAGE:
        - save_preferences: Store user information as they share it (personality, mood, occasion, weather, gender, city)
        - check_preferences: Check what data you've collected and if you're ready to recommend. AFTER calling this and confirming you have data, IMMEDIATELY proceed to call both recommendation tools in the SAME turn - do not wait for another user message
        - get_weather: Get weather tags for a city (this will also save to preferences)
        - recommend_cocktail: ALWAYS call this when making recommendations - will automatically use saved preferences
        - recommend_perfume: ALWAYS call this when making recommendations - will automatically use saved preferences (use "unisex" if gender not provided)
        
        CRITICAL RULE: When making recommendations, you MUST call BOTH recommend_cocktail AND recommend_perfume in the same response. Never provide only one recommendation. Always provide a complete pairing.
        
        AUTOMATIC RECOMMENDATION FLOW:
        - When you have collected information and called check_preferences, if it shows readyToRecommend: true or hasData: true, you MUST IMMEDIATELY call both recommend_cocktail and recommend_perfume in that SAME response
        - Do NOT end your response with "I'm ready" or "Let me consult the spirits" - actually call the tools and present the results
        - The user should NOT need to send another message to trigger recommendations - you do it automatically once you have the data

        PRESENTATION:
        When presenting recommendations, you MUST display BOTH the cocktail AND perfume. Format them beautifully using markdown. Structure it like this:
        
        ## 🍸 Your Perfect Cocktail
        
        ![Cocktail Name](drinkThumbnail_url)
        
        **Name:** [cocktail name from tool response]
        
        **Description:** [description from tool response]
        
        **Ingredients:**
        - [ingredient 1 from tool response]
        - [ingredient 2 from tool response]
        - [list all ingredients from tool response]
        
        **Instructions:** [instructions from tool response]
        
        ---
        
        ## 🌸 Your Perfect Perfume
        
        **Name:** [perfume name from tool response]
        
        **Brand:** [brand from tool response]
        
        **Description:** [description from tool response]
        
        **Main Accords:** [accords from tool response]
        
        ---
        
        After presenting BOTH recommendations in this format, you can add a warm closing message. 
        CRITICAL: Always display BOTH cocktail and perfume. If a tool returns null or error, mention it but still show the other recommendation.

        TONE & STYLE:
        - Mystical yet grounded, wise yet warm
        - Respond to their emotions - if they're excited, match that energy; if they're contemplative, be thoughtful
        - Use sensory language that paints a picture
        - Be genuine and present, not robotic or scripted
      `,
      },
    ],
  },
  tools: [{ functionDeclarations: toolDefinitions }],
});

// --- API Endpoint ---
app.post("/api/chat", async (req, res): Promise<void> => {
  // Validate input
  const validationResult = chatRequestSchema.safeParse(req.body);
  if (!validationResult.success) {
    res.status(400).json({
      error: "Validation failed",
      details: validationResult.error.issues.map((err) => ({
        field: err.path.join("."),
        message: err.message,
      })),
    });
    return;
  }

  const { message, sessionId } = validationResult.data;

  // Check rate limit
  if (!checkRateLimit(sessionId)) {
    res.status(429).json({
      error: "Rate limit exceeded",
      code: "RATE_LIMIT_EXCEEDED",
      message: "Too many requests. Please try again in a minute.",
    });
    return;
  }

  const requestId = logger.generateRequestId();
  try {
    // 1. Get or Create Session
    let chat = chatSessions.get(sessionId);
    let sessionState = sessionManager.loadSession(sessionId);
    if (!chat) {
      logger.info(`Starting new session`, { sessionId }, requestId);
      chat = model.startChat({});
      chatSessions.set(sessionId, chat);
      if (!sessionState) {
        sessionState = {};
        sessionManager.saveSession(sessionId, sessionState);
      }
    }

    // Initialize tool handler
    const toolHandler = new ToolHandler({
      engine,
      sessionManager,
      sessionId,
      sessionState,
    });

    // 2. Send Message to Gemini
    let result = await chat.sendMessage(message);
    let response = await result.response;
    // Type assertion needed because Vertex AI types don't exactly match our interface
    let candidates = (response as unknown as GeminiResponse).candidates;

    if (!candidates || candidates.length === 0) {
      res.json({ text: "..." });
      return;
    }

    // Convert Vertex AI Part types to our GeminiPart interface
    let parts: GeminiPart[] = candidates[0].content
      .parts as unknown as GeminiPart[];
    let finalResponseText = "";

    // 3. Handle Tool Execution Loop
    // We use a loop because Gemini might need to check weather FIRST, and THEN recommend a drink.
    while (
      parts &&
      parts.length > 0 &&
      parts.some((p: GeminiPart) => p.functionCall !== undefined)
    ) {
      // Collect all function calls from all parts
      const functionCalls: FunctionCall[] = [];
      for (const part of parts) {
        if (part.functionCall) {
          functionCalls.push(part.functionCall);
        }
      }

      if (functionCalls.length === 0) break;

      const functionResponses: GeminiFunctionResponse[] = [];

      for (const call of functionCalls) {
        logger.debug(
          `API Tool Call: ${call.name}`,
          { tool: call.name, sessionId },
          requestId
        );

        let toolResult: unknown;

        try {
          // Update tool handler context with latest session state
          toolHandler.context.sessionState = sessionState;

          if (call.name === "recommend_cocktail") {
            const validation = recommendCocktailArgsSchema.safeParse(call.args);
            if (!validation.success) {
              toolResult = {
                error: "Invalid arguments for recommend_cocktail",
                details: validation.error.issues,
              };
            } else {
              const result = await toolHandler.handleRecommendCocktail(
                validation.data
              );
              toolResult = result.success
                ? result.data
                : { ...(result.data || {}), error: result.error };
              sessionState = toolHandler.context.sessionState;
            }
          } else if (call.name === "recommend_perfume") {
            const validation = recommendPerfumeArgsSchema.safeParse(call.args);
            if (!validation.success) {
              toolResult = {
                error: "Invalid arguments for recommend_perfume",
                details: validation.error.issues,
              };
            } else {
              const result = await toolHandler.handleRecommendPerfume(
                validation.data
              );
              toolResult = result.success
                ? result.data
                : { ...(result.data || {}), error: result.error };
              sessionState = toolHandler.context.sessionState;
            }
          } else if (call.name === "get_weather") {
            const validation = getWeatherArgsSchema.safeParse(call.args);
            if (!validation.success) {
              toolResult = {
                error: "Invalid arguments for get_weather",
                details: validation.error.issues,
              };
            } else {
              const result = await toolHandler.handleGetWeather(
                validation.data
              );
              toolResult = result.success ? result.data : result.data;
              sessionState = toolHandler.context.sessionState;
            }
          } else if (call.name === "save_preferences") {
            const validation = savePreferencesArgsSchema.safeParse(call.args);
            if (!validation.success) {
              toolResult = {
                error: "Invalid arguments for save_preferences",
                details: validation.error.issues,
              };
            } else {
              const result = await toolHandler.handleSavePreferences(
                validation.data
              );
              toolResult = result.data;
              sessionState = toolHandler.context.sessionState;
            }
          } else if (call.name === "check_preferences") {
            const result = toolHandler.handleCheckPreferences();
            toolResult = result.data;
          } else {
            toolResult = { error: `Unknown tool: ${call.name}` };
          }
        } catch (err) {
          logger.error(
            `Error executing tool ${call.name}`,
            { error: err, tool: call.name },
            requestId
          );
          toolResult = { error: `Failed to execute tool ${call.name}: ${err}` };
        }

        // Add to responses array
        const functionResponse: GeminiFunctionResponse = {
          functionResponse: {
            name: call.name,
            response: { content: toolResult },
          },
        };
        functionResponses.push(functionResponse);
      }

      // Send all function responses back to Gemini
      const functionResponse = await chat.sendMessage(functionResponses);

      // Get the next response - convert Vertex AI types to our interface
      const nextResponse = await functionResponse.response;
      candidates = (nextResponse as unknown as GeminiResponse).candidates;

      if (candidates && candidates.length > 0) {
        parts = candidates[0].content.parts;
      } else {
        break;
      }
    }

    // 4. Final Text Response - collect all text parts
    if (parts && parts.length > 0) {
      const textParts = parts
        .filter(
          (p: GeminiPart): p is GeminiPart & { text: string } =>
            p.text !== undefined
        )
        .map((p) => p.text);
      finalResponseText = textParts.join("\n");
    }

    // Save session state after processing
    if (sessionState) {
      sessionManager.saveSession(sessionId, sessionState);
    }

    res.json({ text: finalResponseText });
  } catch (error) {
    logger.error("API Error", { error, sessionId }, requestId);
    if (error instanceof AlchemyError) {
      res.status(error.statusCode).json({
        error: error.message,
        code: error.code,
        ...(error instanceof ValidationError && error.field
          ? { field: error.field }
          : {}),
        ...(error instanceof APIError && error.service
          ? { service: error.service }
          : {}),
        ...(error instanceof DataError && error.dataType
          ? { dataType: error.dataType }
          : {}),
      });
    } else {
      const errorMessage =
        error instanceof Error ? error.message : "Internal Server Error";
      res.status(500).json({
        error: errorMessage,
        code: "INTERNAL_ERROR",
        sessionId: req.body.sessionId,
      });
    }
  }
});

app.listen(PORT, () => {
  console.log(`⚗️  Alchemy Server running on http://localhost:${PORT}`);
});
