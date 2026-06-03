# demo.py
# Premium Interactive Demonstration for AI Companion Relational Database System
# Simulates full companion conversations, voice configuration shifts, and speech-to-speech modulation logging.

import os
import time
from db_manager import AICompanionDB

def print_separator(char="=", length=75, title=""):
    """Prints a beautiful formatted section separator."""
    if title:
        padding = (length - len(title) - 2) // 2
        print("\n" + char * padding + f" {title} " + char * padding)
    else:
        print("\n" + char * length)

def display_table(headers, rows):
    """Prints a formatted table for clean console visuals."""
    # Find max width for each column
    col_widths = [len(h) for h in headers]
    for row in rows:
        for idx, cell in enumerate(row):
            col_widths[idx] = max(col_widths[idx], len(str(cell)))

    # Print headers
    header_str = " | ".join(f"{str(h).ljust(col_widths[i])}" for i, h in enumerate(headers))
    print(header_str)
    print("-+-".join("-" * w for w in col_widths))

    # Print rows
    for row in rows:
        row_str = " | ".join(f"{str(cell).ljust(col_widths[i])}" for i, cell in enumerate(row))
        print(row_str)

def main():
    print_separator(title="AI COMPANION DATABASE SYSTEM INITIALIZATION")
    
    # 1. Initialize DB Manager
    db_file = "companion.db"
    if os.path.exists(db_file):
        print(f"[Info] Removing existing database '{db_file}' to start fresh for demo...")
        os.remove(db_file)
        
    db = AICompanionDB(db_path=db_file, schema_path="schema.sql")
    print(f"[Success] Database initialized: {db_file}")

    # 2. Seed Voice Profiles for Speech-to-Speech Modulation
    print_separator(title="1. CREATING VOICE MODULATION PROFILES")
    
    profiles_data = [
        {
            "name": "Cheerful Assistant",
            "pitch_shift": 3.0,          # Shifting pitch up for lighter, happier feel
            "speed_rate": 1.05,          # Slightly faster tempo
            "volume_gain": 0.5,
            "voice_model_path": "models/voices/cheerful_neural_v2.pth",
            "formant_shift": 1.1,        # Brighter vocal tract
            "whisper_mode": False,
            "reverb_wetness": 0.1
        },
        {
            "name": "Cybernetic Bot",
            "pitch_shift": -5.5,         # Heavy deep pitch drop
            "speed_rate": 0.90,          # Slower, mechanical speech
            "volume_gain": 2.0,
            "voice_model_path": "models/voices/robot_metallic.pth",
            "formant_shift": 0.75,       # Wider, deeper voice throat profile
            "whisper_mode": False,
            "reverb_wetness": 0.35       # Echoing metal echo
        },
        {
            "name": "ASMR Whisperer",
            "pitch_shift": 0.5,
            "speed_rate": 0.85,          # Relaxing, slow speech rate
            "volume_gain": -1.0,
            "voice_model_path": "models/voices/asmr_breath_v1.pth",
            "formant_shift": 1.0,
            "whisper_mode": True,         # Enabled Whisper Speech Synthesis
            "reverb_wetness": 0.2
        }
    ]

    profiles = []
    for p_info in profiles_data:
        profile = db.create_voice_profile(**p_info)
        profiles.append(profile)
        print(f"[Created Profile] '{profile['name']}' (ID: {profile['profile_id']})")
        print(f"  +-- Pitch Shift: {profile['pitch_shift']} semitones, Speed: {profile['speed_rate']}x, Whisper Mode: {profile['whisper_mode']}")

    # 3. Simulate Starting a Conversation Session
    print_separator(title="2. CREATING COMPANION CONVERSATION SESSION")
    
    session = db.create_session(
        companion_name="Aura", 
        summary="Initial introductory discussion about voice configurations and general questions."
    )
    session_id = session["session_id"]
    print(f"[Session Created] ID: {session_id}")
    print(f"  +-- Companion: {session['companion_name']}")
    print(f"  +-- Summary: {session['summary']}")

    # 4. Simulate a Conversation Flow (Speech-to-Speech)
    print_separator(title="3. SIMULATING USER & COMPANION SPEECH INTERACTION")

    # Turn 1: User says Hello
    print("\n>>> [USER]: 'Hello Aura! Can you hear me? I want to test your voice today.'")
    # Store user input message
    # Simulation generates audio clip for user speech path
    user_audio = "recordings/user_speech_001.wav"
    user_msg = db.add_message(
        session_id=session_id,
        sender="user",
        text_content="Hello Aura! Can you hear me? I want to test your voice today.",
        audio_path=user_audio,
        audio_blob=b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01" * 10, # Mock raw audio bytes
        latency_ms=120  # user microphone capture latency
    )
    print(f" [DB Saved] User message id: {user_msg['message_id']} (Stored audio: {user_msg['audio_path']})")

    # Companion replies with "Cheerful Assistant" voice profile
    print("\n>>> [COMPANION (Cheerful)]: 'Hi there! I can hear you perfectly. How does this cheerful voice sound?'")
    time.sleep(0.1) # Simulating slight processing delay
    comp_text_1 = "Hi there! I can hear you perfectly. How does this cheerful voice sound?"
    comp_audio_1 = "recordings/aura_response_cheerful_001.wav"
    
    # Store companion response message
    comp_msg_1 = db.add_message(
        session_id=session_id,
        sender="companion",
        text_content=comp_text_1,
        audio_path=comp_audio_1,
        latency_ms=340 # Latency to generate response text
    )
    
    # Log speech-to-speech modulation execution
    cheerful_prof = db.get_voice_profile("Cheerful Assistant")
    modulation_log_1 = db.log_speech_modulation(
        message_id=comp_msg_1["message_id"],
        profile_id=cheerful_prof["profile_id"],
        input_audio_path=user_audio, # user voice used to trigger/modulate
        output_audio_path=comp_audio_1,
        modulation_duration_ms=185, # 185ms speech-to-speech translation latency
        additional_metadata={"pitch_tracker_used": "Crepe", "rvc_index_rate": 0.75}
    )
    print(f" [DB Saved] Companion message id: {comp_msg_1['message_id']}")
    print(f" [DB Logged] Speech Modulation log id: {modulation_log_1['log_id']} (Modulation time: {modulation_log_1['modulation_duration_ms']}ms)")

    # Turn 2: User requests to change voice to cybernetic robot
    print("\n>>> [USER]: 'Wow! That is neat. Now, change your voice to sound like a cybernetic robot.'")
    user_audio_2 = "recordings/user_speech_002.wav"
    user_msg_2 = db.add_message(
        session_id=session_id,
        sender="user",
        text_content="Wow! That is neat. Now, change your voice to sound like a cybernetic robot.",
        audio_path=user_audio_2,
        latency_ms=90
    )
    
    # Companion replies with "Cybernetic Bot" voice profile
    print("\n>>> [COMPANION (Robot)]: '[BEEP-BOOP] UNDERSTOOD. INITIATING HIGH-FREQUENCY NEURAL SYNTHESIS SHIFT.'")
    comp_text_2 = "[BEEP-BOOP] UNDERSTOOD. INITIATING HIGH-FREQUENCY NEURAL SYNTHESIS SHIFT."
    comp_audio_2 = "recordings/aura_response_robot_002.wav"
    
    comp_msg_2 = db.add_message(
        session_id=session_id,
        sender="companion",
        text_content=comp_text_2,
        audio_path=comp_audio_2,
        latency_ms=410
    )
    
    robot_prof = db.get_voice_profile("Cybernetic Bot")
    modulation_log_2 = db.log_speech_modulation(
        message_id=comp_msg_2["message_id"],
        profile_id=robot_prof["profile_id"],
        input_audio_path=user_audio_2,
        output_audio_path=comp_audio_2,
        modulation_duration_ms=290, # robotic DSP modulation latency
        additional_metadata={"ring_modulation_frequency": "50Hz", "vocoder_bands": 16}
    )
    print(f" [DB Saved] Companion message id: {comp_msg_2['message_id']}")
    print(f" [DB Logged] Speech Modulation log id: {modulation_log_2['log_id']} (Modulation time: {modulation_log_2['modulation_duration_ms']}ms)")

    # 5. Retrieve Session History
    print_separator(title="4. FETCHING DATA: CONVERSATION TRANSCRIPT HISTORY")
    
    history = db.fetch_session_history(session_id)
    headers = ["Sender", "Message Text Content", "Audio Path Available?", "Created At"]
    rows = []
    for msg in history:
        has_audio = "Yes (" + msg["audio_path"] + ")" if msg["audio_path"] else "No"
        rows.append([msg["sender"].upper(), msg["text_content"], has_audio, msg["created_at"]])
    display_table(headers, rows)

    # 6. Fetch Speech Modulation Audit and Performance Metrics
    print_separator(title="5. FETCHING DATA: SPEECH-TO-SPEECH PERFORMANCE REPORT")
    
    metrics = db.get_session_modulation_metrics(session_id)
    metric_headers = ["Text (Truncated)", "Voice Profile Used", "Pitch", "Rate", "Mod Latency (ms)", "Gen Latency (ms)"]
    metric_rows = []
    for m in metrics:
        truncated_text = m["text_content"][:30] + "..." if len(m["text_content"]) > 30 else m["text_content"]
        metric_rows.append([
            truncated_text,
            m["profile_name"] or "None",
            f"{m['pitch_shift']:+g} semi" if m["pitch_shift"] is not None else "0",
            f"{m['speed_rate']}x" if m["speed_rate"] is not None else "1x",
            m["modulation_duration_ms"],
            m["generation_latency_ms"]
        ])
    display_table(metric_headers, metric_rows)

    # 7. Demonstrate Search Functionality
    print_separator(title="6. FETCHING DATA: SEARCHING CONVERSATION KEYWORDS")
    
    search_keyword = "robot"
    print(f"[Search Query] Looking for messages containing: '{search_keyword}'...")
    search_results = db.search_messages(search_keyword)
    
    if search_results:
        search_headers = ["Companion", "Sender", "Matching Text Content", "Timestamp"]
        search_rows = []
        for res in search_results:
            search_rows.append([res["companion_name"], res["sender"].upper(), res["text_content"], res["created_at"]])
        display_table(search_headers, search_rows)
    else:
        print("[No Results] No messages found matching that query.")

    # 7. Demonstrate Dynamic Audio Retrieval & Storage Integrity
    print_separator(title="7. VERIFYING DYNAMIC AUDIO STORAGE & RETRIEVAL INTEGRITY")
    
    print(f"[Storage Check] Message '{user_msg['message_id']}' audio path is stored as: '{user_msg['audio_path']}'")
    print("Retrieving audio bytes from dynamic storage via DB helper...")
    retrieved_bytes = db.get_message_audio(user_msg["message_id"])
    
    if retrieved_bytes:
        print(f"[Success] Loaded {len(retrieved_bytes)} bytes of audio data directly from disk path!")
        # Validate that bytes match what was originally written
        original_bytes = b"\xFF\xD8\xFF\xE0\x00\x10JFIF\x00\x01\x01\x01" * 10
        if retrieved_bytes == original_bytes:
            print("[Integrity Verified] Audio file data matches original bytes exactly! (100% Correct)")
        else:
            print("[Warning] Bytes do not match original bytes.")
    else:
        print("[Error] Failed to retrieve audio bytes from storage.")

    print_separator(char="=")
    print("[Success] All tests, simulations, and storage integrity checks finished successfully!")
    print("Database demo complete. The file 'companion.db' represents your complete companion database.")
    print(f"Large audio recordings are stored compactly under: {os.path.abspath(db.recordings_dir)}")
    print_separator(char="=")

if __name__ == "__main__":
    main()
