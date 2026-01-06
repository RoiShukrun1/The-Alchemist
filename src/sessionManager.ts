import fs from "fs";
import path from "path";
import { ChatSession } from "@google-cloud/vertexai";

interface UserPreferences {
  personality?: string[];
  mood?: string[];
  occasion?: string[];
  weather?: string[];
  gender?: string;
  city?: string;
}

export interface SessionState {
  preferences?: UserPreferences;
  includeWeather?: boolean;
  readyToRecommend?: boolean;
  lastAccessed?: number;
}

interface SessionData {
  sessionId: string;
  state: SessionState;
  createdAt: number;
  lastAccessed: number;
}

export class SessionManager {
  private sessionsDir: string;
  private readonly SESSION_EXPIRY = 24 * 60 * 60 * 1000; // 24 hours

  constructor(sessionsDir: string = path.join(process.cwd(), "data", "sessions")) {
    this.sessionsDir = sessionsDir;
    this.ensureSessionsDir();
  }

  private ensureSessionsDir(): void {
    if (!fs.existsSync(this.sessionsDir)) {
      fs.mkdirSync(this.sessionsDir, { recursive: true });
    }
  }

  private getSessionFilePath(sessionId: string): string {
    return path.join(this.sessionsDir, `${sessionId}.json`);
  }

  loadSession(sessionId: string): SessionState | null {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      if (!fs.existsSync(filePath)) {
        return null;
      }

      const data = fs.readFileSync(filePath, "utf-8");
      const sessionData: SessionData = JSON.parse(data);

      // Check if session has expired
      const now = Date.now();
      if (now - sessionData.lastAccessed > this.SESSION_EXPIRY) {
        this.deleteSession(sessionId);
        return null;
      }

      return sessionData.state;
    } catch (error) {
      console.error(`Error loading session ${sessionId}:`, error);
      return null;
    }
  }

  saveSession(sessionId: string, state: SessionState): void {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      const now = Date.now();

      const sessionData: SessionData = {
        sessionId,
        state: {
          ...state,
          lastAccessed: now,
        },
        createdAt: this.getCreatedAt(sessionId) || now,
        lastAccessed: now,
      };

      fs.writeFileSync(filePath, JSON.stringify(sessionData, null, 2), "utf-8");
    } catch (error) {
      console.error(`Error saving session ${sessionId}:`, error);
    }
  }

  deleteSession(sessionId: string): void {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`Error deleting session ${sessionId}:`, error);
    }
  }

  private getCreatedAt(sessionId: string): number | null {
    try {
      const filePath = this.getSessionFilePath(sessionId);
      if (fs.existsSync(filePath)) {
        const data = fs.readFileSync(filePath, "utf-8");
        const sessionData: SessionData = JSON.parse(data);
        return sessionData.createdAt;
      }
    } catch (error) {
      // Ignore errors
    }
    return null;
  }

  loadAllSessions(): Map<string, SessionState> {
    const sessions = new Map<string, SessionState>();
    try {
      const files = fs.readdirSync(this.sessionsDir);
      for (const file of files) {
        if (file.endsWith(".json")) {
          const sessionId = file.replace(".json", "");
          const state = this.loadSession(sessionId);
          if (state) {
            sessions.set(sessionId, state);
          }
        }
      }
    } catch (error) {
      console.error("Error loading all sessions:", error);
    }
    return sessions;
  }

  cleanupExpiredSessions(): number {
    let cleaned = 0;
    try {
      const files = fs.readdirSync(this.sessionsDir);
      const now = Date.now();

      for (const file of files) {
        if (file.endsWith(".json")) {
          const sessionId = file.replace(".json", "");
          const filePath = this.getSessionFilePath(sessionId);
          try {
            const data = fs.readFileSync(filePath, "utf-8");
            const sessionData: SessionData = JSON.parse(data);

            if (now - sessionData.lastAccessed > this.SESSION_EXPIRY) {
              this.deleteSession(sessionId);
              cleaned++;
            }
          } catch (error) {
            // If file is corrupted, delete it
            this.deleteSession(sessionId);
            cleaned++;
          }
        }
      }
    } catch (error) {
      console.error("Error cleaning up sessions:", error);
    }
    return cleaned;
  }
}

