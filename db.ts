import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import os from "os";

// Ensure database is stored in a permanent home directory path so it is never lost/forgotten across launches
const ROXY_DIR = path.join(os.homedir(), ".roxy");
if (!fs.existsSync(ROXY_DIR)) {
  fs.mkdirSync(ROXY_DIR, { recursive: true });
}
const DB_PATH = path.join(ROXY_DIR, "roxy_history.db");
const db = new Database(DB_PATH);

// Enforce foreign keys and WAL mode for high performance scale
db.exec("PRAGMA foreign_keys = ON;");
db.exec("PRAGMA journal_mode = WAL;");
db.exec("PRAGMA synchronous = NORMAL;");

export function initDatabase() {
  console.log(`[DB] Initializing Omni Database at ${DB_PATH}...`);

  // Detect and drop legacy stale table to successfully upgrade SQLite schema
  try {
    const tableInfo = db.pragma("table_info(messages)") as any[];
    if (tableInfo && tableInfo.length > 0) {
      const hasSessionId = tableInfo.some(col => col.name === "session_id");
      if (!hasSessionId) {
        console.log("[DB] Stale legacy 'messages' table detected. Upgrading database to Omni schema...");
        db.exec("DROP TABLE IF EXISTS messages;");
      }
    }
  } catch (e) {
    // Ignore if table info could not be fetched
  }

  // 1. Sessions Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      session_id TEXT PRIMARY KEY,
      companion_name TEXT NOT NULL,
      summary TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 2. Voice Profiles Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS voice_profiles (
      profile_id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      pitch_shift REAL DEFAULT 0.0,
      speed_rate REAL DEFAULT 1.0,
      volume_gain REAL DEFAULT 0.0,
      voice_model_path TEXT,
      formant_shift REAL DEFAULT 1.0,
      whisper_mode INTEGER DEFAULT 0,
      reverb_wetness REAL DEFAULT 0.0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 3. Messages Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      message_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      sender TEXT NOT NULL CHECK(sender IN ('user', 'companion', 'roxy')),
      text_content TEXT NOT NULL,
      audio_path TEXT,
      audio_blob BLOB,
      latency_ms INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
    )
  `);

  // 4. Speech Modulation Logs Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS speech_modulation_logs (
      log_id TEXT PRIMARY KEY,
      message_id TEXT NOT NULL,
      profile_id TEXT,
      input_audio_path TEXT,
      output_audio_path TEXT,
      modulation_duration_ms INTEGER,
      additional_metadata TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE,
      FOREIGN KEY (profile_id) REFERENCES voice_profiles(profile_id) ON DELETE SET NULL
    )
  `);

  // 5. User Profiles Table
  db.exec(`
    CREATE TABLE IF NOT EXISTS user_profiles (
      user_id TEXT PRIMARY KEY,
      username TEXT NOT NULL UNIQUE,
      relationship_score REAL DEFAULT 5.0,
      dynamic_preferences TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 6. Companion Memories Table (RAG)
  db.exec(`
    CREATE TABLE IF NOT EXISTS companion_memories (
      memory_id TEXT PRIMARY KEY,
      session_id TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT NOT NULL, -- JSON serialized number array
      importance INTEGER DEFAULT 3,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
    )
  `);

  // Safely add username column to companion_memories if it doesn't exist (schema upgrade)
  try {
    const cols = db.pragma("table_info(companion_memories)") as any[];
    const hasUsername = cols.some((c: any) => c.name === "username");
    if (!hasUsername) {
      db.exec("ALTER TABLE companion_memories ADD COLUMN username TEXT DEFAULT 'lo';");
      console.log("[DB] Schema upgraded: added 'username' column to companion_memories.");
    }
  } catch (e) {
    // If the table doesn't exist yet, the CREATE TABLE above will include username on next run
  }

  // Create indexes
  db.exec("CREATE INDEX IF NOT EXISTS idx_messages_session ON messages(session_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_speech_logs_message ON speech_modulation_logs(message_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_memories_session ON companion_memories(session_id);");
  db.exec("CREATE INDEX IF NOT EXISTS idx_memories_username ON companion_memories(username);");

  // Detect if existing memories have outdated 768-dimension vectors and clear them to re-seed with 3072
  try {
    const sampleMem = db.prepare("SELECT embedding FROM companion_memories LIMIT 1").get() as any;
    if (sampleMem && sampleMem.embedding) {
      const emb = JSON.parse(sampleMem.embedding);
      if (emb && emb.length === 768) {
        console.log("[DB] Detected legacy 768-dimension embeddings. Clearing companion_memories to upgrade to 3072...");
        db.exec("DELETE FROM companion_memories;");
      }
    }
  } catch (e) {
    // Table might not exist yet, which is fine
  }

  // Seed default data
  seedDefaultData();
}

function seedDefaultData() {
  console.log("[DB] Seeding default voice profiles, session, and user profile...");

  // 1. Seed Voice Profiles
  const profiles = [
    {
      profile_id: "prof_default",
      name: "Default Roxy",
      pitch_shift: 0.0,
      speed_rate: 1.00,
      volume_gain: 0.0,
      voice_model_path: "",
      formant_shift: 1.0,
      whisper_mode: 0,
      reverb_wetness: 0.0
    },
    {
      profile_id: "prof_cheerful",
      name: "Cheerful Companion",
      pitch_shift: 3.0,
      speed_rate: 1.08,
      volume_gain: 1.0,
      voice_model_path: "models/voices/cheerful_neural_v2.pth",
      formant_shift: 1.1,
      whisper_mode: 0,
      reverb_wetness: 0.1
    },
    {
      profile_id: "prof_cybernetic",
      name: "Cybernetic Bot",
      pitch_shift: -5.5,
      speed_rate: 0.90,
      volume_gain: 2.0,
      voice_model_path: "models/voices/robot_metallic.pth",
      formant_shift: 0.75,
      whisper_mode: 0,
      reverb_wetness: 0.35
    },
    {
      profile_id: "prof_asmr",
      name: "ASMR Whisperer",
      pitch_shift: 0.5,
      speed_rate: 0.82,
      volume_gain: -1.0,
      voice_model_path: "models/voices/asmr_breath_v1.pth",
      formant_shift: 1.0,
      whisper_mode: 1,
      reverb_wetness: 0.25
    }
  ];

  const insertProfile = db.prepare(`
    INSERT OR IGNORE INTO voice_profiles (
      profile_id, name, pitch_shift, speed_rate, volume_gain, 
      voice_model_path, formant_shift, whisper_mode, reverb_wetness
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const p of profiles) {
    insertProfile.run(
      p.profile_id,
      p.name,
      p.pitch_shift,
      p.speed_rate,
      p.volume_gain,
      p.voice_model_path,
      p.formant_shift,
      p.whisper_mode,
      p.reverb_wetness
    );
  }

  // 2. Seed Default User Profile
  const insertUser = db.prepare(`
    INSERT OR IGNORE INTO user_profiles (user_id, username, relationship_score, dynamic_preferences)
    VALUES (?, ?, ?, ?)
  `);
  insertUser.run("usr_default", "macha", 5.0, JSON.stringify({
    fullname: "Bengaluru Native",
    favorite_drink: "Filter Coffee",
    relationship_status: "Loyal Friend"
  }));

  // 3. Seed Default Session
  const insertSession = db.prepare(`
    INSERT OR IGNORE INTO sessions (session_id, companion_name, summary)
    VALUES (?, ?, ?)
  `);
  insertSession.run("sess_default", "Roxy", "Initial introductory discussion room.");

  // 4. Seed Permanent Unerasable Core Memories for Programmer Team
  const devs = [
    "Programmer team member: vrushank M venkat (vrushank)",
    "Programmer team member: vinith d b (D B)",
    "Programmer team member: uday",
    "Programmer team member: vedha",
    "Programmer team member: tejaswani S (huli or TIGER)",
    "Programmer team member: tejaswani K",
    "Programmer team member: Thanushree",
    "Programmer team member: Yashwanth N. (Key Developer Pillar)",
    "Common College of Study: All Roxy AI creators and programmers study together at Rajarajeswari College of Engineering (RRCE)."
  ];

  const checkMemory = db.prepare("SELECT * FROM companion_memories WHERE content = ?");
  const insertMemory = db.prepare(`
    INSERT INTO companion_memories (memory_id, session_id, content, embedding, importance)
    VALUES (?, ?, ?, ?, 5)
  `);

  const mockEmb = JSON.stringify(new Array(3072).fill(0));

  for (const dev of devs) {
    const exists = checkMemory.get(dev);
    if (!exists) {
      insertMemory.run(generateId("mem"), "sess_default", dev, mockEmb);
    }
  }
}

