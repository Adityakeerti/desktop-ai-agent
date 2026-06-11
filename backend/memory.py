import os
import sqlite3
import json
import time

# Allow tests to redirect to a temp DB so the production file is never touched.
# Set JARVIS_TEST_DB before importing this module (conftest.py does this).
_test_db = os.environ.get("JARVIS_TEST_DB", "")
if _test_db:
    DB_DIR = os.path.dirname(_test_db)
    DB_PATH = _test_db
else:
    DB_DIR = os.path.expanduser("~/.jarvis")
    DB_PATH = os.path.join(DB_DIR, "memory.db")

def init_db():
    """Initialize the database and tables if they don't exist."""
    os.makedirs(DB_DIR, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Interaction history table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS interaction_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command TEXT UNIQUE,
        action_taken TEXT,
        learned_at TEXT,
        frequency INTEGER DEFAULT 1
    );
    """)
    
    # Learned macros (skills) table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS macros (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE,
        steps TEXT, -- JSON array of command strings
        created_at TEXT
    );
    """)
    
    # Interaction log (for sequential analysis)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS interaction_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        command TEXT,
        timestamp TEXT
    );
    """)

    # User personalization profile
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS profile (
        key TEXT PRIMARY KEY,
        value TEXT
    );
    """)
    
    # WAL mode: prevents data loss if process is force-killed mid-write
    cursor.execute("PRAGMA journal_mode=WAL;")
    conn.commit()
    conn.close()

def record_interaction(command: str, action_taken: dict):
    """Record a user interaction in history and log it."""
    if not command:
        return
    
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    action_str = json.dumps(action_taken)
    
    # Log execution sequentially for sequence matching
    cursor.execute("INSERT INTO interaction_log (command, timestamp) VALUES (?, ?)", (command, now))
    
    # Update frequency if exists, otherwise insert
    cursor.execute("""
    INSERT INTO interaction_history (command, action_taken, learned_at, frequency)
    VALUES (?, ?, ?, 1)
    ON CONFLICT(command) DO UPDATE SET
        frequency = frequency + 1,
        learned_at = excluded.learned_at,
        action_taken = excluded.action_taken;
    """, (command, action_str, now))
    
    conn.commit()
    conn.close()

def save_macro(name: str, steps: list[str]) -> bool:
    """Save a macro (named skill) with sequential command steps."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    steps_json = json.dumps(steps)
    
    try:
        cursor.execute("""
        INSERT INTO macros (name, steps, created_at)
        VALUES (?, ?, ?)
        ON CONFLICT(name) DO UPDATE SET
            steps = excluded.steps,
            created_at = excluded.created_at;
        """, (name.lower().strip(), steps_json, now))
        conn.commit()
        success = True
    except Exception as e:
        conn.rollback()
        conn.close()
        raise RuntimeError(f"save_macro failed for '{name}': {e}") from e
        
    conn.close()
    return success

def get_macro(name: str) -> list[str] | None:
    """Retrieve macro steps by name."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT steps FROM macros WHERE name = ?", (name.lower().strip(),))
    row = cursor.fetchone()
    conn.close()
    
    if row:
        return json.loads(row[0])
    return None

def list_macros() -> dict:
    """List all saved macros."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT name, steps FROM macros")
    rows = cursor.fetchall()
    conn.close()
    
    return {row[0]: json.loads(row[1]) for row in rows}

def delete_macro(name: str) -> bool:
    """Delete a macro by name."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM macros WHERE name = ?", (name.lower().strip(),))
    deleted = cursor.rowcount > 0
    conn.commit()
    conn.close()
    return deleted

