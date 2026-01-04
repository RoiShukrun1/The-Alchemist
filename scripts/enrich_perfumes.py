import pandas as pd
import vertexai
from vertexai.generative_models import GenerativeModel, GenerationConfig
import json
import time
from tqdm import tqdm

# --- Configuration ---
import os
PROJECT_ID = "alchemy-482617"
LOCATION = "us-central1"
# Get the script directory and navigate to data directory
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.dirname(SCRIPT_DIR)
DATA_DIR = os.path.join(PROJECT_ROOT, "data")
INPUT_CSV = os.path.join(DATA_DIR, "perfumes.csv")
OUTPUT_JSON = os.path.join(DATA_DIR, "perfumes.json")

vertexai.init(project=PROJECT_ID, location=LOCATION)
model = GenerativeModel("gemini-2.0-flash")

def generate_perfume_prompt(row):
    # Extract accord columns from the CSV file
    accords_list = []
    for i in range(1, 6):
        # Column names in file are mainaccord1, mainaccord2, etc.
        val = row.get(f'mainaccord{i}')
        if pd.notna(val):
            accords_list.append(str(val))
    
    accords = ", ".join(accords_list)
    
    return f"""
    You are a luxury perfume expert. Analyze this fragrance profile.
    
    PERFUME DETAILS:
    Name: {row.get('Perfume', 'Unknown')}
    Brand: {row.get('Brand', 'Unknown')}
    Gender: {row.get('Gender', 'Unknown')}
    Main Accords: {accords}
    Top Notes: {row.get('Top', '')} 
    
    REQUIRED JSON OUTPUT:
    1. "weather": List from ["hot", "cold", "rainy", "spring", "autumn", "winter", "summer"].
       (Logic: Fresh/Citrus/Aquatic -> Summer/Hot. Woody/Spicy/Sweet/Amber -> Winter/Cold).
    2. "mood": List from ["romantic", "professional", "fresh", "seductive", "cozy", "energetic", "elegant"].
    3. "occasion": List from ["daily", "date", "office", "party", "gym", "evening_event"].
    4. "personality": List of personality traits (array of strings) that match this fragrance.
       Examples: ["sophisticated", "adventurous", "confident", "romantic", "bold", "elegant", "mysterious", "playful", "refined", "free-spirited"].
       Analyze the accords, notes, and overall character to determine 3-5 personality traits that best describe who would wear this fragrance.
    5. "description_he": A sophisticated 1-sentence description in english describing the scent vibe.
    
    Output strictly valid JSON only.
    """

def clean_json_string(s):
    s = s.strip()
    if s.startswith("```json"): s = s[7:]
    if s.endswith("```"): s = s[:-3]
    return s.strip()

def main():
    print(f"Loading {INPUT_CSV}...")
    
    # Load CSV with semicolon separator
    try:
        df = pd.read_csv(INPUT_CSV, encoding='latin1', sep=';', on_bad_lines='skip')
    except:
        df = pd.read_csv(INPUT_CSV, encoding='ISO-8859-1', sep=';', on_bad_lines='skip')
    
    print(f"Original size (valid rows): {len(df)} perfumes.")
    
    # Convert to numeric and clean
    df['Rating Count'] = pd.to_numeric(df['Rating Count'], errors='coerce')
    df['Rating Value'] = pd.to_numeric(df['Rating Value'], errors='coerce')
    df = df.dropna(subset=['Rating Value', 'Rating Count'])

   
    df_filtered = df[df['Rating Count'] >= 10]
    if len(df_filtered) >= 1000:
        df_top = df_filtered.nlargest(1000, 'Rating Value')
    else:
        df_filtered = df[df['Rating Count'] >= 5]
        if len(df_filtered) >= 1000:
            df_top = df_filtered.nlargest(1000, 'Rating Value')
        else:
            df_top = df.nlargest(1000, 'Rating Value')
    
    print(f"Filtered down to top {len(df_top)} perfumes for processing.")
    
    enriched_data = []

    for index, row in tqdm(df_top.iterrows(), total=df_top.shape[0]):
        try:
            prompt = generate_perfume_prompt(row)
            
            response = model.generate_content(
                prompt,
                generation_config=GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0.2
                )
            )
            
            json_text = clean_json_string(response.text)
            metadata = json.loads(json_text)
            
            perfume_record = {
                "id": index, 
                "name": row.get('Perfume'),
                "brand": row.get('Brand'),
                "gender": row.get('Gender'), 
                "image": row.get('url'),  # Note: column name is 'url' in lowercase
                "accords": row.get('mainaccord1', ''), 
                **metadata 
            }
            
            enriched_data.append(perfume_record)

        except Exception as e:
            continue

    print(f"Saving enriched data to {OUTPUT_JSON}...")
    with open(OUTPUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(enriched_data, f, indent=2, ensure_ascii=False)

if __name__ == "__main__":
    main()