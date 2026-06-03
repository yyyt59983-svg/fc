# db_manager.py
# Premium Python SQLite Manager for AI Companion System
# Provides clean relational abstractions, transaction safety, and comprehensive queries.

import os
import sqlite3
import json
import uuid
from datetime import datetime
from typing import List, Dict, Any, Optional, Tuple

class AICompanionDB:
    """
    A robust database manager for an AI Companion system, handling conversation history,
    voice modulation profiles, and speech-to-speech execution logs.
    
    Uses standard SQLite with dictionary row factories, foreign key enforcement, 
    and transaction safety.
    """
    def __init__(self, db_path: str = "companion.db", schema_path: str = "schema.sql", recordings_dir: str = "data/recordings"):
        self.db_path = db_path
        self.schema_path = schema_path
        # Dynamic cross-platform directory resolution
        self.recordings_dir = os.path.normpath(recordings_dir)
        self._initialize_database()

    def _get_connection(self) -> sqlite3.Connection:
        """Establishes a connection to the database and enforces optimized SQLite configurations."""
        # Ensure database parent directory exists dynamically
        db_dir = os.path.dirname(self.db_path)
        if db_dir and not os.path.exists(db_dir):
            os.makedirs(db_dir, exist_ok=True)

        conn = sqlite3.connect(self.db_path)
        # Enable returning rows as dictionaries rather than tuples for premium API experience
        conn.row_factory = sqlite3.Row
        
        # CRITICAL: SQLite does not enforce foreign keys by default. Enforce it!
        conn.execute("PRAGMA foreign_keys = ON;")
        
        # PREMIUM scale and performance configurations (Enable WAL mode, NORMAL synchronous, increased cache)
        try:
            conn.execute("PRAGMA journal_mode = WAL;")
            conn.execute("PRAGMA synchronous = NORMAL;")
            conn.execute("PRAGMA cache_size = -64000;")  # 64MB cache size
        except Exception as e:
            # Fallback in case of environments where WAL is restricted
            print(f"[Warning] SQLite WAL optimization could not be applied: {e}")
            
        return conn

    def _initialize_database(self):
        """Initializes or updates the database using the schema.sql file if tables are missing."""
        if not os.path.exists(self.schema_path):
            raise FileNotFoundError(f"Schema file not found at: {self.schema_path}")

        with self._get_connection() as conn:
            # Check if all required tables exist in sqlite_master
            cursor = conn.cursor()
            cursor.execute("SELECT name FROM sqlite_master WHERE type='table';")
            existing_tables = {row["name"] for row in cursor.fetchall()}
            required_tables = {
                'sessions', 'voice_profiles', 'messages', 
                'speech_modulation_logs', 'user_profiles', 'companion_memories'
            }
            
            # If any required table is missing, execute the schema to create/upgrade them
            if not required_tables.issubset(existing_tables):
                print(f"[DB] Initializing/updating database at '{self.db_path}' using '{self.schema_path}'...")
                with open(self.schema_path, "r", encoding="utf-8") as f:
                    schema_sql = f.read()
                conn.executescript(schema_sql)
                conn.commit()
                print("[DB] Database successfully initialized/updated.")

    # =========================================================================
    # 1. SESSION MANAGEMENT
    # =========================================================================

    def create_session(self, companion_name: str, summary: Optional[str] = None) -> Dict[str, Any]:
        """Creates a new AI companion chat session."""
        session_id = f"sess_{uuid.uuid4().hex[:12]}"
        now = datetime.now().isoformat()
        
        query = """
            INSERT INTO sessions (session_id, companion_name, summary, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?)
        """
        with self._get_connection() as conn:
            conn.execute(query, (session_id, companion_name, summary, now, now))
            conn.commit()
            
        return self.get_session(session_id)

    def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves details of a single session."""
        query = "SELECT * FROM sessions WHERE session_id = ?"
        with self._get_connection() as conn:
            row = conn.execute(query, (session_id,)).fetchone()
            return dict(row) if row else None

    def list_sessions(self) -> List[Dict[str, Any]]:
        """Lists all stored chat sessions, sorted by last updated."""
        query = "SELECT * FROM sessions ORDER BY updated_at DESC"
        with self._get_connection() as conn:
            rows = conn.execute(query).fetchall()
            return [dict(r) for r in rows]

    def update_session_summary(self, session_id: str, summary: str) -> bool:
        """Updates the conversation summary and the updated_at timestamp."""
        now = datetime.now().isoformat()
        query = """
            UPDATE sessions 
            SET summary = ?, updated_at = ? 
            WHERE session_id = ?
        """
        with self._get_connection() as conn:
            cursor = conn.execute(query, (summary, now, session_id))
            conn.commit()
            return cursor.rowcount > 0

    def delete_session(self, session_id: str) -> bool:
        """Deletes a session, cleans up externalized audio files, and cascadingly deletes DB rows."""
        # 1. Clean up audio files stored on disk for this session
        sess_dir = os.path.join(self.recordings_dir, session_id)
        if os.path.exists(sess_dir):
            try:
                import shutil
                shutil.rmtree(sess_dir)
            except Exception as e:
                print(f"[Warning] Failed to clean up audio recordings directory on disk: {e}")

        # 2. Perform cascade delete in database
        query = "DELETE FROM sessions WHERE session_id = ?"
        with self._get_connection() as conn:
            cursor = conn.execute(query, (session_id,))
            conn.commit()
            return cursor.rowcount > 0

    # =========================================================================
    # 2. MESSAGE MANAGEMENT (INPUT & RESPONSE)
    # =========================================================================

    def add_message(
        self, 
        session_id: str, 
        sender: str, 
        text_content: str, 
        audio_path: Optional[str] = None, 
        audio_blob: Optional[bytes] = None, 
        latency_ms: int = 0
    ) -> Dict[str, Any]:
        """
        Adds a conversation message (user input or AI response) to a session.
        Auto-updates the parent session's updated_at timestamp.
        Saves raw audio blobs to portable external storage automatically.
        """
        # First verify the session exists to avoid orphan messages
        if not self.get_session(session_id):
            raise ValueError(f"Session with ID '{session_id}' does not exist.")

        message_id = f"msg_{uuid.uuid4().hex[:12]}"
        now = datetime.now().isoformat()

        # Dynamic cross-platform audio file externalization to prevent database bloat
        if audio_blob:
            try:
                # Ensure the audio session subfolder exists
                sess_dir = os.path.join(self.recordings_dir, session_id)
                os.makedirs(sess_dir, exist_ok=True)
                
                # Dynamic audio filename creation
                filename = f"{message_id}.wav"
                local_file_path = os.path.join(sess_dir, filename)
                
                # Write binary audio files directly to disk
                with open(local_file_path, "wb") as f:
                    f.write(audio_blob)
                
                # Store dynamic relative path with clean forward slashes for universal cross-platform retrieval
                rel_path = f"{self.recordings_dir.replace('\\', '/')}/{session_id}/{filename}"
                audio_path = rel_path
                
                # Keep audio_blob in DB as None to save space, since it is safely written to disk
                audio_blob = None
            except Exception as e:
                print(f"[Warning] Failed to externalize audio to disk, saving in-database instead: {e}")

        # Normalize any user-passed audio_path to forward slashes for absolute cross-platform portability
        if audio_path:
            audio_path = audio_path.replace("\\", "/")

        query_msg = """
            INSERT INTO messages (message_id, session_id, sender, text_content, audio_path, audio_blob, latency_ms, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        query_session_time = """
            UPDATE sessions SET updated_at = ? WHERE session_id = ?
        """

        with self._get_connection() as conn:
            conn.execute(query_msg, (message_id, session_id, sender, text_content, audio_path, audio_blob, latency_ms, now))
            conn.execute(query_session_time, (now, session_id))
            conn.commit()

        # Fetch and return the newly inserted message
        return self.get_message(message_id)

    def get_message(self, message_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves details of a single message with optimized storage stats."""
        query = "SELECT * FROM messages WHERE message_id = ?"
        with self._get_connection() as conn:
            row = conn.execute(query, (message_id,)).fetchone()
            if row:
                res = dict(row)
                
                # Check for dynamic file storage size on disk
                disk_blob_size = None
                if res.get("audio_path"):
                    local_path = os.path.normpath(res["audio_path"])
                    if os.path.exists(local_path):
                        disk_blob_size = os.path.getsize(local_path)
                
                # Format standard representation to clearly show external files vs database blobs
                if disk_blob_size is not None:
                    res["audio_blob"] = f"<EXTERNAL DISK FILE: {disk_blob_size} bytes>"
                elif res.get("audio_blob"):
                    res["audio_blob_size"] = len(res["audio_blob"])
                    res["audio_blob"] = f"<DATABASE BLOB: {res['audio_blob_size']} bytes>"
                return res
            return None

    def fetch_session_history(self, session_id: str, limit: int = 100) -> List[Dict[str, Any]]:
        """Fetches the full conversation transcript for a session, chronologically."""
        query = """
            SELECT message_id, sender, text_content, audio_path, 
                   (audio_blob IS NOT NULL) as has_audio_blob, latency_ms, created_at 
            FROM messages 
            WHERE session_id = ? 
            ORDER BY created_at ASC 
            LIMIT ?
        """
        with self._get_connection() as conn:
            rows = conn.execute(query, (session_id, limit)).fetchall()
            return [dict(r) for r in rows]

    def search_messages(self, search_query: str) -> List[Dict[str, Any]]:
        """Searches conversation text content across all sessions using keyword matching."""
        query = """
            SELECT m.message_id, m.session_id, m.sender, m.text_content, m.created_at, s.companion_name
            FROM messages m
            JOIN sessions s ON m.session_id = s.session_id
            WHERE m.text_content LIKE ?
            ORDER BY m.created_at DESC
        """
        with self._get_connection() as conn:
            rows = conn.execute(query, (f"%{search_query}%",)).fetchall()
            return [dict(r) for r in rows]

    # =========================================================================
    # 3. SPEECH MODULATION PROFILE MANAGEMENT
    # =========================================================================

    def create_voice_profile(
        self, 
        name: str, 
        pitch_shift: float = 0.0, 
        speed_rate: float = 1.0, 
        volume_gain: float = 0.0, 
        voice_model_path: Optional[str] = None, 
        formant_shift: float = 1.0, 
        whisper_mode: bool = False, 
        reverb_wetness: float = 0.0
    ) -> Dict[str, Any]:
        """Creates or overwrites a specific voice modulation profile."""
        profile_id = f"prof_{uuid.uuid4().hex[:12]}"
        
        query = """
            INSERT INTO voice_profiles (
                profile_id, name, pitch_shift, speed_rate, volume_gain, 
                voice_model_path, formant_shift, whisper_mode, reverb_wetness
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        """
        with self._get_connection() as conn:
            conn.execute(query, (
                profile_id, name, pitch_shift, speed_rate, volume_gain,
                voice_model_path, formant_shift, 1 if whisper_mode else 0, reverb_wetness
            ))
            conn.commit()
            
        return self.get_voice_profile(profile_id)

    def get_voice_profile(self, name_or_id: str) -> Optional[Dict[str, Any]]:
        """Fetches voice profile configuration by name or profile_id."""
        query = "SELECT * FROM voice_profiles WHERE profile_id = ? OR name = ?"
        with self._get_connection() as conn:
            row = conn.execute(query, (name_or_id, name_or_id)).fetchone()
            if row:
                res = dict(row)
                res["whisper_mode"] = bool(res["whisper_mode"])
                return res
            return None

    def list_voice_profiles(self) -> List[Dict[str, Any]]:
        """Lists all defined voice modulation profiles."""
        query = "SELECT * FROM voice_profiles ORDER BY name ASC"
        with self._get_connection() as conn:
            rows = conn.execute(query).fetchall()
            return [dict(r) for r in rows]

    # =========================================================================
    # 4. SPEECH MODULATION LOGGING
    # =========================================================================

    def log_speech_modulation(
        self, 
        message_id: str, 
        profile_id: Optional[str], 
        input_audio_path: Optional[str] = None, 
        output_audio_path: Optional[str] = None, 
        modulation_duration_ms: int = 0, 
        additional_metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Logs speech-to-speech modulation processing details for a message."""
        # Ensure message exists
        query_msg_check = "SELECT message_id FROM messages WHERE message_id = ?"
        with self._get_connection() as conn:
            if not conn.execute(query_msg_check, (message_id,)).fetchone():
                raise ValueError(f"Message ID '{message_id}' does not exist.")

        log_id = f"log_{uuid.uuid4().hex[:12]}"
        meta_str = json.dumps(additional_metadata) if additional_metadata else None
        now = datetime.now().isoformat()

        query_log = """
            INSERT INTO speech_modulation_logs (
                log_id, message_id, profile_id, input_audio_path, 
                output_audio_path, modulation_duration_ms, additional_metadata, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """
        with self._get_connection() as conn:
            conn.execute(query_log, (
                log_id, message_id, profile_id, input_audio_path, 
                output_audio_path, modulation_duration_ms, meta_str, now
            ))
            conn.commit()
            
        return self.get_speech_modulation_log(log_id)

    def get_speech_modulation_log(self, log_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves details of a single speech modulation log entry."""
        query = "SELECT * FROM speech_modulation_logs WHERE log_id = ?"
        with self._get_connection() as conn:
            row = conn.execute(query, (log_id,)).fetchone()
            if row:
                res = dict(row)
                if res.get("additional_metadata"):
                    res["additional_metadata"] = json.loads(res["additional_metadata"])
                return res
            return None

    def get_session_modulation_metrics(self, session_id: str) -> List[Dict[str, Any]]:
        """
        Gathers speech-to-speech audit trails and performance metrics 
        joining messages, logs, and voice profiles for a full conversation session.
        """
        query = """
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
        """
        with self._get_connection() as conn:
            rows = conn.execute(query, (session_id,)).fetchall()
            return [dict(r) for r in rows]

    def get_message_audio(self, message_id: str) -> Optional[bytes]:
        """
        Retrieves the raw binary audio data for a message.
        Attempts to read from the externalized portable path on disk first,
        falling back to the database blob if disk storage is not found.
        """
        query = "SELECT audio_path, audio_blob FROM messages WHERE message_id = ?"
        with self._get_connection() as conn:
            row = conn.execute(query, (message_id,)).fetchone()
            if not row:
                return None
            
            # 1. Attempt dynamic retrieval from externalized portable storage
            audio_path = row["audio_path"]
            if audio_path:
                local_path = os.path.normpath(audio_path)
                if os.path.exists(local_path):
                    try:
                        with open(local_path, "rb") as f:
                            return f.read()
                    except Exception as e:
                        print(f"[Warning] Failed to read audio from external path '{local_path}': {e}")
            
            # 2. Fallback to in-database binary blob
            if row["audio_blob"]:
                return row["audio_blob"]
                
            return None

    # =========================================================================
    # 5. USER PROFILE MANAGEMENT
    # =========================================================================

    def create_or_update_user_profile(
        self, 
        username: str, 
        preferences: Optional[Dict[str, Any]] = None, 
        relationship_score: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Creates a new user profile or updates an existing one.
        If the profile exists, merges the new preferences dict with existing preferences,
        and updates the relationship score if provided.
        """
        existing = self.get_user_profile(username)
        now = datetime.now().isoformat()
        
        if existing:
            user_id = existing["user_id"]
            # Merge preferences if provided
            merged_preferences = existing["dynamic_preferences"] or {}
            if preferences:
                merged_preferences.update(preferences)
            pref_str = json.dumps(merged_preferences)
            
            # Use existing relationship score if not provided
            new_score = relationship_score if relationship_score is not None else existing["relationship_score"]
            # Enforce 0.0 - 10.0 bounds
            new_score = max(0.0, min(10.0, float(new_score)))
            
            query = """
                UPDATE user_profiles 
                SET relationship_score = ?, dynamic_preferences = ?, updated_at = ?
                WHERE user_id = ?
            """
            with self._get_connection() as conn:
                conn.execute(query, (new_score, pref_str, now, user_id))
                conn.commit()
        else:
            user_id = f"usr_{uuid.uuid4().hex[:12]}"
            pref_str = json.dumps(preferences or {})
            initial_score = relationship_score if relationship_score is not None else 5.0
            initial_score = max(0.0, min(10.0, float(initial_score)))
            
            query = """
                INSERT INTO user_profiles (user_id, username, relationship_score, dynamic_preferences, created_at, updated_at)
                VALUES (?, ?, ?, ?, ?, ?)
            """
            with self._get_connection() as conn:
                conn.execute(query, (user_id, username, initial_score, pref_str, now, now))
                conn.commit()
                
        return self.get_user_profile(username)

    def get_user_profile(self, username_or_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves a user profile by username or user_id."""
        query = "SELECT * FROM user_profiles WHERE user_id = ? OR username = ?"
        with self._get_connection() as conn:
            row = conn.execute(query, (username_or_id, username_or_id)).fetchone()
            if row:
                res = dict(row)
                if res.get("dynamic_preferences"):
                    res["dynamic_preferences"] = json.loads(res["dynamic_preferences"])
                else:
                    res["dynamic_preferences"] = {}
                return res
            return None

    def list_user_profiles(self) -> List[Dict[str, Any]]:
        """Lists all user profiles."""
        query = "SELECT * FROM user_profiles ORDER BY username ASC"
        with self._get_connection() as conn:
            rows = conn.execute(query).fetchall()
            return [dict(r) for r in rows]

    # =========================================================================
    # 6. SEMANTIC MEMORY MANAGEMENT (RAG)
    # =========================================================================

    def add_memory(
        self, 
        session_id: str, 
        content: str, 
        embedding: List[float], 
        importance: int = 3
    ) -> Dict[str, Any]:
        """
        Adds a new factual memory/embedding pair for a session.
        The embedding vector is serialized to a JSON float array string for storage.
        """
        if not self.get_session(session_id):
            raise ValueError(f"Session with ID '{session_id}' does not exist.")
            
        memory_id = f"mem_{uuid.uuid4().hex[:12]}"
        emb_str = json.dumps(embedding)
        
        query = """
            INSERT INTO companion_memories (memory_id, session_id, content, embedding, importance)
            VALUES (?, ?, ?, ?, ?)
        """
        with self._get_connection() as conn:
            conn.execute(query, (memory_id, session_id, content, emb_str, importance))
            conn.commit()
            
        return self.get_memory(memory_id)

    def get_memory(self, memory_id: str) -> Optional[Dict[str, Any]]:
        """Retrieves details of a specific memory entry."""
        query = "SELECT * FROM companion_memories WHERE memory_id = ?"
        with self._get_connection() as conn:
            row = conn.execute(query, (memory_id,)).fetchone()
            if row:
                res = dict(row)
                if res.get("embedding"):
                    res["embedding"] = json.loads(res["embedding"])
                return res
            return None

    def search_memories(
        self, 
        session_id: str, 
        query_embedding: List[float], 
        limit: int = 5, 
        threshold: float = 0.0
    ) -> List[Dict[str, Any]]:
        """
        Performs a vector similarity search across memories associated with a session.
        Uses pure-Python Cosine Similarity calculations to avoid complex external library requirements.
        """
        # Fetch all memory candidates for this session
        query = "SELECT * FROM companion_memories WHERE session_id = ?"
        with self._get_connection() as conn:
            rows = conn.execute(query, (session_id,)).fetchall()
            
        if not rows:
            return []
            
        results = []
        q_norm_sq = sum(q * q for q in query_embedding)
        q_norm = q_norm_sq ** 0.5
        
        if q_norm == 0.0:
            return []
            
        for row in rows:
            memory = dict(row)
            emb = json.loads(memory["embedding"])
            
            # Compute cosine similarity
            if len(emb) != len(query_embedding):
                # Vector mismatch fallback
                continue
                
            dot_product = sum(a * b for a, b in zip(emb, query_embedding))
            emb_norm_sq = sum(e * e for e in emb)
            emb_norm = emb_norm_sq ** 0.5
            
            if emb_norm == 0.0:
                similarity = 0.0
            else:
                similarity = dot_product / (q_norm * emb_norm)
                
            if similarity >= threshold:
                memory["embedding"] = emb
                memory["similarity"] = round(similarity, 4)
                results.append(memory)
                
        # Sort by similarity descending, then by importance descending
        results.sort(key=lambda x: (x["similarity"], x["importance"]), reverse=True)
        return results[:limit]
