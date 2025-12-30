import json
from deep_translator import GoogleTranslator

# 1. Load your data
try:
    with open('cocktails.json', 'r', encoding='utf-8') as f:
        data = json.load(f)
except FileNotFoundError:
    print("Error: 'cocktails.json' not found. Please make sure the file is in the same folder.")
    exit()

# --- THE FIX IS HERE: Change 'he' to 'iw' ---
translator = GoogleTranslator(source='iw', target='en')

# 2. Iterate and fix
count = 0
for drink in data:
    # Check if the Hebrew description exists
    if 'description_he' in drink:
        try:
            he_text = drink['description_he']
            
            # Skip empty strings
            if not he_text:
                continue

            # Perform translation
            en_text = translator.translate(he_text)
            
            # Create new key 'description' and remove the old 'description_he'
            drink['description'] = en_text
            del drink['description_he']
            
            count += 1
            print(f"Fixed ({count}): {drink.get('name', 'Unknown')}")
            
        except Exception as e:
            print(f"Error translating {drink.get('name', 'Unknown')}: {e}")

# 3. Save the fixed data
output_file = 'cocktails_fixed.json'
with open(output_file, 'w', encoding='utf-8') as f:
    json.dump(data, f, indent=4, ensure_ascii=False)

print(f"Done! Successfully translated {count} items.")
print(f"Saved to {output_file}")