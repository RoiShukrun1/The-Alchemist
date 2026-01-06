import pandas as pd
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
import json
import time
from tqdm import tqdm  # For progress bar display

# --- Configuration ---
import os
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

PROJECT_ID = os.getenv("GOOGLE_PROJECT_ID")
LOCATION = os.getenv("GOOGLE_LOCATION", "us-central1")

# Validate required environment variables
if not PROJECT_ID:
    raise ValueError(
        "GOOGLE_PROJECT_ID environment variable is required. "
        "Please set it in your .env file or environment."
    )

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
    success_count = 0
    failure_count = 0
    failed_items = []

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
            success_count += 1
            
            # Small delay to prevent API overload (optional, Flash usually handles it without)
            time.sleep(0.5) 

        except json.JSONDecodeError as e:
            failure_count += 1
            cocktail_name = row.get('name', 'Unknown')
            failed_items.append({"name": cocktail_name, "error": f"JSON decode error: {str(e)}"})
            print(f"\n⚠️  Skipped {cocktail_name}: Invalid JSON response")
            continue
        except Exception as e:
            failure_count += 1
            cocktail_name = row.get('name', 'Unknown')
            failed_items.append({"name": cocktail_name, "error": str(e)})
            print(f"\n⚠️  Skipped {cocktail_name}: {str(e)}")
            continue

    print(f"\n✅ Successfully enriched: {success_count} cocktails")
    print(f"❌ Failed: {failure_count} cocktails")
    
    # Save partial results even if some failed
    print(f"Saving enriched data to {OUTPUT_JSON}...")
    try:
        with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
            json.dump(enriched_data, f, indent=2, ensure_ascii=False)
        print(f"✅ Saved {len(enriched_data)} enriched cocktails to {OUTPUT_JSON}")
    except Exception as e:
        print(f"❌ Error saving file: {e}")
        # Save to backup file
        backup_file = OUTPUT_JSON.replace('.json', '_backup.json')
        try:
            with open(backup_file, 'w', encoding='utf-8') as f:
                json.dump(enriched_data, f, indent=2, ensure_ascii=False)
            print(f"✅ Saved backup to {backup_file}")
        except Exception as backup_error:
            print(f"❌ Failed to save backup: {backup_error}")
    
    # Save failure log
    if failed_items:
        failure_log = OUTPUT_JSON.replace('.json', '_failures.json')
        try:
            with open(failure_log, 'w', encoding='utf-8') as f:
                json.dump(failed_items, f, indent=2, ensure_ascii=False)
            print(f"📋 Failure log saved to {failure_log}")
        except Exception as log_error:
            print(f"⚠️  Could not save failure log: {log_error}")
    
    print("Done! You are ready for the MCP server.")

if __name__ == "__main__":
    main()