-- schema.sql
-- SQLite Database Schema for AI Companion Database System
-- Tailored to store conversation histories, audio paths, binary audio files, and speech-to-speech modulation configs.

-- -------------------------------------------------------------
-- 1. SESSIONS TABLE
-- -------------------------------------------------------------
-- Tracks individual conversation threads or interaction sessions.
CREATE TABLE IF NOT EXISTS sessions (
    session_id TEXT PRIMARY KEY,
    companion_name TEXT NOT NULL,
    summary TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------
-- 2. VOICE PROFILES TABLE
-- -------------------------------------------------------------
-- Stores preconfigured or dynamically created voice modulation parameters for the companion.
CREATE TABLE IF NOT EXISTS voice_profiles (
    profile_id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    pitch_shift REAL DEFAULT 0.0,      -- Shift in semitones (e.g. +3.5, -2.0) or multiplier
    speed_rate REAL DEFAULT 1.0,       -- Playback rate multiplier (e.g. 1.0, 1.25)
    volume_gain REAL DEFAULT 0.0,      -- Volume gain/adjustment in dB (e.g. 0.0, 3.0)
    voice_model_path TEXT,             -- Local path to voice cloning/RVC/TTS model files
    formant_shift REAL DEFAULT 1.0,    -- Formant frequency multiplier (e.g. 0.9 to 1.3)
    whisper_mode INTEGER DEFAULT 0,    -- Binary flag: 0 = Standard, 1 = Whisper modulation
    reverb_wetness REAL DEFAULT 0.0,   -- Dry/Wet mix for echo/reverb (0.0 = none, 1.0 = fully wet)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------
-- 3. MESSAGES TABLE
-- -------------------------------------------------------------
-- Stores individual inputs (user) and responses (companion) for the conversation.
CREATE TABLE IF NOT EXISTS messages (
    message_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    sender TEXT NOT NULL CHECK(sender IN ('user', 'companion')),
    text_content TEXT NOT NULL,
    audio_path TEXT,                   -- Path referencing the audio file stored on disk
    audio_blob BLOB,                   -- Optional raw binary data block for immediate caching
    latency_ms INTEGER DEFAULT 0,      -- Processing time in ms for generating this message
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

-- -------------------------------------------------------------
-- 4. SPEECH MODULATION LOGS TABLE
-- -------------------------------------------------------------
-- Details the speech-to-speech modulation process applied to voice responses.
CREATE TABLE IF NOT EXISTS speech_modulation_logs (
    log_id TEXT PRIMARY KEY,
    message_id TEXT NOT NULL,
    profile_id TEXT,
    input_audio_path TEXT,             -- Original input audio from user (if speech-to-speech)
    output_audio_path TEXT,            -- Output modulated voice path for companion response
    modulation_duration_ms INTEGER,   -- Speed of voice transformation calculations in ms
    additional_metadata TEXT,          -- JSON-encoded field for extended system settings (RVC vectors, phoneme stats)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (message_id) REFERENCES messages(message_id) ON DELETE CASCADE,
    FOREIGN KEY (profile_id) REFERENCES voice_profiles(profile_id) ON DELETE SET NULL
);

-- -------------------------------------------------------------
-- INDEXES FOR INSTANT RETRIEVAL & FILTERING
-- -------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at);
CREATE INDEX IF NOT EXISTS idx_speech_logs_message_id ON speech_modulation_logs(message_id);
CREATE INDEX IF NOT EXISTS idx_voice_profiles_name ON voice_profiles(name);

-- -------------------------------------------------------------
-- 5. USER PROFILES TABLE
-- -------------------------------------------------------------
-- Tracks user metadata, preferences, and bonding/relationship scores with companions.
CREATE TABLE IF NOT EXISTS user_profiles (
    user_id TEXT PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    relationship_score REAL DEFAULT 5.0,  -- Metric between 0.0 (stranger) to 10.0 (best friend)
    dynamic_preferences TEXT,             -- JSON encoded string containing customized key-value pairings
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- -------------------------------------------------------------
-- 6. COMPANION MEMORIES TABLE (RAG)
-- -------------------------------------------------------------
-- Stores factual companion memories mapped to high-dimensional embedding vectors.
CREATE TABLE IF NOT EXISTS companion_memories (
    memory_id TEXT PRIMARY KEY,
    session_id TEXT NOT NULL,
    content TEXT NOT NULL,                -- The raw factual memory string
    embedding TEXT NOT NULL,              -- JSON serialized float vector array (e.g. [0.12, -0.45, ...])
    importance INTEGER DEFAULT 3,         -- Importance rating from 1 (low) to 5 (extreme core memory)
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(session_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_memories_session_id ON companion_memories(session_id);

