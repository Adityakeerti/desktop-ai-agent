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

    # Execution ledger table (Phase 2 Task 2.1)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS execution_ledger (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        action_type TEXT,
        value TEXT,
        parameters TEXT,
        timestamp TEXT,
        result TEXT
    );
    """)

    # Local memories table (Phase 2 Task 2.4)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS local_memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fact TEXT UNIQUE,
        updated_at TEXT
    );
    """)

    # Clipboard history table (Phase 4 Task 4.1)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS clipboard_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        content TEXT UNIQUE,
        timestamp TEXT
    );
    """)

    # Todos table (Phase 4 Task 4.3)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS todos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task TEXT UNIQUE,
        completed INTEGER DEFAULT 0,
        created_at TEXT
    );
    """)

    # Apps table for dynamic App Matrix
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS apps (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT UNIQUE,
        icon TEXT,
        path_or_command TEXT
    );
    """)
    
    cursor.execute("SELECT COUNT(*) FROM apps")
    if cursor.fetchone()[0] == 0:
        default_apps = [
            ("Notepad", "edit_note", "notepad"),
            ("Calculator", "calculate", "calculator"),
            ("Explorer", "folder_open", "explorer"),
            ("Chrome", "language", "chrome"),
            ("Task Manager", "monitor_heart", "task manager"),
            ("VS Code", "code", "vs code"),
            ("Spotify", "music_note", "spotify"),
            ("Discord", "forum", "discord"),
            ("Paint", "palette", "paint"),
            ("PowerShell", "terminal", "powershell"),
            ("Brave", "security", "brave"),
            ("Edge", "edge", "edge")
        ]
        cursor.executemany("INSERT INTO apps (label, icon, path_or_command) VALUES (?, ?, ?)", default_apps)
        conn.commit()
    
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
    - 2-step sequences of commands executed frequently within temporal sessions.
    - 3-step sequences of commands executed frequently within temporal sessions.
    """
    profile = get_profile()
    
    # Check if recommendations are enabled
    rec_enabled = profile.get("macro_recommendations_enabled", "true").lower() == "true"
    if not rec_enabled:
        return []

    try:
        min_freq = int(profile.get("macro_min_freq", str(min_freq)))
    except ValueError:
        pass
        
    try:
        timeout_sec = int(profile.get("macro_timeout_sec", "180"))
    except ValueError:
        timeout_sec = 180

    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Load all commands run sequentially with their timestamps
    cursor.execute("SELECT command, timestamp FROM interaction_log ORDER BY id ASC")
    rows = cursor.fetchall()
    conn.close()
    
    from datetime import datetime
    
    # Group commands into temporal episodes/sessions
    sessions = []
    current_session = []
    
    for command, ts_str in rows:
        if not ts_str:
            ts = datetime.now()
        else:
            try:
                ts = datetime.strptime(ts_str, "%Y-%m-%d %H:%M:%S")
            except ValueError:
                ts = datetime.now()
        
        if not current_session:
            current_session.append((command, ts))
        else:
            _, last_ts = current_session[-1]
            time_diff = (ts - last_ts).total_seconds()
            if time_diff <= timeout_sec:
                current_session.append((command, ts))
            else:
                sessions.append([cmd for cmd, _ in current_session])
                current_session = [(command, ts)]
                
    if current_session:
        sessions.append([cmd for cmd, _ in current_session])
        
    suggestions = []
    
    # 1. Look for sequences of length 3 and 2 (check 3 first to filter out sub-sequences of length 2)
    for seq_len in (3, 2):
        counts = {}
        for session in sessions:
            if len(session) < seq_len:
                continue
            for i in range(len(session) - seq_len + 1):
                seq = tuple(session[i:i+seq_len])
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
    for session in sessions:
        for c in session:
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
    "macro_recommendations_enabled": "true",
    "macro_min_freq": "3",
    "macro_timeout_sec": "180",
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


def record_ledger_action(action_type: str, value: str, parameters: dict, result: str):
    """Record an action execution details in the ledger."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    param_str = json.dumps(parameters)
    try:
        cursor.execute("""
        INSERT INTO execution_ledger (action_type, value, parameters, timestamp, result)
        VALUES (?, ?, ?, ?, ?)
        """, (action_type, str(value), param_str, now, result))
        conn.commit()
    except Exception as e:
        conn.rollback()
        raise RuntimeError(f"record_ledger_action failed: {e}") from e
    finally:
        conn.close()


def get_last_ledger_action() -> dict | None:
    """Retrieve the most recent action executed from the ledger."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("""
        SELECT action_type, value, parameters, timestamp, result 
        FROM execution_ledger 
        ORDER BY id DESC LIMIT 1
        """)
        row = cursor.fetchone()
        if row:
            return {
                "action_type": row[0],
                "value": row[1],
                "parameters": json.loads(row[2]),
                "timestamp": row[3],
                "result": row[4]
            }
    except Exception:
        pass
    finally:
        conn.close()
    return None


def delete_last_ledger_action() -> bool:
    """Delete the most recent ledger action (used when undoing)."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM execution_ledger WHERE id = (SELECT MAX(id) FROM execution_ledger)")
        conn.commit()
        return cursor.rowcount > 0
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()


