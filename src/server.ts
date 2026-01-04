import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import {
  VertexAI,
  FunctionDeclaration,
  SchemaType,
  ChatSession,
} from "@google-cloud/vertexai";
import { AlchemyEngine } from "./engine.js";
import "dotenv/config";

const PROJECT_ID = process.env.GOOGLE_PROJECT_ID || "";
const LOCATION = process.env.GOOGLE_LOCATION || "us-central1";
const KEY_PATH = process.env.GOOGLE_KEY_PATH || "service-account.json";
const WEATHER_API_KEY = process.env.OPENWEATHER_API_KEY || "";
const PORT = 3000;

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
app.use(cors()); // Allows the Frontend to connect
app.use(bodyParser.json());

// Memory Store: sessionId -> ChatSession
const chatSessions = new Map<string, ChatSession>();

// Session State: sessionId -> { preferences, basis, etc. }
interface UserPreferences {
  personality?: string[];
  mood?: string[];
  occasion?: string[];
  weather?: string[];
  gender?: string;
  city?: string;
}

interface SessionState {
  preferences?: UserPreferences;
  includeWeather?: boolean;
  readyToRecommend?: boolean;
}
const sessionStates = new Map<string, SessionState>();

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
        
        4. Make recommendations - YOU MUST CALL BOTH TOOLS:
           - FIRST call recommend_cocktail
           - THEN call recommend_perfume (requires gender - use "unisex" if not provided)
           - Use all saved preferences from session state
           - Do not specify a basis - just use all available data automatically
           - Set includeWeather to true only if weather data exists in preferences
           - IMPORTANT: Always call BOTH tools to provide a complete pairing

        TOOL USAGE:
        - save_preferences: Store user information as they share it (personality, mood, occasion, weather, gender, city)
        - check_preferences: Check what data you've collected and if you're ready to recommend
        - get_weather: Get weather tags for a city (this will also save to preferences)
        - recommend_cocktail: ALWAYS call this when making recommendations - will automatically use saved preferences
        - recommend_perfume: ALWAYS call this when making recommendations - will automatically use saved preferences (use "unisex" if gender not provided)
        
        CRITICAL RULE: When making recommendations, you MUST call BOTH recommend_cocktail AND recommend_perfume in the same response. Never provide only one recommendation. Always provide a complete pairing.

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
  const { message, sessionId } = req.body;

  if (!sessionId || !message) {
    res.status(400).json({ error: "Missing sessionId or message" });
    return;
  }

  try {
    // 1. Get or Create Session
    let chat = chatSessions.get(sessionId);
    let sessionState = sessionStates.get(sessionId);
    if (!chat) {
      console.log(`✨ Starting new session: ${sessionId}`);
      chat = model.startChat({});
      chatSessions.set(sessionId, chat);
      sessionState = {};
      sessionStates.set(sessionId, sessionState);
    }

    // 2. Send Message to Gemini
    let result = await chat.sendMessage(message);
    let response = await result.response;
    let candidates = response.candidates;

    if (!candidates || candidates.length === 0) {
      res.json({ text: "..." });
      return;
    }

    let parts = candidates[0].content.parts;
    let finalResponseText = "";

    // 3. Handle Tool Execution Loop
    // We use a loop because Gemini might need to check weather FIRST, and THEN recommend a drink.
    while (
      parts &&
      parts.length > 0 &&
      parts.some((p: any) => p.functionCall)
    ) {
      // Collect all function calls from all parts
      const functionCalls: any[] = [];
      for (const part of parts) {
        if (part.functionCall) {
          functionCalls.push(part.functionCall);
        }
      }

      if (functionCalls.length === 0) break;

      const functionResponses: any[] = [];

      for (const call of functionCalls) {
        console.log(`⚡ API Tool Call: ${call.name}`);

        let toolResult;
        const args = call.args as any;

        try {
          if (call.name === "recommend_cocktail") {
            // Use preferences from session state if not provided in args
            const prefs = sessionState!.preferences || {};
            const mood = args.mood || prefs.mood || [];
            const weatherTags = args.weather || prefs.weather || [];
            const occasion = args.occasion || prefs.occasion || [];
            const personality = args.personality || prefs.personality || [];
            // Use all available data - no specific basis needed
            const basis = undefined; // Let engine use all available data automatically
            // Only include weather if weather data actually exists in preferences
            const hasWeatherData = prefs.weather && prefs.weather.length > 0;
            const includeWeather =
              args.includeWeather !== undefined
                ? args.includeWeather && hasWeatherData
                : sessionState!.includeWeather !== undefined
                ? sessionState!.includeWeather && hasWeatherData
                : hasWeatherData;

            // Engine returns an array, we take the first (best) one
            const list = engine.searchCocktails(
              mood,
              weatherTags,
              occasion,
              personality,
              basis,
              includeWeather
            );
            // Return clean data only - no conversational text
            toolResult = list[0]
              ? { cocktail: list[0] }
              : { cocktail: null, error: "No matching cocktail found" };
          } else if (call.name === "recommend_perfume") {
            // Use preferences from session state if not provided in args
            const prefs = sessionState!.preferences || {};
            const mood = args.mood || prefs.mood || [];
            const weatherTags = args.weather || prefs.weather || [];
            const occasion = args.occasion || prefs.occasion || [];
            const personality = args.personality || prefs.personality || [];
            const gender = args.gender || prefs.gender || "unisex";
            // Use all available data - no specific basis needed
            const basis = undefined; // Let engine use all available data automatically
            // Only include weather if weather data actually exists in preferences
            const hasWeatherData = prefs.weather && prefs.weather.length > 0;
            const includeWeather =
              args.includeWeather !== undefined
                ? args.includeWeather && hasWeatherData
                : sessionState!.includeWeather !== undefined
                ? sessionState!.includeWeather && hasWeatherData
                : hasWeatherData;

            const list = engine.searchPerfumes(
              mood,
              weatherTags,
              gender,
              occasion,
              personality,
              basis,
              includeWeather
            );
            // Return clean data only - no conversational text
            toolResult = list[0]
              ? { perfume: list[0] }
              : { perfume: null, error: "No matching perfume found" };
          } else if (call.name === "get_weather") {
            const weatherJson = await engine.getWeather(args.city);
            try {
              const weatherData = JSON.parse(weatherJson);
              // Store city and weather in preferences
              if (!sessionState!.preferences) {
                sessionState!.preferences = {};
              }
              sessionState!.preferences.city = args.city;
              sessionState!.preferences.weather = weatherData.tags || [];
              sessionState!.includeWeather = true;
              toolResult = weatherData;
            } catch (parseError) {
              console.error("Error parsing weather JSON:", parseError);
              toolResult = {
                error: weatherJson,
                city: args.city,
                tags: [],
              };
            }
          } else if (call.name === "save_preferences") {
            // Store user preferences
            if (!sessionState!.preferences) {
              sessionState!.preferences = {};
            }
            if (args.personality) {
              sessionState!.preferences.personality = args.personality;
            }
            if (args.mood) {
              sessionState!.preferences.mood = args.mood;
            }
            if (args.occasion) {
              sessionState!.preferences.occasion = args.occasion;
            }
            if (args.weather) {
              sessionState!.preferences.weather = args.weather;
            }
            if (args.gender) {
              sessionState!.preferences.gender = args.gender;
            }
            if (args.city) {
              sessionState!.preferences.city = args.city;
            }
            toolResult = {
              success: true,
              preferences: sessionState!.preferences,
              message: "Preferences saved successfully",
            };
          } else if (call.name === "check_preferences") {
            // Check what preferences we have
            const prefs = sessionState!.preferences || {};
            const filledFields: string[] = [];
            if (prefs.personality && prefs.personality.length > 0)
              filledFields.push("personality");
            if (prefs.mood && prefs.mood.length > 0) filledFields.push("mood");
            if (prefs.occasion && prefs.occasion.length > 0)
              filledFields.push("occasion");
            if (prefs.weather && prefs.weather.length > 0)
              filledFields.push("weather");
            if (prefs.gender) filledFields.push("gender");

            const hasAtLeastOne = filledFields.length > 0;

            toolResult = {
              hasData: hasAtLeastOne,
              filledFields: filledFields,
              preferences: prefs,
              readyToRecommend: hasAtLeastOne,
            };
          }
        } catch (err) {
          console.error(`Error executing tool ${call.name}:`, err);
          toolResult = { error: `Failed to execute tool ${call.name}: ${err}` };
        }

        // Add to responses array
        functionResponses.push({
          functionResponse: {
            name: call.name,
            response: { content: toolResult },
          },
        });
      }

      // Send all function responses back to Gemini
      const functionResponse = await chat.sendMessage(functionResponses);

      // Get the next response
      response = await functionResponse.response;
      candidates = response.candidates;

      if (candidates && candidates.length > 0) {
        parts = candidates[0].content.parts;
      } else {
        break;
      }
    }

    // 4. Final Text Response - collect all text parts
    if (parts && parts.length > 0) {
      const textParts = parts
        .filter((p: any) => p.text)
        .map((p: any) => p.text);
      finalResponseText = textParts.join("\n");
    }

    res.json({ text: finalResponseText });
  } catch (error) {
    console.error("API Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.listen(PORT, () => {
  console.log(`⚗️  Alchemy Server running on http://localhost:${PORT}`);
});
