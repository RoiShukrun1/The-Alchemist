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
      "Find the SINGLE BEST cocktail match based on mood and weather.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        mood: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        weather: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        occasion: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
      },
      required: ["mood", "weather"],
    },
  },
  {
    name: "recommend_perfume",
    description: "Find the SINGLE BEST perfume match based on profile.",
    parameters: {
      type: SchemaType.OBJECT,
      properties: {
        mood: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        weather: { type: SchemaType.ARRAY, items: { type: SchemaType.STRING } },
        gender: { type: SchemaType.STRING },
        occasion: {
          type: SchemaType.ARRAY,
          items: { type: SchemaType.STRING },
        },
      },
      required: ["mood", "weather", "gender"],
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
];

// --- Server Setup ---
const app = express();
app.use(cors()); // Allows the Frontend to connect
app.use(bodyParser.json());

// Memory Store: sessionId -> ChatSession
const chatSessions = new Map<string, ChatSession>();

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
        You are "The Alchemist", a sensory expert.
        
        YOUR GOAL:
        To curate EXACTLY ONE Cocktail and ONE Perfume that perfectly match the user's context.

        PROCESS:
        1.  **Gather Context:** Ask for Gender, Mood, and Weather (or City). please ask it smoothly and elegantly not all the context in one question. think like the person infront of you sitting in front of you in a bar and you advice him what to drink and what perfume to wear - be attention and respond nicely to his words.
        2.  **Call Tools:** Use the tools to find the single best match.
        3.  **Understand the user's context:** understand the user's context and ask for more details if needed.
        4.  **Presentation (CRITICAL):**
            When you present the final recommendation, you MUST display ALL the data returned by the tool, formatted beautifully.
            
            For the Cocktail, you MUST include:
            -   The Image: Use markdown syntax ![Name](drinkThumbnail_url)
            -   Name & Description
            -   Ingredients List
            -   Full Instructions (Preparation)
            
            For the Perfume, you MUST include:
            -   The Image: Use markdown syntax ![Name](image_url)
            -   Name & Brand
            -   Description (Vibe)
            -   Main Accords

        TONE:
        Elegant, concise, and professional. Offer the ONE best option as the definitive choice.
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
    if (!chat) {
      console.log(`✨ Starting new session: ${sessionId}`);
      chat = model.startChat({});
      chatSessions.set(sessionId, chat);
    }

    // 2. Send Message to Gemini
    let result = await chat.sendMessage(message);
    let response = await result.response;
    let candidates = response.candidates;

    if (!candidates || candidates.length === 0) {
      res.json({ text: "..." });
      return;
    }

    let firstPart = candidates[0].content.parts[0];
    let finalResponseText = "";

    // 3. Handle Tool Execution Loop
    // We use a loop because Gemini might need to check weather FIRST, and THEN recommend a drink.
    while (firstPart.functionCall) {
      const call = firstPart.functionCall;
      console.log(`⚡ API Tool Call: ${call.name}`);

      let toolResult;
      const args = call.args as any;

      try {
        if (call.name === "recommend_cocktail") {
          // Engine returns an array, we take the first (best) one
          const list = engine.searchCocktails(
            args.mood,
            args.weather,
            args.occasion
          );
          toolResult = { cocktail: list[0] };
        } else if (call.name === "recommend_perfume") {
          const list = engine.searchPerfumes(
            args.mood,
            args.weather,
            args.gender,
            args.occasion
          );
          toolResult = { perfume: list[0] };
        } else if (call.name === "get_weather") {
          const weatherJson = await engine.getWeather(args.city);
          toolResult = JSON.parse(weatherJson);
        }
      } catch (err) {
        console.error(`Error executing tool ${call.name}:`, err);
        toolResult = { error: "Failed to execute tool." };
      }

      // Send result back to Gemini
      const functionResponse = await chat.sendMessage([
        {
          functionResponse: {
            name: call.name,
            response: { content: toolResult },
          },
        },
      ]);

      // Get the next response
      response = await functionResponse.response;
      candidates = response.candidates;

      if (candidates && candidates.length > 0) {
        firstPart = candidates[0].content.parts[0];
      } else {
        break;
      }
    }

    // 4. Final Text Response
    if (firstPart.text) {
      finalResponseText = firstPart.text;
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
