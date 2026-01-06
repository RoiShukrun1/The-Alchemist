import fs from "fs";
import path from "path";
import axios from "axios";
import {
  SCORING_WEIGHTS,
  API_CONFIG,
  CACHE_CONFIG,
} from "./config/constants.js";

// --- Interfaces ---
export interface Cocktail {
  id: string;
  name: string;
  ingredients: string[];
  description?: string;
  description_he?: string;
  instructions?: string;
  drinkThumbnail?: string;
  weather: string[];
  mood: string[];
  occasion?: string[];
  personality?: string[];
}

export interface Perfume {
  id: number;
  name: string;
  brand: string;
  gender: string;
  accords: string;
  description?: string;
  description_he?: string;
  image?: string;
  weather: string[];
  mood: string[];
  occasion?: string[];
  personality?: string[];
}

interface WeatherCacheEntry {
  data: string;
  timestamp: number;
}

export class AlchemyEngine {
  private cocktails: Cocktail[] = [];
  private perfumes: Perfume[] = [];
  private weatherApiKey: string | undefined;
  private weatherCache: Map<string, WeatherCacheEntry> = new Map();
  private readonly CACHE_TTL = CACHE_CONFIG.WEATHER_TTL;

  private dataLoaded = false;
  private dataLoadingPromise: Promise<void> | null = null;

  constructor(weatherApiKey?: string) {
    this.weatherApiKey = weatherApiKey;
    // Start loading data asynchronously, don't block
    this.loadDataAsync();
  }

  private async loadDataAsync(): Promise<void> {
    if (this.dataLoadingPromise) {
      return this.dataLoadingPromise;
    }
    this.dataLoadingPromise = this.loadData();
    await this.dataLoadingPromise;
  }

  public async ensureDataLoaded(): Promise<void> {
    if (this.dataLoaded) {
      return;
    }
    await this.loadDataAsync();
  }

