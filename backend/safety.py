import os
import re
import time
import json
import logging
import ctypes
from ctypes import wintypes
import threading

log = logging.getLogger("rage_safety")

# Paths
LOG_DIR = os.path.expanduser("~/.jarvis/logs")

# Sandbox state
_sandbox_active = False

# Emergency stop state
_emergency_stopped = False
active_processes = []
active_processes_lock = threading.Lock()

# Dangerous patterns list
DANGEROUS_PATTERNS = [
    (re.compile(r"\bformat\b", re.IGNORECASE), "format disk command"),
    (re.compile(r"system32", re.IGNORECASE), "System32 deletion/access attempt"),
    (re.compile(r"rm\s+-rf", re.IGNORECASE), "Force recursive delete command"),
    (re.compile(r"\breg\s+(add|delete|copy|save|restore|load|unload|import|export)\b", re.IGNORECASE), "Dangerous Registry manipulation"),
    (re.compile(r"\bregedit\b", re.IGNORECASE), "Registry Editor execution"),
    (re.compile(r"\bdel\b.*\b/f\b.*\b/s\b", re.IGNORECASE), "Recursive forceful deletion"),
    (re.compile(r"rd\s+/s\s+/q", re.IGNORECASE), "Recursive directory deletion"),
]

def is_sandbox_active() -> bool:
    global _sandbox_active
    return _sandbox_active

def set_sandbox_mode(enabled: bool):
    global _sandbox_active
    _sandbox_active = enabled
    log.info(f"Sandbox mode set to: {_sandbox_active}")

def is_emergency_stopped() -> bool:
    global _emergency_stopped
    return _emergency_stopped

def reset_emergency_stop():
    global _emergency_stopped
    _emergency_stopped = False

def track_process(proc):
    with active_processes_lock:
        active_processes.append(proc)

def untrack_process(proc):
    with active_processes_lock:
        if proc in active_processes:
            active_processes.remove(proc)

def trigger_emergency_stop():
    global _emergency_stopped
    _emergency_stopped = True
    print("\n🚨 EMERGENCY STOP TRIGGERED 🚨")
    log.warning("Emergency stop triggered. Aborting execution.")
    
    # Terminate all tracked processes
    with active_processes_lock:
        for p in list(active_processes):
            try:
                p.terminate()
                time.sleep(0.1)
                p.kill()
            except Exception:
                pass
        active_processes.clear()
        
    # Attempt simple beep notifications
    try:
        ctypes.windll.kernel32.Beep(1000, 500)
    except Exception:
        pass

def is_dangerous(action: dict) -> tuple[bool, str]:
    """Check action parameters for dangerous commands or system manipulations."""
    # Convert whole action dict to string for searching
    action_str = json.dumps(action)
    for pattern, desc in DANGEROUS_PATTERNS:
        if pattern.search(action_str):
            return True, f"Blocked: {desc} detected."
            
    # Explicitly block delete actions if they try to delete root/system dirs
    a = action.get("action", "")
    if a in ("delete_file", "delete_folder"):
        path = str(action.get("path", "")).lower()
        if "c:/windows" in path or "c:\\windows" in path or "system32" in path or path.strip() == "c:/" or path.strip() == "c:\\":
            return True, "Blocked: Destructive action targeting system root directories."
            
    return False, ""

def log_action(command: str, action: dict, result: str):
    """Log the command, parsed action, and result to a daily file."""
    os.makedirs(LOG_DIR, exist_ok=True)
    today = time.strftime("%Y-%m-%d")
    log_path = os.path.join(LOG_DIR, f"{today}.log")
    
    timestamp = time.strftime("%H:%M:%S")
    sandbox_flag = "[SANDBOX]" if is_sandbox_active() else "[LIVE]"
    
    log_entry = (
        f"[{timestamp}] {sandbox_flag} Command: {command}\n"
        f"  Action: {json.dumps(action)}\n"
        f"  Result: {result}\n"
        f"{'-'*80}\n"
    )
    
    try:
        with open(log_path, "a", encoding="utf-8") as f:
            f.write(log_entry)
    except Exception as e:
        log.error(f"Failed to write action log: {e}")

# Register Windows Global Hotkey for Emergency Stop (Ctrl+Shift+X)
def start_emergency_stop_listener():
    def listener_thread():
        user32 = ctypes.windll.user32
        HOTKEY_ID_STOP = 102
        MOD_CONTROL = 0x0002
        MOD_SHIFT = 0x0004
        VK_X = 0x58  # 'X' key
        
        # Register Ctrl+Shift+X
        if not user32.RegisterHotKey(None, HOTKEY_ID_STOP, MOD_CONTROL | MOD_SHIFT, VK_X):
            log.error("Failed to register emergency stop hotkey (Ctrl+Shift+X)")
            return
            
        try:
            msg = wintypes.MSG()
            while user32.GetMessageW(ctypes.byref(msg), None, 0, 0) != 0:
                if msg.message == 0x0312:  # WM_HOTKEY
                    if msg.wParam == HOTKEY_ID_STOP:
                        trigger_emergency_stop()
                user32.TranslateMessage(ctypes.byref(msg))
                user32.DispatchMessageW(ctypes.byref(msg))
        finally:
            user32.UnregisterHotKey(None, HOTKEY_ID_STOP)
            
    t = threading.Thread(target=listener_thread, daemon=True)
    t.start()
    log.info("Emergency Stop listener thread started (Ctrl+Shift+X)")
