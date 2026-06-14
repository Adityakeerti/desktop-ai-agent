import sys
import os
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute

def test_undo_integration():
    print("=" * 60)
    print("TESTING UNDO INTEGRATION")
    print("=" * 60)
    
    test_file = "scripts/undo_test.txt"
    if os.path.exists(test_file):
        os.remove(test_file)
        
    # 1. Create file
    action = {
        "action": "create_file",
        "path": test_file,
        "content": "hello undo"
    }
    print(f"Executing: {action}")
    res = execute(action)
    print(f"Result: {res}")
    
    print(f"Does file exist? {os.path.exists(test_file)}")
    
    time.sleep(1.0)
    
    # 2. Undo
    action2 = {"action": "undo_last_action"}
    print(f"\nExecuting undo action: {action2}")
    res2 = execute(action2)
    print(f"Result: {res2}")
    
    print(f"Does file exist after undo? {os.path.exists(test_file)}")
    
    if not os.path.exists(test_file):
        print("\nSUCCESS: Undo successfully reverted the action!")
    else:
        print("\nFAILURE: File still exists after undo.")
    print("=" * 60)

