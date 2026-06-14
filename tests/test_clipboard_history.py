import sys
import os
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute
from backend.memory import record_clipboard_history

def test_clipboard_history():
    print("=" * 60)
    print("TESTING CLIPBOARD HISTORY SQLite DAEMON & LOGGING")
    print("=" * 60)

    # 1. Insert 5 separate clipboard entries
    test_entries = [
        "Test Clipboard Item A - Coffee Break",
        "Test Clipboard Item B - Write Code",
        "Test Clipboard Item C - Fix Bugs",
        "Test Clipboard Item D - Run Tests",
        "Test Clipboard Item E - Done Task"
    ]
    
    print("\nInserting 5 test clipboard entries into database...")
    for entry in test_entries:
        record_clipboard_history(entry)
        time.sleep(0.1) # small delay for distinct timestamps
    print("✓ Test entries written successfully.")

    # 2. Call list_clipboard_history action
    print("\nExecuting action: list_clipboard_history...")
    res = execute({"action": "list_clipboard_history", "limit": 10})
    print("Result:")
    print(res)
    
    # Verify that all 5 test entries exist in the history output
    for entry in test_entries:
        assert entry in res
    print("\n✓ Verified: All 5 test entries successfully captured and listed!")

    print("\n" + "=" * 60)
    print("ALL CLIPBOARD HISTORY TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 60)

