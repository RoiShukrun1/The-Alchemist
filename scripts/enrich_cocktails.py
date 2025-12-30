import pandas as pd
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
import json
import time
from tqdm import tqdm  # בשביל לראות פס התקדמות

# --- הגדרות ---
PROJECT_ID = "alchemy-482617"  # <--- שים פה את ה-ID של הפרויקט שלך ב-GCP
LOCATION = "us-central1"        # או ה-Region שבו אתה עובד
INPUT_CSV = "cocktails.csv"     # השם של קובץ ה-CSV שלך
OUTPUT_JSON = "cocktails_db.json"

# אתחול Vertex AI
vertexai.init(project=PROJECT_ID, location=LOCATION)

# שימוש במודל Flash לביצועים מהירים וחסכוניים
model = GenerativeModel("gemini-2.0-flash")

def generate_enrichment_prompt(row):
    """בונה את הפרומפט עבור קוקטייל בודד"""
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
    4. "description_he": A short, 1-sentence description of the cocktail in english (marketing style).
    
    Output strictly valid JSON only. No markdown formatting.
    """

def clean_json_string(s):
    """מנקה את התשובה של המודל למקרה שהוא הוסיף מרכאות מיותרות"""
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
    
    # לולאה על כל השורות ב-CSV
    # tqdm מוסיף פס התקדמות יפה
    for index, row in tqdm(df.iterrows(), total=df.shape[0]):
        try:
            prompt = generate_enrichment_prompt(row)
            
            # שליחה ל-Gemini
            response = model.generate_content(
                prompt,
                generation_config=GenerationConfig(
                    response_mime_type="application/json", # מכריח את המודל לענות ב-JSON
                    temperature=0.2 # טמפרטורה נמוכה לתשובות עקביות
                )
            )
            
            # המרת התשובה ל-Dictionary
            json_text = clean_json_string(response.text)
            metadata = json.loads(json_text)
            
            # יצירת האובייקט המלא (מקורי + חדש)
            cocktail_record = row.to_dict()
            cocktail_record.update(metadata) # הוספת השדות החדשים
            
            enriched_data.append(cocktail_record)
            
            # השהייה קטנה למניעת עומס על ה-API (אופציונלי, Flash לרוב מסתדר בלי)
            time.sleep(0.5) 

        except Exception as e:
            print(f"\nSkipping cocktail {row.get('name', 'Unknown')} due to error: {e}")
            continue

    # שמירת התוצאה
    print(f"Saving enriched data to {OUTPUT_JSON}...")
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(enriched_data, f, indent=2, ensure_ascii=False)
    
    print("Done! You are ready for the MCP server.")

if __name__ == "__main__":
    main()