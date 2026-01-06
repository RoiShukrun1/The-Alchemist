import { AlchemyEngine } from "../engine.js";
import { SessionState, SessionManager } from "../sessionManager.js";
import { z } from "zod";
import {
  recommendCocktailArgsSchema,
  recommendPerfumeArgsSchema,
  getWeatherArgsSchema,
  savePreferencesArgsSchema,
} from "./schemas.js";

export interface ToolExecutionContext {
  engine: AlchemyEngine;
  sessionManager: SessionManager;
  sessionId: string;
  sessionState: SessionState | null;
}

export interface ToolResult {
  success: boolean;
  data?: unknown;
  error?: string;
  details?: unknown;
}

export class ToolHandler {
  public context: ToolExecutionContext;
  constructor(context: ToolExecutionContext) {
    this.context = context;
  }

  async handleRecommendCocktail(
    args: z.infer<typeof recommendCocktailArgsSchema>
  ): Promise<ToolResult> {
    const { engine, sessionState } = this.context;
    const prefs = sessionState?.preferences || {};
    const mood = args.mood || prefs.mood || [];
    const weatherTags = args.weather || prefs.weather || [];
    const occasion = args.occasion || prefs.occasion || [];
    const personality = args.personality || prefs.personality || [];
    const basis = undefined;
    const hasWeatherData = prefs.weather && prefs.weather.length > 0;
    const includeWeather =
      args.includeWeather !== undefined
        ? Boolean(args.includeWeather) && hasWeatherData
        : sessionState?.includeWeather !== undefined
        ? Boolean(sessionState.includeWeather) && hasWeatherData
        : hasWeatherData;

    try {
      const list = await engine.searchCocktails(
        mood,
        weatherTags,
        occasion,
        personality,
        basis,
        includeWeather
      );
      const cocktail = list[0];
      if (cocktail && typeof cocktail === "object") {
        return { success: true, data: { cocktail } };
      }
      return {
        success: false,
        error: "No matching cocktail found",
        data: { cocktail: null },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to search cocktails: ${error}`,
      };
    }
  }

  async handleRecommendPerfume(
    args: z.infer<typeof recommendPerfumeArgsSchema>
  ): Promise<ToolResult> {
    const { engine, sessionState } = this.context;
    const prefs = sessionState?.preferences || {};
    const mood = args.mood || prefs.mood || [];
    const weatherTags = args.weather || prefs.weather || [];
    const occasion = args.occasion || prefs.occasion || [];
    const personality = args.personality || prefs.personality || [];
    const gender = args.gender || prefs.gender || "unisex";
    const basis = undefined;
    const hasWeatherData = prefs.weather && prefs.weather.length > 0;
    const includeWeather =
      args.includeWeather !== undefined
        ? Boolean(args.includeWeather) && hasWeatherData
        : sessionState?.includeWeather !== undefined
        ? Boolean(sessionState.includeWeather) && hasWeatherData
        : hasWeatherData;

    try {
      const list = await engine.searchPerfumes(
        mood,
        weatherTags,
        gender,
        occasion,
        personality,
        basis,
        includeWeather
      );
      const perfume = list[0];
      if (perfume && typeof perfume === "object") {
        return { success: true, data: { perfume } };
      }
      return {
        success: false,
        error: "No matching perfume found",
        data: { perfume: null },
      };
    } catch (error) {
      return {
        success: false,
        error: `Failed to search perfumes: ${error}`,
      };
    }
  }

  async handleGetWeather(
    args: z.infer<typeof getWeatherArgsSchema>
  ): Promise<ToolResult> {
    const { engine, sessionManager, sessionId, sessionState } = this.context;
    try {
      const weatherJson = await engine.getWeather(args.city);
      const weatherData = JSON.parse(weatherJson);

      if (
        typeof weatherData !== "object" ||
        weatherData === null ||
        !Array.isArray(weatherData.tags)
      ) {
        throw new Error("Invalid weather data structure");
      }

      // Update session state
      const updatedState: SessionState = {
        ...(sessionState || {}),
        preferences: {
          ...(sessionState?.preferences || {}),
          city: args.city,
          weather: weatherData.tags || [],
        },
        includeWeather: true,
      };
      sessionManager.saveSession(sessionId, updatedState);
      this.context.sessionState = updatedState;

      return { success: true, data: weatherData };
    } catch (error) {
      return {
        success: false,
        error: "Failed to fetch weather data",
        data: {
          error: "Failed to fetch weather data",
          city: args.city,
          tags: [],
        },
      };
    }
  }

  async handleSavePreferences(
    args: z.infer<typeof savePreferencesArgsSchema>
  ): Promise<ToolResult> {
    const { sessionManager, sessionId, sessionState } = this.context;
    const updatedState: SessionState = {
      ...(sessionState || {}),
      preferences: {
        ...(sessionState?.preferences || {}),
        ...(args.personality && { personality: args.personality }),
        ...(args.mood && { mood: args.mood }),
        ...(args.occasion && { occasion: args.occasion }),
        ...(args.weather && { weather: args.weather }),
        ...(args.gender && { gender: args.gender }),
        ...(args.city && { city: args.city }),
      },
    };
    sessionManager.saveSession(sessionId, updatedState);
    this.context.sessionState = updatedState;

    return {
      success: true,
      data: {
        success: true,
        preferences: updatedState.preferences,
        message: "Preferences saved successfully",
      },
    };
  }

  handleCheckPreferences(): ToolResult {
    const { sessionState } = this.context;
    const prefs = sessionState?.preferences || {};
    const filledFields: string[] = [];
    if (prefs.personality && prefs.personality.length > 0)
      filledFields.push("personality");
    if (prefs.mood && prefs.mood.length > 0) filledFields.push("mood");
    if (prefs.occasion && prefs.occasion.length > 0)
      filledFields.push("occasion");
    if (prefs.weather && prefs.weather.length > 0) filledFields.push("weather");
    if (prefs.gender) filledFields.push("gender");

    const hasAtLeastOne = filledFields.length > 0;

    return {
      success: true,
      data: {
        hasData: hasAtLeastOne,
        filledFields: filledFields,
        preferences: prefs,
        readyToRecommend: hasAtLeastOne,
      },
    };
  }
}