// Helper to generate a random 12-char suffix hex id
function generateId(prefix: string): string {
  const chars = "abcdef0123456789";
  let suffix = "";
  for (let i = 0; i < 12; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  return `${prefix}_${suffix}`;
}

// =========================================================================
// SESSION MANAGEMENT
// =========================================================================

export function createSession(companionName: string, summary: string = ""): any {
  const sessionId = generateId("sess");
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO sessions (session_id, companion_name, summary, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(sessionId, companionName, summary, now, now);
  return getSession(sessionId);
}

export function getSession(sessionId: string): any {
  return db.prepare("SELECT * FROM sessions WHERE session_id = ?").get(sessionId);
}

export function listSessions(): any[] {
  return db.prepare("SELECT * FROM sessions ORDER BY updated_at DESC").all();
}

export function updateSessionSummary(sessionId: string, summary: string): boolean {
  const now = new Date().toISOString();
  const info = db.prepare(`
    UPDATE sessions SET summary = ?, updated_at = ? WHERE session_id = ?
  `).run(summary, now, sessionId);
  return info.changes > 0;
}

export function deleteSession(sessionId: string): boolean {
  const info = db.prepare("DELETE FROM sessions WHERE session_id = ?").run(sessionId);
  return info.changes > 0;
}

// =========================================================================
// MESSAGE MANAGEMENT
// =========================================================================

export function addMessage(
  sessionId: string,
  sender: string,
  textContent: string,
  audioPath: string | null = null,
  audioBlob: Buffer | null = null,
  latencyMs: number = 0
): any {
  // Check if session exists, create if missing
  let sess = getSession(sessionId);
  if (!sess) {
    createSession("Roxy", "Auto-created discussion session.");
    sessionId = "sess_default";
  }

  const messageId = generateId("msg");
  const now = new Date().toISOString();

  // Insert message
  db.prepare(`
    INSERT INTO messages (message_id, session_id, sender, text_content, audio_path, audio_blob, latency_ms, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(messageId, sessionId, sender, textContent, audioPath, audioBlob, latencyMs, now);

  // Update session time
  db.prepare("UPDATE sessions SET updated_at = ? WHERE session_id = ?").run(now, sessionId);

  return getMessage(messageId);
}

export function getMessage(messageId: string): any {
  return db.prepare("SELECT * FROM messages WHERE message_id = ?").get(messageId);
}

export function getSessionHistory(sessionId: string, limit = 100): any[] {
  return db.prepare(`
    SELECT * FROM messages 
    WHERE session_id = ? 
    ORDER BY created_at ASC 
    LIMIT ?
  `).all(sessionId, limit);
}

export function searchMessages(query: string): any[] {
  return db.prepare(`
    SELECT m.*, s.companion_name 
    FROM messages m
    JOIN sessions s ON m.session_id = s.session_id
    WHERE m.text_content LIKE ?
    ORDER BY m.created_at DESC
  `).all(`%${query}%`);
}

export function clearMessages(sessionId?: string): boolean {
  if (sessionId) {
    const info = db.prepare("DELETE FROM messages WHERE session_id = ?").run(sessionId);
    return info.changes > 0;
  } else {
    const info = db.prepare("DELETE FROM messages").run();
    return info.changes > 0;
  }
}

// =========================================================================
// VOICE PROFILES
// =========================================================================

export function createVoiceProfile(
  name: string,
  pitchShift = 0.0,
  speedRate = 1.0,
  volumeGain = 0.0,
  voiceModelPath = "",
  formantShift = 1.0,
  whisperMode = 0,
  reverbWetness = 0.0
): any {
  const profileId = generateId("prof");
  db.prepare(`
    INSERT INTO voice_profiles (
      profile_id, name, pitch_shift, speed_rate, volume_gain, 
      voice_model_path, formant_shift, whisper_mode, reverb_wetness
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(profileId, name, pitchShift, speedRate, volumeGain, voiceModelPath, formantShift, whisperMode, reverbWetness);
  return getVoiceProfile(profileId);
}

export function getVoiceProfile(nameOrId: string): any {
  return db.prepare(`
    SELECT * FROM voice_profiles 
    WHERE profile_id = ? OR name = ?
  `).get(nameOrId, nameOrId);
}

export function listVoiceProfiles(): any[] {
  return db.prepare("SELECT * FROM voice_profiles ORDER BY name ASC").all();
}

export function deleteVoiceProfile(profileId: string): boolean {
  const info = db.prepare("DELETE FROM voice_profiles WHERE profile_id = ?").run(profileId);
  return info.changes > 0;
}

// =========================================================================
// SPEECH MODULATION LOGGING
// =========================================================================

export function logSpeechModulation(
  messageId: string,
  profileId: string | null,
  inputAudioPath: string | null = null,
  outputAudioPath: string | null = null,
  modulationDurationMs = 0,
  additionalMetadata = {}
): any {
  const logId = generateId("log");
  const now = new Date().toISOString();
  const metaStr = JSON.stringify(additionalMetadata);

  db.prepare(`
    INSERT INTO speech_modulation_logs (
      log_id, message_id, profile_id, input_audio_path, 
      output_audio_path, modulation_duration_ms, additional_metadata, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(logId, messageId, profileId, inputAudioPath, outputAudioPath, modulationDurationMs, metaStr, now);

  return getSpeechModulationLog(logId);
}

export function getSpeechModulationLog(logId: string): any {
  const log = db.prepare("SELECT * FROM speech_modulation_logs WHERE log_id = ?").get(logId);
  if (log && log.additional_metadata) {
    log.additional_metadata = JSON.parse(log.additional_metadata);
  }
  return log;
}

export function getSessionModulationMetrics(sessionId: string): any[] {
  return db.prepare(`
    SELECT 
      m.message_id, 
      m.text_content, 
      m.latency_ms AS generation_latency_ms,
      l.log_id, 
      l.input_audio_path, 
      l.output_audio_path, 
      l.modulation_duration_ms, 
      p.name AS profile_name,
      p.pitch_shift, 
      p.speed_rate
    FROM messages m
    JOIN speech_modulation_logs l ON m.message_id = l.message_id
    LEFT JOIN voice_profiles p ON l.profile_id = p.profile_id
    WHERE m.session_id = ?
    ORDER BY m.created_at ASC
  `).all(sessionId);
}

// =========================================================================
// USER PROFILES
// =========================================================================

export function createOrUpdateUserProfile(
  username: string,
  preferences: any = null,
  relationshipScore: number | null = null
): any {
  const existing = getUserProfile(username);
  const now = new Date().toISOString();

  if (existing) {
    const mergedPrefs = { ...(existing.dynamic_preferences || {}) };
    if (preferences) {
      Object.assign(mergedPrefs, preferences);
    }
    const score = relationshipScore !== null ? Math.max(0.0, Math.min(10.0, relationshipScore)) : existing.relationship_score;

    db.prepare(`
      UPDATE user_profiles 
      SET relationship_score = ?, dynamic_preferences = ?, updated_at = ?
      WHERE username = ?
    `).run(score, JSON.stringify(mergedPrefs), now, username);
  } else {
    const userId = generateId("usr");
    const score = relationshipScore !== null ? Math.max(0.0, Math.min(10.0, relationshipScore)) : 5.0;
    const prefStr = JSON.stringify(preferences || {});

    db.prepare(`
      INSERT INTO user_profiles (user_id, username, relationship_score, dynamic_preferences, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(userId, username, score, prefStr, now, now);
  }

  return getUserProfile(username);
}

export function getUserProfile(username: string): any {
  const row = db.prepare("SELECT * FROM user_profiles WHERE username = ?").get(username);
  if (row && row.dynamic_preferences) {
    row.dynamic_preferences = JSON.parse(row.dynamic_preferences);
  }
  return row;
}

export function listUserProfiles(): any[] {
  const rows = db.prepare("SELECT * FROM user_profiles ORDER BY username ASC").all();
  return rows.map((r: any) => {
    if (r.dynamic_preferences) r.dynamic_preferences = JSON.parse(r.dynamic_preferences);
    return r;
  });
}

// =========================================================================
// COMPANION MEMORIES (RAG)
// =========================================================================

export function addMemory(
  sessionId: string,
  content: string,
  embedding: number[],
  importance = 3
): any {
  const memoryId = generateId("mem");
  const embStr = JSON.stringify(embedding);

  db.prepare(`
    INSERT INTO companion_memories (memory_id, session_id, content, embedding, importance)
    VALUES (?, ?, ?, ?, ?)
  `).run(memoryId, sessionId, content, embStr, importance);

  return getMemory(memoryId);
}

/**
 * addMemoryForUser — stores a memory tagged to both sessionId AND username.
 * This allows cross-session retrieval so Roxy remembers facts across ALL past conversations.
 */
export function addMemoryForUser(
  sessionId: string,
  username: string,
  content: string,
  embedding: number[],
  importance = 3
): any {
  const memoryId = generateId("mem");
  const embStr = JSON.stringify(embedding);

  db.prepare(`
    INSERT INTO companion_memories (memory_id, session_id, username, content, embedding, importance)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(memoryId, sessionId, username, content, embStr, importance);

  return getMemory(memoryId);
}

export function getMemory(memoryId: string): any {
  const row = db.prepare("SELECT * FROM companion_memories WHERE memory_id = ?").get(memoryId);
  if (row && row.embedding) {
    row.embedding = JSON.parse(row.embedding);
  }
  return row;
}

export function deleteMemory(memoryId: string): boolean {
  // Database safeguard: block deletion of permanent core developer memories (importance = 5)
  const mem = db.prepare("SELECT importance FROM companion_memories WHERE memory_id = ?").get(memoryId) as any;
  if (mem && mem.importance === 5) {
    console.log("[DB] Safeguard blocked attempt to delete unerasable core developer memory.");
    return false;
  }
  const info = db.prepare("DELETE FROM companion_memories WHERE memory_id = ?").run(memoryId);
  return info.changes > 0;
}

export function getMemoriesForSession(sessionId: string): any[] {
  const rows = db.prepare("SELECT * FROM companion_memories WHERE session_id = ? ORDER BY created_at DESC").all(sessionId);
  return rows.map((r: any) => {
    if (r.embedding) r.embedding = JSON.parse(r.embedding);
    return r;
  });
}

export function searchMemories(
  sessionId: string,
  queryEmbedding: number[],
  limit = 5,
  threshold = 0.0
): any[] {
  const rows = db.prepare("SELECT * FROM companion_memories WHERE session_id = ?").all(sessionId);
  if (!rows || rows.length === 0) return [];

  const results: any[] = [];
  const qNormSq = queryEmbedding.reduce((sum, q) => sum + q * q, 0);
  const qNorm = Math.sqrt(qNormSq);

  if (qNorm === 0) return [];

  for (const r of rows as any[]) {
    const emb = JSON.parse(r.embedding);
    if (emb.length !== queryEmbedding.length) continue;

    // Cosine similarity
    const dotProduct = emb.reduce((sum: number, val: number, idx: number) => sum + val * queryEmbedding[idx], 0);
    const embNormSq = emb.reduce((sum: number, val: number) => sum + val * val, 0);
    const embNorm = Math.sqrt(embNormSq);

    if (embNorm === 0) continue;

    const similarity = dotProduct / (qNorm * embNorm);
    if (similarity >= threshold) {
      results.push({
        memory_id: r.memory_id,
        content: r.content,
        importance: r.importance,
        created_at: r.created_at,
        similarity: parseFloat(similarity.toFixed(4))
      });
    }
  }

  // Sort by similarity descending, then importance descending
  results.sort((a, b) => b.similarity - a.similarity || b.importance - a.importance);
  return results.slice(0, limit);
}

/**
 * searchMemoriesForUser — searches memories across ALL sessions for a given username.
 * This is the key function for cross-session long-term memory recall.
 */
export function searchMemoriesForUser(
  username: string,
  queryEmbedding: number[],
  limit = 10,
  threshold = 0.0
): any[] {
  // Fetch all memories for this user across all sessions
  const rows = db.prepare("SELECT * FROM companion_memories WHERE username = ?").all(username);
  if (!rows || rows.length === 0) {
    // Fallback: also search by sessions belonging to this user (for older memories without username tag)
    return [];
  }

  const results: any[] = [];
  const qNormSq = queryEmbedding.reduce((sum, q) => sum + q * q, 0);
  const qNorm = Math.sqrt(qNormSq);

  if (qNorm === 0) return [];

  for (const r of rows as any[]) {
    try {
      const emb = JSON.parse(r.embedding);
      if (emb.length !== queryEmbedding.length) continue;

      const dotProduct = emb.reduce((sum: number, val: number, idx: number) => sum + val * queryEmbedding[idx], 0);
      const embNormSq = emb.reduce((sum: number, val: number) => sum + val * val, 0);
      const embNorm = Math.sqrt(embNormSq);

      if (embNorm === 0) continue;

      const similarity = dotProduct / (qNorm * embNorm);
      if (similarity >= threshold) {
        results.push({
          memory_id: r.memory_id,
          content: r.content,
          importance: r.importance,
          created_at: r.created_at,
          similarity: parseFloat(similarity.toFixed(4))
        });
      }
    } catch (e) {
      // Skip malformed embeddings
    }
  }

  // Sort by similarity descending, then importance, then recency
  results.sort((a, b) =>
    b.similarity - a.similarity ||
    b.importance - a.importance ||
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
  return results.slice(0, limit);
}

export function closeDatabase() {
  console.log("[DB] Closing Database connection gracefully...");
  try {
    db.close();
    console.log("[DB] Database connection closed.");
  } catch (err) {
    console.error("[DB] Error closing database:", err);
  }
}
