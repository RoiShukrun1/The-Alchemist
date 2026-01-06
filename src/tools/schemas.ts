import { z } from "zod";

export const recommendCocktailArgsSchema = z.object({
  mood: z.array(z.string()).optional(),
  weather: z.array(z.string()).optional(),
  occasion: z.array(z.string()).optional(),
  personality: z.array(z.string()).optional(),
  basis: z.string().optional(),
  includeWeather: z.boolean().optional(),
});

export const recommendPerfumeArgsSchema = z.object({
  mood: z.array(z.string()).optional(),
  weather: z.array(z.string()).optional(),
  gender: z.string().optional(),
  occasion: z.array(z.string()).optional(),
  personality: z.array(z.string()).optional(),
  basis: z.string().optional(),
  includeWeather: z.boolean().optional(),
});

export const getWeatherArgsSchema = z.object({
  city: z.string().min(1, "City cannot be empty").max(100, "City name too long"),
});

export const savePreferencesArgsSchema = z.object({
  personality: z.array(z.string()).optional(),
  mood: z.array(z.string()).optional(),
  occasion: z.array(z.string()).optional(),
  weather: z.array(z.string()).optional(),
  gender: z.string().optional(),
  city: z.string().optional(),
});

