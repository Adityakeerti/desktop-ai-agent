import time
import threading
import pyperclip
import backend.memory as memory

def clipboard_listener():
    """Poller thread that detects changes in the clipboard and saves them in SQLite."""
    last_clip = ""
    try:
        last_clip = pyperclip.paste()
        # Save initial clipboard if not empty
        if last_clip:
            memory.record_clipboard_history(last_clip)
    except Exception:
        pass
        
    while True:
        try:
            current_clip = pyperclip.paste()
            if current_clip and current_clip != last_clip:
                last_clip = current_clip
                # Save into the SQLite clipboard_history table
                memory.record_clipboard_history(current_clip)
        except Exception:
            pass
        time.sleep(1.5)

def start_daemon():
    """Starts the clipboard poller as a daemon background thread."""
    t = threading.Thread(target=clipboard_listener, name="ClipboardDaemon", daemon=True)
    t.start()
