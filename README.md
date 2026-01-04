# The Alchemist ⚗️

A sophisticated AI-powered application that crafts the perfect pairing of cocktails and perfumes, tailored to your personality, mood, occasion, and preferences.

## Overview

The Alchemist is a sensory alchemy platform that uses advanced AI (Google Gemini 2.0 Flash) to recommend personalized cocktail and perfume pairings. Through an elegant conversational interface, The Alchemist learns about your personality, mood, special occasions, and even weather preferences to create the perfect sensory experience.

## Features

- **Intelligent Pairing**: AI-powered recommendations based on personality, mood, occasion, and weather
- **Natural Conversation**: Engaging, non-deterministic chat experience that adapts to your communication style
- **Comprehensive Database**:
  - 425+ enriched cocktails with detailed descriptions, ingredients, and instructions
  - 490+ perfumes with personality traits, accords, and brand information
- **Weather Integration**: Optional weather-based recommendations using OpenWeatherMap API
- **Elegant UI**: Modern, dark-themed interface with blue and gold gradient accents
- **Session Management**: Save and manage multiple conversations
- **Responsive Design**: Beautiful experience across all devices

## Architecture

### Backend (Node.js + TypeScript)

- **Express.js** server handling API requests
- **Vertex AI / Gemini 2.0 Flash** for natural language processing
- **AlchemyEngine** for intelligent matching and scoring
- Session state management for conversation continuity

### Frontend (React + TypeScript)

- **React** with TypeScript for type safety
- **Vite** for fast development and building
- **ReactMarkdown** for beautiful message rendering
- Modern CSS with glassmorphism effects

### Data Enrichment (Python)

- Python scripts for enriching cocktail and perfume data
- AI-powered metadata generation (personality, mood, occasion, weather tags)
- CSV to JSON conversion with intelligent filtering

## 📁 Project Structure

```
The-Alchemist/
├── client/                 # React frontend
│   ├── src/
│   │   ├── App.tsx        # Main application component
│   │   ├── App.css        # Styling
│   │   └── main.tsx       # Entry point
│   ├── public/
│   │   ├── logo.png       # Application logo
│   │   └── icon.png       # Favicon
│   └── package.json
├── src/                    # Backend source
│   ├── server.ts          # Express server and API routes
│   └── engine.ts          # AlchemyEngine - matching logic
├── scripts/                # Data enrichment scripts
│   ├── enrich_cocktails.py
│   ├── enrich_perfumes.py
│   └── translate.py
├── data/                   # Data files
│   ├── cocktails.json     # Enriched cocktail data
│   ├── cocktails.csv       # Source cocktail data
│   ├── perfumes.json       # Enriched perfume data
│   └── perfumes.csv        # Source perfume data
└── package.json
```

## 🚀 Getting Started

### Prerequisites

- Node.js (v18 or higher)
- Python 3.8+ (for data enrichment scripts)
- Google Cloud Project with Vertex AI enabled
- OpenWeatherMap API key (optional, for weather features)

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/RoiShukrun1/The-Alchemist.git
   cd The-Alchemist
   ```

2. **Install backend dependencies**

   ```bash
   npm install
   ```

3. **Install frontend dependencies**

   ```bash
   cd client
   npm install
   cd ..
   ```

4. **Set up environment variables**

   Create a `.env` file in the root directory:

   ```env
   GOOGLE_PROJECT_ID=your-project-id
   GOOGLE_LOCATION=us-central1
   GOOGLE_KEY_PATH=path/to/service-account.json
   OPENWEATHER_API_KEY=your-openweather-api-key
   ```

5. **Compile TypeScript**
   ```bash
   npx tsc
   ```

### Running the Application

1. **Start the backend server**

   ```bash
   node dist/server.js
   ```

   The server will run on `http://localhost:3000`

2. **Start the frontend development server**

   ```bash
   cd client
   npm run dev
   ```

   The frontend will run on `http://localhost:5173`

3. **Build for production**

   ```bash
   # Backend
   npx tsc

   # Frontend
   cd client
   npm run build
   ```

## Data Enrichment

The project includes Python scripts to enrich cocktail and perfume data with AI-generated metadata:

### Enrich Cocktails

```bash
cd scripts
python enrich_cocktails.py
```

### Enrich Perfumes

```bash
cd scripts
python enrich_perfumes.py
```

These scripts:

- Load data from CSV files
- Use Vertex AI to generate personality traits, mood tags, occasion tags, and weather tags
- Save enriched data to JSON files
- Include error handling and retry logic

## 🔧 Configuration

### Matching Basis

The Alchemist supports flexible matching strategies:

- **Combined**: Uses all available data (personality, mood, occasion, weather, gender) for holistic matching
- **Exclusive**: Focus on a specific aspect

### Session Management

Conversations are stored in browser localStorage, allowing you to:

- Switch between multiple conversations
- Delete conversations
- Maintain conversation history

## 🎯 How It Works

1. **User Interaction**: The Alchemist engages in natural conversation, asking about:

   - Personality traits
   - Current mood
   - Special occasions
   - Gender preference (for perfumes)
   - Weather consideration

2. **Data Collection**: User preferences are stored in session state as they share information

3. **Intelligent Matching**: The AlchemyEngine scores cocktails and perfumes based on:

   - Personality alignment
   - Mood compatibility
   - Occasion appropriateness
   - Weather suitability
   - Gender preference (for perfumes)

4. **Recommendations**: The system presents the best-matched cocktail and perfume pairing with:
   - Beautiful images (cocktails only)
   - Detailed descriptions
   - Ingredients/accords
   - Instructions

## Technologies Used

### Backend

- **Node.js** - Runtime environment
- **TypeScript** - Type-safe development
- **Express.js** - Web framework
- **@google-cloud/vertexai** - Google Vertex AI integration
- **dotenv** - Environment variable management

### Frontend

- **React 19** - UI framework
- **TypeScript** - Type safety
- **Vite** - Build tool
- **ReactMarkdown** - Markdown rendering
- **Axios** - HTTP client

### Data Processing

- **Python 3.8+** - Scripting language
- **pandas** - Data manipulation
- **vertexai** - AI integration

## API Endpoints

### `POST /api/chat`

Send a message to The Alchemist and receive a response.

**Request:**

```json
{
  "message": "I want a sophisticated cocktail for a date",
  "sessionId": "conv-1234567890"
}
```

**Response:**

```json
{
  "text": "The Alchemist's response..."
}
```

## Design

The application features:

- **Dark theme** with blue and gold gradient accents
- **Glassmorphism** effects for modern UI elements
- **Centered conversation** layout for focused interaction
- **Responsive design** for all screen sizes
- **Smooth animations** and transitions

## Author

Roi Shukrun

## Acknowledgments

- Google Vertex AI / Gemini 2.0 Flash for natural language processing
- OpenWeatherMap for weather data
- All contributors to the open-source libraries used in this project

Happy coding!
