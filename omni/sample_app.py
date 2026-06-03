# sample_app.py
# A clean, minimal integration sample for the AI Companion Database System

import os
from db_manager import AICompanionDB

def main():
    print("--- 1. INITIALIZING DATABASE MANAGER ---")
    # Initialize the DB. Works out of the box on all laptops!
    db = AICompanionDB(
        db_path="companion.db",
        schema_path="schema.sql",
        recordings_dir="data/recordings"
    )
    print(f"Database setup ready! Storing audio in: '{db.recordings_dir}'\n")

    print("--- 2. CREATING A CHAT SESSION ---")
    # Create a session representing a conversation thread
    session = db.create_session(
        companion_name="Aura", 
        summary="A simple sample conversation demonstration"
    )
    session_id = session["session_id"]
    print(f"Session Created! Companion: Aura (ID: {session_id})\n")

    print("--- 3. STORING USER SPEECH INPUT ---")
    # Mocking microphone WAV recording bytes
    user_microphone_bytes = b"WAV_HEADER_AND_MOCK_SPEECH_DATA_BYTES"
    
    # Store the user message text along with their voice bytes
    user_msg = db.add_message(
        session_id=session_id,
        sender="user",
        text_content="Aura, please record this speech sample.",
        audio_blob=user_microphone_bytes
    )
    print(f"User Message ID: {user_msg['message_id']}")
    print(f"User Voice Saved To Disk at: {user_msg['audio_path']}")
    print(f"Stored DB Status Representation: {user_msg['audio_blob']}\n")

    print("--- 4. STORING COMPANION RESPONSE ---")
    # Store the text response from the AI
    companion_msg = db.add_message(
        session_id=session_id,
        sender="companion",
        text_content="Understood! Your speech sample has been securely logged on your laptop's local disk.",
        audio_path="recordings/aura_response_01.wav"  # Reference standard voice paths
    )
    print(f"Companion Message ID: {companion_msg['message_id']}")
    print(f"Companion Text Stored: '{companion_msg['text_content']}'\n")

    print("--- 5. FETCHING DATA BACK FROM THE DATABASE ---")
    # Fetch chronological history back from SQLite
    history = db.fetch_session_history(session_id)
    
    print("\n--- LIVE TRANSCRIPT ---")
    for msg in history:
        print(f"[{msg['sender'].upper()}]: {msg['text_content']}")
        if msg["audio_path"]:
            print(f"   -> Portable Audio path stored: {msg['audio_path']}")
            
    print("\n--- DYNAMIC VOICE FILE LOADING ---")
    # Read the audio bytes back from the external disk file dynamically
    retrieved_voice = db.get_message_audio(user_msg["message_id"])
    if retrieved_voice:
        print(f"[Success] Loaded {len(retrieved_voice)} bytes of original voice data back from disk!")
        print(f"Contents decoded: {retrieved_voice.decode('utf-8')}")

if __name__ == "__main__":
    main()