def clear_all_memory():
    """Clear interaction logs, history, and macros."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM interaction_history;")
    cursor.execute("DELETE FROM macros;")
    cursor.execute("DELETE FROM interaction_log;")
    conn.commit()
    conn.close()

def detect_repetitive_sequences(min_freq: int = 3) -> list[dict]:
    """
    Scans sequential interaction logs for recurring patterns of commands.
    Looks for:
    - Single commands executed frequently.
    - 2-step sequences of commands executed frequently.
    - 3-step sequences of commands executed frequently.
    """
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Load all commands run sequentially
    cursor.execute("SELECT command FROM interaction_log ORDER BY id ASC")
    cmds = [row[0] for row in cursor.fetchall()]
    conn.close()
    
    suggestions = []
    
    # 1. Look for sequences of length 3 and 2 (check 3 first to filter out sub-sequences of length 2)
    for seq_len in (3, 2):
        counts = {}
        for i in range(len(cmds) - seq_len + 1):
            seq = tuple(cmds[i:i+seq_len])
            # Filter out command modifications or meta-commands (like 'save this as')
            if any(c.lower().startswith("save ") or c.lower().startswith("run ") for c in seq):
                continue
            counts[seq] = counts.get(seq, 0) + 1
            
        for seq, freq in counts.items():
            if freq >= min_freq:
                # Deduplicate sub-sequences: if we are checking len 2, avoid adding it if it is a sub-sequence of an already added len 3 sequence
                is_subseq = False
                if seq_len == 2:
                    for existing_sug in suggestions:
                        if existing_sug.get("type") == "sequence":
                            p_steps = existing_sug.get("steps", [])
                            for start_idx in range(len(p_steps) - 1):
                                if p_steps[start_idx : start_idx + 2] == list(seq):
                                    is_subseq = True
                                    break
                            if is_subseq:
                                break
                if not is_subseq:
                    suggestions.append({
                        "type": "sequence",
                        "steps": list(seq),
                        "frequency": freq
                    })
                
    # 2. Look for single frequent commands (not already in sequences)
    counts_single = {}
    for c in cmds:
        if c.lower().startswith("save ") or c.lower().startswith("run "):
            continue
        counts_single[c] = counts_single.get(c, 0) + 1
        
    for cmd, freq in counts_single.items():
        if freq >= min_freq:
            # Check if this command is already part of a detected sequence
            is_in_seq = False
            for sug in suggestions:
                if cmd in sug["steps"]:
                    is_in_seq = True
                    break
            if not is_in_seq:
                suggestions.append({
                    "type": "single",
                    "steps": [cmd],
                    "frequency": freq
                })
                
    return suggestions


def get_db_stats() -> dict:
    """Return row counts for each table."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    stats = {}
    for table in ("interaction_history", "macros", "interaction_log"):
        cursor.execute(f"SELECT COUNT(*) FROM {table}")
        stats[table] = cursor.fetchone()[0]
    conn.close()
    return stats


def get_interaction_history() -> list[dict]:
    """Return all interaction history rows."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, command, action_taken, learned_at, frequency FROM interaction_history ORDER BY frequency DESC, learned_at DESC")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def get_interaction_log() -> list[dict]:
    """Return all interaction log rows."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    cursor.execute("SELECT id, command, timestamp FROM interaction_log ORDER BY id DESC LIMIT 500")
    rows = [dict(row) for row in cursor.fetchall()]
    conn.close()
    return rows


def get_learned_preferences(limit: int = 10) -> list[tuple[str, dict]]:
    """Retrieve top command mappings based on frequency or recency."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        # Select unique commands that were executed at least twice or once (if we want to remember even single corrections)
        # We can look for frequency >= 1 but order by frequency DESC, learned_at DESC to prioritize frequent ones
        cursor.execute("""
            SELECT command, action_taken 
            FROM interaction_history 
            WHERE command IS NOT NULL AND command != ''
            ORDER BY frequency DESC, learned_at DESC
            LIMIT ?
        """, (limit,))
        rows = cursor.fetchall()
    finally:
        conn.close()
    
    preferences = []
    for cmd, act_str in rows:
        try:
            preferences.append((cmd, json.loads(act_str)))
        except Exception:
            pass
    return preferences


# ─────────────────────────────────────────────────────────────────────────────
# PERSONALIZATION PROFILE
# ─────────────────────────────────────────────────────────────────────────────

PROFILE_DEFAULTS = {
    "name": "",
    "role": "",
    "interests": "",
    "tone": "professional",
    "custom_tone_prompt": "",
    "agent_name": "JARVIS",
}


def get_profile() -> dict:
    """Return the full user profile as a dict (with defaults for missing keys)."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("SELECT key, value FROM profile")
    rows = cursor.fetchall()
    conn.close()
    profile = dict(PROFILE_DEFAULTS)  # start with defaults
    for key, value in rows:
        profile[key] = value
    return profile


def set_profile_field(key: str, value: str) -> bool:
    """Upsert a single profile field. Returns True on success."""
    if key not in PROFILE_DEFAULTS:
        return False
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute(
        "INSERT INTO profile (key, value) VALUES (?, ?) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
        (key, value)
    )
    conn.commit()
    conn.close()
    return True


def set_profile(profile_dict: dict) -> bool:
    """Batch-update profile fields from a dict. Ignores unknown keys."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    for key, value in profile_dict.items():
        if key in PROFILE_DEFAULTS:
            cursor.execute(
                "INSERT INTO profile (key, value) VALUES (?, ?) "
                "ON CONFLICT(key) DO UPDATE SET value = excluded.value;",
                (key, str(value))
            )
    conn.commit()
    conn.close()
    return True


def clear_profile() -> None:
    """Reset the user profile to defaults."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute("DELETE FROM profile;")
    conn.commit()
    conn.close()

