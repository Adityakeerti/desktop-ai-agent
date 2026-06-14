import sys
import os
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute

def test_file_search():
    print("=" * 60)
    print("TESTING SMART FILE SEARCH UTILITY")
    print("=" * 60)

    # 1. Create dummy files in the current workspace directory for searching
    cwd = os.getcwd()
    file_a = os.path.join(cwd, "temp_search_a.txt")
    file_b = os.path.join(cwd, "temp_search_b.pdf")

    print("\nCreating temporary search test files...")
    with open(file_a, "w", encoding="utf-8") as f:
        f.write("temporary file a")
    with open(file_b, "w", encoding="utf-8") as f:
        f.write("temporary file b")
    print("OK: Temporary files created.")

    try:
        # 2. Test recursive search by extension and name
        print("\nSearching for txt files with name 'temp_search'...")
        res = execute({"action": "smart_file_search", "path": cwd, "query": "temp_search", "ext": "txt"})
        print("Result:")
        print(res)
        assert "temp_search_a.txt" in res
        assert "temp_search_b.pdf" not in res
        print("OK: Successfully filtered by .txt extension.")

        print("\nSearching for pdf files with name 'temp_search'...")
        res = execute({"action": "smart_file_search", "path": cwd, "query": "temp_search", "ext": ".pdf"})
        print("Result:")
        print(res)
        assert "temp_search_b.pdf" in res
        assert "temp_search_a.txt" not in res
        print("OK: Successfully filtered by .pdf extension.")

        # 3. Test recent files list
        print("\nListing recent items...")
        res = execute({"action": "smart_file_search", "recent": True})
        print("Recent items result length:", len(res))
        # Just assert it returns successfully and lists something or indicates no recent items
        assert "Recent Files:" in res or "No recent files found" in res
        print("OK: Recent files query executed successfully.")

        # 4. Test recycle bin listing
        print("\nListing Recycle Bin items...")
        res = execute({"action": "smart_file_search", "recycle_bin": True})
        print("Recycle Bin result length:", len(res))
        assert "Recycle Bin Items:" in res or "Recycle Bin is empty" in res
        print("OK: Recycle Bin query executed successfully.")

        print("\n" + "=" * 60)
        print("ALL SMART FILE SEARCH TESTS COMPLETED SUCCESSFULLY!")
        print("=" * 60)

    finally:
        # Clean up temporary files
        print("\nCleaning up temporary files...")
        if os.path.exists(file_a):
            os.remove(file_a)
        if os.path.exists(file_b):
            os.remove(file_b)
        print("OK: Cleaned up temporary files.")