def save_fact(fact: str) -> bool:
    """Insert a new extracted fact/preference into the database."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        cursor.execute("""
        INSERT INTO local_memories (fact, updated_at)
        VALUES (?, ?)
        ON CONFLICT(fact) DO UPDATE SET updated_at = excluded.updated_at
        """, (fact.strip(), now))
        conn.commit()
        return True
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()


def delete_fact_by_text(fact: str) -> bool:
    """Delete a fact from database matching text exactly."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM local_memories WHERE LOWER(fact) = ?", (fact.strip().lower(),))
        conn.commit()
        return cursor.rowcount > 0
    except Exception:
        conn.rollback()
        return False
    finally:
        conn.close()


def get_all_facts() -> list[str]:
    """Retrieve all facts currently stored in the database."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    facts = []
    try:
        cursor.execute("SELECT fact FROM local_memories ORDER BY updated_at DESC")
        facts = [row[0] for row in cursor.fetchall()]
    except Exception:
        pass
    finally:
        conn.close()
    return facts


def clear_all_facts():
    """Clear all facts stored in database."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM local_memories")
        conn.commit()
    except Exception:
        conn.rollback()
    finally:
        conn.close()


def record_clipboard_history(text: str):
    """Record a unique clipboard text entry into the SQLite history."""
    if not text or not text.strip():
        return
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT OR REPLACE INTO clipboard_history (content, timestamp) VALUES (?, ?)",
            (text.strip(), time.strftime("%Y-%m-%d %H:%M:%S"))
        )
        conn.commit()
    except Exception as e:
        print(f"Error saving clipboard history: {e}")
    finally:
        conn.close()


def get_clipboard_history(limit=20):
    """Retrieve the last N clipboard history items."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    rows = []
    try:
        cursor.execute(
            "SELECT content, timestamp FROM clipboard_history ORDER BY id DESC LIMIT ?",
            (limit,)
        )
        rows = cursor.fetchall()
    except Exception as e:
        print(f"Error retrieving clipboard history: {e}")
    finally:
        conn.close()
    return rows


def add_todo(task: str) -> bool:
    """Add a new task to the todo list."""
    if not task or not task.strip():
        return False
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    now = time.strftime("%Y-%m-%d %H:%M:%S")
    try:
        cursor.execute(
            "INSERT INTO todos (task, completed, created_at) VALUES (?, 0, ?)",
            (task.strip(), now)
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False
    except Exception as e:
        conn.rollback()
        print(f"Error adding todo: {e}")
        return False
    finally:
        conn.close()


def list_todos() -> list[dict]:
    """Retrieve all todo items."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    rows = []
    try:
        cursor.execute("SELECT id, task, completed, created_at FROM todos ORDER BY id ASC")
        rows = [dict(row) for row in cursor.fetchall()]
    except Exception as e:
        print(f"Error listing todos: {e}")
    finally:
        conn.close()
    return rows


def mark_todo_complete(task_id_or_name) -> bool:
    """Mark a todo as completed by its ID or exact task text."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        is_id = False
        try:
            val = int(task_id_or_name)
            is_id = True
        except (ValueError, TypeError):
            pass

        if is_id:
            cursor.execute("UPDATE todos SET completed = 1 WHERE id = ?", (val,))
        else:
            cursor.execute("UPDATE todos SET completed = 1 WHERE LOWER(task) = ?", (str(task_id_or_name).strip().lower(),))
        
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        conn.rollback()
        print(f"Error completing todo: {e}")
        return False
    finally:
        conn.close()


def delete_todo(task_id_or_name) -> bool:
    """Delete a todo item by its ID or exact task text."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        is_id = False
        try:
            val = int(task_id_or_name)
            is_id = True
        except (ValueError, TypeError):
            pass

        if is_id:
            cursor.execute("DELETE FROM todos WHERE id = ?", (val,))
        else:
            cursor.execute("DELETE FROM todos WHERE LOWER(task) = ?", (str(task_id_or_name).strip().lower(),))
            
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        conn.rollback()
        print(f"Error deleting todo: {e}")
        return False
    finally:
        conn.close()


def get_apps() -> list[dict]:
    """Retrieve all apps from the database."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("SELECT id, label, icon, path_or_command FROM apps")
        rows = cursor.fetchall()
        return [{"id": r[0], "label": r[1], "icon": r[2], "path_or_command": r[3]} for r in rows]
    except Exception as e:
        print(f"Error getting apps: {e}")
        return []
    finally:
        conn.close()


def add_app(label: str, icon: str, path_or_command: str) -> bool:
    """Add a new app to the database."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute(
            "INSERT INTO apps (label, icon, path_or_command) VALUES (?, ?, ?)",
            (label.strip(), icon.strip(), path_or_command.strip())
        )
        conn.commit()
        return True
    except Exception as e:
        conn.rollback()
        print(f"Error adding app: {e}")
        return False
    finally:
        conn.close()


def delete_app(label: str) -> bool:
    """Delete an app by its label."""
    init_db()
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    try:
        cursor.execute("DELETE FROM apps WHERE LOWER(label) = ?", (label.strip().lower(),))
        conn.commit()
        return cursor.rowcount > 0
    except Exception as e:
        conn.rollback()
        print(f"Error deleting app: {e}")
        return False
    finally:
        conn.close()

