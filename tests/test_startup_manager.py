import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute

def test_startup_manager():
    print("=" * 60)
    print("TESTING REGISTRY STARTUP MANAGER")
    print("=" * 60)

    # 1. List current startup apps
    print("\n[Test 1] Listing current startup applications...")
    res1 = execute({"action": "startup_manager", "command": "list"})
    print("Result:")
    print(res1)
    assert "startup applications" in res1 or "No startup applications" in res1
    print("✓ listing current startup apps verified successfully.")

    # 2. Add/Enable a test startup entry
    app_name = "RAGETestStartup"
    app_path = "C:\\Windows\\notepad.exe"
    print(f"\n[Test 2] Adding test startup application '{app_name}' -> '{app_path}'...")
    res2 = execute({"action": "startup_manager", "command": "enable", "name": app_name, "path": app_path})
    print(f"Result: {res2}")
    assert "Successfully enabled/added startup app" in res2

    # Check if it shows in the list
    print("\nVerifying that the test app appears in the list...")
    res_list = execute({"action": "startup_manager", "command": "list"})
    print(f"List result: {res_list}")
    assert app_name in res_list
    print("✓ Test app successfully added and verified in the registry.")

    # 3. Disable/Remove the test startup entry
    print(f"\n[Test 3] Disabling/Removing test startup application '{app_name}'...")
    res3 = execute({"action": "startup_manager", "command": "disable", "name": app_name})
    print(f"Result: {res3}")
    assert "Successfully disabled/removed" in res3

    # Check that it is no longer in the list
    print("\nVerifying that the test app is no longer in the list...")
    res_list_after = execute({"action": "startup_manager", "command": "list"})
    print(f"List result after: {res_list_after}")
    assert app_name not in res_list_after
    print("✓ Test app successfully removed and verified from the registry.")

    print("\n" + "=" * 60)
    print("ALL REGISTRY STARTUP MANAGER TESTS COMPLETED SUCCESSFULLY!")
    print("=" * 60)

