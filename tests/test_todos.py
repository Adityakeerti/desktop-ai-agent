import sys
import os
import tempfile
import sqlite3

# Redirect to temp database for safety
temp_db_fd, temp_db_path = tempfile.mkstemp(suffix=".db", prefix="jarvis_todo_test_")
os.environ["JARVIS_TEST_DB"] = temp_db_path

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute

def test_todos():
    try:
        print("=" * 60)
        print("TESTING TODO LIST SQLite MANAGER & LOGGING")
        print("=" * 60)

        # 1. Add some todos
        print("\nAdding todos...")
        res = execute({"action": "add_todo", "task": "Buy milk"})
        print(f"add_todo 'Buy milk' res: {res}")
        assert "Successfully added todo" in res

        res = execute({"action": "add_todo", "task": "Read book"})
        print(f"add_todo 'Read book' res: {res}")
        assert "Successfully added todo" in res

        # Try to add a duplicate todo
        res = execute({"action": "add_todo", "task": "Buy milk"})
        print(f"add_todo duplicate 'Buy milk' res: {res}")
        assert "Error:" in res or "failed to add" in res

        # 2. List todos
        print("\nListing todos...")
        res = execute({"action": "list_todos"})
        print("Todos:")
        print(res)
        assert "Buy milk" in res
        assert "Read book" in res
        assert "[ ]" in res # unchecked state

        # 3. Mark todo complete
        print("\nMarking 'Buy milk' as completed...")
        # Let's mark complete by name
        res = execute({"action": "mark_todo_complete", "value": "Buy milk"})
        print(f"mark_todo_complete 'Buy milk' res: {res}")
        assert "Successfully marked todo" in res

        # List todos and verify
        res = execute({"action": "list_todos"})
        print("Todos:")
        print(res)
        assert "[x] Buy milk" in res or "[x]" in res
        assert "[ ] Read book" in res

        # 4. Delete todo
        print("\nDeleting 'Read book'...")
        res = execute({"action": "delete_todo", "value": "Read book"})
        print(f"delete_todo 'Read book' res: {res}")
        assert "Successfully deleted todo" in res

        # List and verify deletion
        res = execute({"action": "list_todos"})
        print("Todos after delete:")
        print(res)
        assert "Read book" not in res
        assert "Buy milk" in res

        print("\n" + "=" * 60)
        print("ALL TODO TESTS COMPLETED SUCCESSFULLY!")
        print("=" * 60)

    finally:
        # Close temp file descriptors and delete temp file
        os.close(temp_db_fd)
        if os.path.exists(temp_db_path):
            try:
                os.remove(temp_db_path)
                # also clean up any WAL/SHM files SQLite might have created
                for suffix in ["-wal", "-shm"]:
                    extra_path = temp_db_path + suffix
                    if os.path.exists(extra_path):
                        os.remove(extra_path)
            except Exception as e:
                print(f"Cleanup warning: {e}")

