import sys
import os
import re

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute

def test_take_note():
    print("=" * 60)
    print("TESTING LOCAL NOTE-TAKING MARKDOWN ENGINE")
    print("=" * 60)

    # Determine notes.md path
    home_dir = os.path.expanduser("~")
    docs_dir = os.path.join(home_dir, "Documents")
    if not os.path.exists(docs_dir):
        docs_dir = home_dir
    notes_path = os.path.join(docs_dir, "notes.md")

    # Read original contents to restore later
    original_content = ""
    if os.path.exists(notes_path):
        with open(notes_path, "r", encoding="utf-8") as f:
            original_content = f.read()

    # 1. Take a note
    test_note = "Verify client meeting rescheduled to Tuesday"
    category = "Meeting"
    print(f"\n[Test 1] Writing note: '{test_note}' under category '{category}'...")
    res = execute({"action": "take_note", "content": test_note, "category": category})
    print(f"Result: {res}")
    assert "Successfully added note" in res
    assert os.path.exists(notes_path)

    # 2. Verify file content
    print("\n[Test 2] Reading notes.md and verifying content...")
    with open(notes_path, "r", encoding="utf-8") as f:
        content = f.read()
    
    print("notes.md Content:")
    print("----------------------------------------")
    print(content)
    print("----------------------------------------")

    assert f"Category: {category}" in content
    assert f"- {test_note}" in content
    print("✓ Note content and category header verified successfully.")

    # Restore original content
    print("\nRestoring original notes.md file...")
    if original_content:
        with open(notes_path, "w", encoding="utf-8") as f:
            f.write(original_content)
    else:
        if os.path.exists(notes_path):
            os.remove(notes_path)
    print("✓ Restored successfully.")

    print("\n" + "=" * 60)
    print("ALL NOTE-TAKING TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 60)

