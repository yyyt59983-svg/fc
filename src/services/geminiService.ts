import { getApiUrl } from "../utils/config";

export async function resetRoxySession(): Promise<boolean> {
  try {
    const res = await fetch(getApiUrl() + "/api/messages", { method: "DELETE" });
    return res.ok;
  } catch (err) {
    console.warn("Could not reach DB to clear messages (server starting up/offline) - clearing locally instead.", err);
    return false;
  }
}

export interface RoxyChatResponse {
  text: string;
  toolCall?: {
    name: string;
    args: any;
  };
}

export async function getRoxyResponse(
  prompt: string,
  aiMode = "professional",
  sessionId = "sess_default",
  activeVoiceProfileId = "prof_default"
): Promise<RoxyChatResponse> {
  try {
    const res = await fetch(getApiUrl() + "/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ 
        message: prompt, 
        aiMode,
        sessionId,
        activeVoiceProfileId
      }),
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    return {
      text: data.text || "Ayyo lo, sumne enu heltidya? Try again later.",
      toolCall: data.toolCall
    };
  } catch (error) {
    console.error("getRoxyResponse client error:", error);
    return {
      text: "Ayyo lo, some network error ansutte. Team ommnitech is probably fixing my brain. Try again in a bit!",
    };
  }
}

export async function getRoxyAudio(text: string): Promise<string | null> {
  try {
    const res = await fetch(getApiUrl() + "/api/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!res.ok) {
      throw new Error(`HTTP error! status: ${res.status}`);
    }

    const data = await res.json();
    return data.audio || null;
  } catch (error) {
    console.error("getRoxyAudio client error:", error);
    return null;
  }
}

// =========================================================================
// SESSIONS API SERVICE
// =========================================================================

export async function fetchSessions(): Promise<any[]> {
  try {
    const res = await fetch(getApiUrl() + "/api/sessions");
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Failed to fetch sessions", e);
  }
  return [];
}

export async function createSession(companionName: string, summary = ""): Promise<any> {
  try {
    const res = await fetch(getApiUrl() + "/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companionName, summary })
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Failed to create session", e);
  }
  return null;
}

export async function deleteSession(sessionId: string): Promise<boolean> {
  try {
    const res = await fetch(getApiUrl() + `/api/sessions/${sessionId}`, { method: "DELETE" });
    if (res.ok) {
      const data = await res.json();
      return !!data.success;
    }
  } catch (e) {
    console.error("Failed to delete session", e);
  }
  return false;
}

// =========================================================================
// VOICE PROFILES API SERVICE
// =========================================================================

export async function fetchVoiceProfiles(): Promise<any[]> {
  try {
    const res = await fetch(getApiUrl() + "/api/voice-profiles");
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Failed to fetch voice profiles", e);
  }
  return [];
}

export async function createVoiceProfile(profileData: any): Promise<any> {
  try {
    const res = await fetch(getApiUrl() + "/api/voice-profiles", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(profileData)
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Failed to create voice profile", e);
  }
  return null;
}

// =========================================================================
// USER PROFILES API SERVICE
// =========================================================================

export async function fetchUserProfile(username = "lo"): Promise<any> {
  try {
    const res = await fetch(getApiUrl() + `/api/user-profiles/${username}`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Failed to fetch user profile", e);
  }
  return null;
}

// =========================================================================
// MEMORIES API SERVICE
// =========================================================================

export async function fetchMemories(sessionId: string): Promise<any[]> {
  try {
    const res = await fetch(getApiUrl() + `/api/memories/${sessionId}`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Failed to fetch memories", e);
  }
  return [];
}

export async function createMemory(sessionId: string, content: string, importance = 3): Promise<any> {
  try {
    const res = await fetch(getApiUrl() + "/api/memories", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, content, importance })
    });
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Failed to create memory", e);
  }
  return null;
}

export async function deleteMemory(memoryId: string): Promise<boolean> {
  try {
    const res = await fetch(getApiUrl() + `/api/memories/${memoryId}`, { method: "DELETE" });
    if (res.ok) {
      const data = await res.json();
      return !!data.success;
    }
  } catch (e) {
    console.error("Failed to delete memory", e);
  }
  return false;
}

// =========================================================================
// PERFORMANCE AUDIT SPEECH LOGS API SERVICE
// =========================================================================

export async function fetchSpeechLogs(sessionId: string): Promise<any[]> {
  try {
    const res = await fetch(getApiUrl() + `/api/speech-logs/${sessionId}`);
    if (res.ok) return await res.json();
  } catch (e) {
    console.error("Failed to fetch speech logs", e);
  }
  return [];
}
