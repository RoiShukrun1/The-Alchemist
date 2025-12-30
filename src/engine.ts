import fs from "fs";
import path from "path";
import axios from "axios";

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
}

export class AlchemyEngine {
  private cocktails: Cocktail[] = [];
  private perfumes: Perfume[] = [];
  private weatherApiKey: string | undefined;

  constructor(weatherApiKey?: string) {
    this.weatherApiKey = weatherApiKey;
    this.loadData();
  }

  private loadData() {
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
      const rawCocktails = JSON.parse(fs.readFileSync(cocktailsPath, "utf-8"));
      this.cocktails = rawCocktails.map((c: any) => {
        let safeIngredients: string[] = [];
        if (Array.isArray(c.ingredients)) {
          safeIngredients = c.ingredients;
        } else if (typeof c.ingredients === "string") {
          const cleanStr = c.ingredients.replace(/[\[\]'"]/g, "");
          safeIngredients = cleanStr.split(",").map((s: string) => s.trim());
        }

        return {
          ...c,
          ingredients: safeIngredients,
          instructions:
            c.instructions || c.strInstructions || "Mix all ingredients.",
          drinkThumbnail: c.drinkThumbnail || c.strDrinkThumb || "",
          description: c.description || c.description_he || "",
        };
      });

      // Load Perfumes
      this.perfumes = JSON.parse(fs.readFileSync(perfumesPath, "utf-8"));

      console.error(
        `Loaded ${this.cocktails.length} cocktails and ${this.perfumes.length} perfumes.`
      );
    } catch (error) {
      console.error("Error loading data files:", error);
    }
  }

  private calculateScore(
    itemTags: { mood?: string[]; weather?: string[]; occasion?: string[] },
    userContext: { mood: string[]; weather: string[]; occasion: string[] }
  ): number {
    let score = 0;
    const hasIntersection = (arr1: string[] = [], arr2: string[] = []) =>
      arr1.some((item) => arr2.includes(item));

    if (hasIntersection(userContext.weather, itemTags.weather)) score += 30;
    if (hasIntersection(userContext.mood, itemTags.mood)) score += 30;
    if (hasIntersection(userContext.occasion, itemTags.occasion)) score += 20;

    return score;
  }

  // --- Search Functions (UPDATED to return top 1) ---

  public searchCocktails(
    mood: string[],
    weather: string[],
    occasion: string[] = []
  ) {
    const scored = this.cocktails.map((drink) => ({
      item: drink,
      score: this.calculateScore(drink, { mood, weather, occasion }),
    }));

    // Sort by score and take ONLY the first one (.slice(0, 1))
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 1)
      .map((s) => s.item);
  }

  public searchPerfumes(
    mood: string[],
    weather: string[],
    gender: string,
    occasion: string[] = []
  ) {
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
        score: this.calculateScore(p, { mood, weather, occasion }),
      }));

    // Sort by score and take ONLY the first one (.slice(0, 1))
    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, 1)
      .map((s) => s.item);
  }

  public async getWeather(city: string): Promise<string> {
    if (!this.weatherApiKey) return "Weather API Key missing.";
    try {
      const url = `http://api.openweathermap.org/data/2.5/weather?q=${city}&appid=${this.weatherApiKey}&units=metric`;
      const response = await axios.get(url);
      const data = response.data;
      const temp = data.main.temp;
      const condition = data.weather[0].main.toLowerCase();

      const tags: string[] = [];
      if (temp > 25) tags.push("hot", "summer");
      else if (temp < 15) tags.push("cold", "winter");
      else tags.push("spring");

      if (condition.includes("rain")) tags.push("rainy");
      if (condition.includes("clear")) tags.push("sunny");

      return JSON.stringify({
        city: data.name,
        temp: temp,
        description: data.weather[0].description,
        tags: tags,
      });
    } catch (error) {
      return "Error fetching weather.";
    }
  }
}