  private async loadData(): Promise<void> {
    try {
      // Assuming data is in a sibling directory 'data'
      const cocktailsPath = path.join(
        __dirname,
        "..",
        "data",
        "cocktails.json"
      );
      const perfumesPath = path.join(__dirname, "..", "data", "perfumes.json");

      if (!fs.existsSync(cocktailsPath)) {
        console.error(`Error: Could not find file at ${cocktailsPath}`);
        return;
      }

      // Load and clean Cocktails
      const rawCocktails: unknown[] = JSON.parse(
        fs.readFileSync(cocktailsPath, "utf-8")
      );
      this.cocktails = rawCocktails.map((c: unknown) => {
        const cocktail = c as Record<string, unknown>;
        let safeIngredients: string[] = [];
        if (Array.isArray(cocktail.ingredients)) {
          safeIngredients = cocktail.ingredients as string[];
        } else if (typeof cocktail.ingredients === "string") {
          const cleanStr = cocktail.ingredients.replace(/[\[\]'"]/g, "");
          safeIngredients = cleanStr.split(",").map((s: string) => s.trim());
        }

        return {
          ...cocktail,
          ingredients: safeIngredients,
          instructions:
            (cocktail.instructions as string) ||
            (cocktail.strInstructions as string) ||
            "Mix all ingredients.",
          drinkThumbnail:
            (cocktail.drinkThumbnail as string) ||
            (cocktail.strDrinkThumb as string) ||
            "",
          description:
            (cocktail.description as string) ||
            (cocktail.description_he as string) ||
            "",
        } as Cocktail;
      });

      // Load Perfumes
      this.perfumes = JSON.parse(fs.readFileSync(perfumesPath, "utf-8"));

      this.dataLoaded = true;
      console.log(
        `✅ Loaded ${this.cocktails.length} cocktails and ${this.perfumes.length} perfumes.`
      );
    } catch (error) {
      console.error("Error loading data files:", error);
      this.dataLoaded = false;
    }
  }

  private calculateScore(
    itemTags: {
      mood?: string[];
      weather?: string[];
      occasion?: string[];
      personality?: string[];
    },
    userContext: {
      mood?: string[];
      weather?: string[];
      occasion?: string[];
      personality?: string[];
    },
    basis?: "personality" | "mood" | "occasion" | "daily" | "combined"
  ): number {
    let score = 0;
    const hasIntersection = (arr1: string[] = [], arr2: string[] = []) =>
      arr1.some((item) => arr2.includes(item));

    // Matching logic: exclusive basis OR combined (all factors together)
    if (basis === "personality") {
      // Exclusive: only personality
      if (userContext.personality && itemTags.personality) {
        const matches = userContext.personality.filter((p) =>
          itemTags.personality!.includes(p)
        );
        score = matches.length * SCORING_WEIGHTS.PERSONALITY_EXCLUSIVE;
      }
    } else if (basis === "mood") {
      // Exclusive: only mood
      if (userContext.mood && itemTags.mood) {
        const matches = userContext.mood.filter((m) =>
          itemTags.mood!.includes(m)
        );
        score = matches.length * SCORING_WEIGHTS.MOOD_EXCLUSIVE;
      }
    } else if (basis === "occasion") {
      // Exclusive: only occasion
      if (userContext.occasion && itemTags.occasion) {
        const matches = userContext.occasion.filter((o) =>
          itemTags.occasion!.includes(o)
        );
        score = matches.length * SCORING_WEIGHTS.OCCASION_EXCLUSIVE;
      }
    } else if (basis === "daily") {
      // Exclusive: daily items with mood bonus
      if (itemTags.occasion && itemTags.occasion.includes("daily")) {
        score = SCORING_WEIGHTS.DAILY_BASE;
        if (userContext.mood && itemTags.mood) {
          const matches = userContext.mood.filter((m) =>
            itemTags.mood!.includes(m)
          );
          score += matches.length * SCORING_WEIGHTS.DAILY_MOOD_BONUS;
        }
      }
    } else {
      // Combined or default: use ALL available factors together for richer matching
      if (userContext.personality && itemTags.personality) {
        const matches = userContext.personality.filter((p) =>
          itemTags.personality!.includes(p)
        );
        score += matches.length * SCORING_WEIGHTS.PERSONALITY_COMBINED;
      }
      if (userContext.mood && itemTags.mood) {
        const matches = userContext.mood.filter((m) =>
          itemTags.mood!.includes(m)
        );
        score += matches.length * SCORING_WEIGHTS.MOOD_COMBINED;
      }
      if (userContext.occasion && itemTags.occasion) {
        const matches = userContext.occasion.filter((o) =>
          itemTags.occasion!.includes(o)
        );
        score += matches.length * SCORING_WEIGHTS.OCCASION_COMBINED;
      }
      if (userContext.weather && itemTags.weather) {
        const matches = userContext.weather.filter((w) =>
          itemTags.weather!.includes(w)
        );
        score += matches.length * SCORING_WEIGHTS.WEATHER_COMBINED;
      }
    }

    return score;
  }

  // --- Search Functions (UPDATED to return top 1) ---

  public searchCocktails(
    mood: string[] = [],
    weather: string[] = [],
    occasion: string[] = [],
    personality: string[] = [],
    basis?: "personality" | "mood" | "occasion" | "daily" | "combined",
    includeWeather: boolean = true
  ) {
    // If weather is not included, use empty array
    const effectiveWeather = includeWeather ? weather : [];

    const scored = this.cocktails.map((drink) => ({
      item: drink,
      score: this.calculateScore(
        drink,
        { mood, weather: effectiveWeather, occasion, personality },
        basis
      ),
    }));

    // Sort by score and take ONLY the first one (.slice(0, 1))
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 1)
      .map((s) => s.item);
  }

  public async searchPerfumes(
    mood: string[] = [],
    weather: string[] = [],
    gender: string,
    occasion: string[] = [],
    personality: string[] = [],
    basis?: "personality" | "mood" | "occasion" | "daily" | "combined",
    includeWeather: boolean = true
  ): Promise<Perfume[]> {
    await this.ensureDataLoaded();
    // If weather is not included, use empty array
    const effectiveWeather = includeWeather ? weather : [];

    const scored = this.perfumes
      .filter((p) => {
        const pGender = p.gender ? p.gender.toLowerCase() : "unisex";
        const uGender = gender.toLowerCase();

        const isUserMale =
          uGender === "male" ||
          uGender === "man" ||
          uGender === "men" ||
          uGender === "boy";
        const isUserFemale =
          uGender === "female" ||
          uGender === "woman" ||
          uGender === "women" ||
          uGender === "girl";

        if (
          isUserMale &&
          (pGender.includes("women") || pGender.includes("female"))
        )
          return false;
        if (
          isUserFemale &&
          (pGender.includes("men") || pGender.includes("male"))
        )
          return false;

        return true;
      })
      .map((p) => ({
        item: p,
        score: this.calculateScore(
          p,
          { mood, weather: effectiveWeather, occasion, personality },
          basis
        ),
      }));

    // Sort by score and take ONLY the first one (.slice(0, 1))
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 1)
      .map((s) => s.item);
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async getWeather(city: string): Promise<string> {
    if (!this.weatherApiKey) {
      return JSON.stringify({
        error: "Weather API Key missing.",
        city: city,
        tags: [],
      });
    }

    // Check cache first
    const cacheKey = city.toLowerCase().trim();
    const cached = this.weatherCache.get(cacheKey);
    const now = Date.now();
    if (cached && now - cached.timestamp < this.CACHE_TTL) {
      return cached.data;
    }

    const maxRetries = API_CONFIG.WEATHER_MAX_RETRIES;
    const baseDelay = API_CONFIG.WEATHER_RETRY_BASE_DELAY;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const url = `https://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${this.weatherApiKey}&units=metric`;
        const response = await axios.get(url, {
          timeout: API_CONFIG.WEATHER_TIMEOUT,
        });
        const data = response.data;
        const temp = data.main.temp;
        const condition = data.weather[0].main.toLowerCase();

        const tags: string[] = [];
        if (temp > 25) tags.push("hot", "summer");
        else if (temp < 15) tags.push("cold", "winter");
        else tags.push("spring");

        if (condition.includes("rain")) tags.push("rainy");
        if (condition.includes("clear")) tags.push("sunny");

        const weatherData = JSON.stringify({
          city: data.name,
          temp: temp,
          description: data.weather[0].description,
          tags: tags,
        });

        // Cache the result
        this.weatherCache.set(cacheKey, {
          data: weatherData,
          timestamp: now,
        });

        return weatherData;
      } catch (error) {
        const isLastAttempt = attempt === maxRetries - 1;
        if (isLastAttempt) {
          return JSON.stringify({
            error: "Error fetching weather after multiple attempts.",
            city: city,
            tags: [],
          });
        }
        // Exponential backoff: 1s, 2s, 4s
        const delay = baseDelay * Math.pow(2, attempt);
        await this.sleep(delay);
      }
    }

    // Should never reach here, but TypeScript needs it
    return JSON.stringify({
      error: "Error fetching weather.",
      city: city,
      tags: [],
    });
  }
}
