import pandas as pd
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
import json
import time
from tqdm import tqdm  # For progress bar display

# --- Configuration ---
import os
PROJECT_ID = "alchemy-482617"  
LOCATION = "us-central1"       
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
INPUT_CSV = os.path.join(DATA_DIR, "cocktails.csv")
OUTPUT_JSON = os.path.join(DATA_DIR, "cocktails.json")

# Initialize Vertex AI
vertexai.init(project=PROJECT_ID, location=LOCATION)

# Use Flash model for fast and cost-effective performance
model = GenerativeModel("gemini-2.0-flash")

def generate_enrichment_prompt(row):
    """Builds the prompt for a single cocktail"""
    return f"""
    You are an expert mixologist building a database for a smart recommendation AI.
    Analyze this cocktail and return a raw JSON object with metadata.
    
    COCKTAIL DETAILS:
    Name: {row['name']}
    Ingredients: {row['ingredients']}
    Category: {row.get('category', 'Unknown')}
    
    REQUIRED JSON OUTPUT FIELDS:
    1. "weather": List of strings from ["hot", "cold", "rainy", "sunny", "winter", "summer"].
    2. "mood": List of strings from ["happy", "romantic", "party", "relaxed", "sad", "adventurous"].
    3. "flavor": String. One of ["sweet", "sour", "bitter", "salty", "spicy", "smoky", "fruity", "creamy"].
    4. "personality": List of personality traits (array of strings) that match this cocktail.
       Examples: ["sophisticated", "adventurous", "confident", "romantic", "bold", "elegant", "mysterious", "playful", "refined", "free-spirited", "social", "relaxed"].
       Analyze the ingredients, flavor profile, and overall character to determine 3-5 personality traits that best describe who would enjoy this cocktail.
    5. "description_he": A short, 1-sentence description of the cocktail in english (marketing style).
    
    Output strictly valid JSON only. No markdown formatting.
    """

def clean_json_string(s):
    """Cleans the model response in case it added extra quotes"""
    s = s.strip()
    if s.startswith("```json"):
        s = s[7:]
    if s.endswith("```"):
        s = s[:-3]
    return s.strip()

def main():
    print(f"Loading {INPUT_CSV}...")
    try:
        df = pd.read_csv(INPUT_CSV)
    except FileNotFoundError:
        print("Error: CSV file not found. Please check the file name.")
        return

    enriched_data = []

    print(f"Starting enrichment for {len(df)} cocktails...")
    
    # Loop through all rows in CSV
    # tqdm adds a nice progress bar
    for index, row in tqdm(df.iterrows(), total=df.shape[0]):
        try:
            prompt = generate_enrichment_prompt(row)
            
            # Send to Gemini
            response = model.generate_content(
                prompt,
                generation_config=GenerationConfig(
                    response_mime_type="application/json",  # Force model to respond in JSON
                    temperature=0.2  # Low temperature for consistent responses
                )
            )
            
            # Convert response to Dictionary
            json_text = clean_json_string(response.text)
            metadata = json.loads(json_text)
            
            # Create full object (original + new)
            cocktail_record = row.to_dict()
            cocktail_record.update(metadata)  # Add new fields
            
            enriched_data.append(cocktail_record)
            
            # Small delay to prevent API overload (optional, Flash usually handles it without)
            time.sleep(0.5) 

        except Exception as e:
            print(f"\nSkipping cocktail {row.get('name', 'Unknown')} due to error: {e}")
            continue

    # Save the result
    print(f"Saving enriched data to {OUTPUT_JSON}...")
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(enriched_data, f, indent=2, ensure_ascii=False)
    
    print("Done! You are ready for the MCP server.")

if __name__ == "__main__":
    main()