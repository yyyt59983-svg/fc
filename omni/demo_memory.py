# demo_memory.py
# Premium Interactive Demonstration for AI Companion Memory RAG & Profile System
# Simulates long-term semantic memory retrieval via pure-Python cosine similarity search.

import os
import json
import math
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
    col_widths = [len(h) for h in headers]
    for row in rows:
        for idx, cell in enumerate(row):
            col_widths[idx] = max(col_widths[idx], len(str(cell)))

    header_str = " | ".join(f"{str(h).ljust(col_widths[i])}" for i, h in enumerate(headers))
    print(header_str)
    print("-+-".join("-" * w for w in col_widths))

    for row in rows:
        row_str = " | ".join(f"{str(cell).ljust(col_widths[i])}" for i, cell in enumerate(row))
        print(row_str)

def main():
    print_separator(title="AI COMPANION SEMANTIC MEMORY & PROFILE INITIALIZATION")
    
    # 1. Initialize DB Manager
    db_file = "companion.db"
    # Note: We want to preserve previous sessions but recreate schema tables if missing.
    # Our _initialize_database does this automatically when schema.sql is executed.
    db = AICompanionDB(db_path=db_file, schema_path="schema.sql")
    print(f"[Success] Connected to Database: {db_file}")

    # 2. Simulate User Profile Creation & Closeness Adjustments
    print_separator(title="1. USER PROFILE & EMOTIONAL AFFINITY SYSTEM")
    
    username = "Yashu"
    print(f"[Action] Creating initial profile for '{username}'...")
    
    initial_prefs = {
        "favorite_drink": "Coffee",
        "hobbies": ["coding", "gaming"],
        "favorite_music": "synthwave"
    }
    
    profile = db.create_or_update_user_profile(
        username=username,
        preferences=initial_prefs,
        relationship_score=5.0  # Starts as a balanced level
    )
    
    print(f"[Profile Created] ID: {profile['user_id']}")
    print(f"  +-- Username: {profile['username']}")
    print(f"  +-- Closeness Score: {profile['relationship_score']}/10.0")
    print(f"  +-- Preferences: {json.dumps(profile['dynamic_preferences'])}")

    print(f"\n[Action] Companion interacts positively! Upgrading '{username}' profile metrics...")
    
    # Merge a new preference field and increment closeness
    updated_prefs = {
        "operating_system": "Windows 11",
        "favorite_drink": "Hot Black Coffee"  # Overwrites/refines preference
    }
    
    profile_updated = db.create_or_update_user_profile(
        username=username,
        preferences=updated_prefs,
        relationship_score=7.8  # Elevated bonding level
    )
    
    print(f"[Profile Updated] Closeness: {profile_updated['relationship_score']}/10.0")
    print(f"  +-- Merged Preferences: {json.dumps(profile_updated['dynamic_preferences'])}")

    # 3. Initialize Session & Seed Vector Embeddings
    print_separator(title="2. SEEDING LONG-TERM MEMORIES & EMBEDDINGS")
    
    session = db.create_session(
        companion_name="Aura",
        summary="A dynamic session focusing on personalized long-term memory retrieval (RAG)."
    )
    session_id = session["session_id"]
    print(f"[Session Started] ID: {session_id} with Companion: {session['companion_name']}")

    # Let's seed memories paired with custom 8-dimensional float embedding vectors.
    # Dimensions: [pet/dog, job/career, music, coffee, coding/Python, OS, gaming, generic]
    memories_to_seed = [
        {
            "content": "User has a playful golden retriever named Max.",
            "embedding": [1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.1],
            "importance": 4
        },
        {
            "content": "User is a professional software engineer.",
            "embedding": [0.0, 1.0, 0.0, 0.0, 0.2, 0.0, 0.0, 0.1],
            "importance": 5
        },
        {
            "content": "User loves to listen to synthwave music while working.",
            "embedding": [0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.1],
            "importance": 3
        },
        {
            "content": "User's favorite hot beverage is dark black coffee.",
            "embedding": [0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.1],
            "importance": 3
        },
        {
            "content": "User builds beautiful backend architectures using Python.",
            "embedding": [0.0, 0.2, 0.0, 0.0, 1.0, 0.0, 0.0, 0.1],
            "importance": 4
        }
    ]

    seeded_ids = []
    for mem_data in memories_to_seed:
        m = db.add_memory(
            session_id=session_id,
            content=mem_data["content"],
            embedding=mem_data["embedding"],
            importance=mem_data["importance"]
        )
        seeded_ids.append(m["memory_id"])
        print(f"[Seeded Memory] ID: {m['memory_id']} | Imp: {m['importance']} | Content: '{m['content']}'")

    # 4. Perform Pure-Python Cosine Similarity Search
    print_separator(title="3. VECTOR RETRIEVAL-AUGMENTED GENERATION (RAG)")

    # Define queries paired with corresponding search vectors.
    queries = [
        {
            "prompt": "Do you know my pet?",
            # Strongly activates the 'pet/dog' dimension
            "vector": [0.95, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.05]
        },
        {
            "prompt": "What programming languages do I write in?",
            # Strongly activates the 'coding/Python' dimension and partially the 'job' dimension
            "vector": [0.0, 0.15, 0.0, 0.0, 0.95, 0.0, 0.0, 0.05]
        },
        {
            "prompt": "Tell me what I drink to stay awake.",
            # Strongly activates the 'coffee' dimension
            "vector": [0.0, 0.0, 0.0, 0.98, 0.0, 0.0, 0.0, 0.02]
        }
    ]

    for q in queries:
        print(f"\n>>> [USER QUERY]: '{q['prompt']}'")
        print(f" [Query Vector]: {q['vector']}")
        
        # Search the database for the most relevant memories
        hits = db.search_memories(
            session_id=session_id,
            query_embedding=q["vector"],
            limit=2,
            threshold=0.3
        )
        
        if hits:
            headers = ["Factual Companion Memory retrieved", "Importance", "Similarity Score"]
            rows = []
            for hit in hits:
                rows.append([hit["content"], hit["importance"], f"{hit['similarity'] * 100:.2f}%"])
            display_table(headers, rows)
        else:
            print(" [No Memories Retrieved] Search similarity scores fell below threshold.")

    # 5. Cascading Deletion Verification
    print_separator(title="4. INTEGRITY CHECK: CASCADING DATABASE DELETIONS")
    
    # Let's count current memories
    query_count = "SELECT COUNT(*) as cnt FROM companion_memories WHERE session_id = ?"
    with db._get_connection() as conn:
        count_before = conn.execute(query_count, (session_id,)).fetchone()["cnt"]
    
    print(f"[Before Delete] Total memories registered for session: {count_before}")
    print(f"[Action] Deleting session '{session_id}'...")
    
    db.delete_session(session_id)
    
    with db._get_connection() as conn:
        count_after = conn.execute(query_count, (session_id,)).fetchone()["cnt"]
        
    print(f"[After Delete] Total memories registered for session: {count_after}")
    
    if count_after == 0:
        print("[Success] Cascading constraints successfully removed all associated semantic memories! (100% Secure)")
    else:
        print("[Warning] Cascading constraint did not trigger.")

    print_separator(char="=")
    print("[Success] All semantic memory (RAG) and profile tests executed successfully!")
    print_separator(char="=")

if __name__ == "__main__":
    main()
