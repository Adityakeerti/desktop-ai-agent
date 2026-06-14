import sys
import os
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute

def test_tabs_integration():
    print("=" * 60)
    print("TESTING TAB MANAGEMENT INTEGRATION")
    print("=" * 60)
    
    # 1. Test new tab
    action = {
        "action": "manage_tabs",
        "app": "brave",
        "tab_action": "new_tab"
    }
    print(f"Executing tab action: {action}")
    result = execute(action)
    print(f"Result: {result}")
    
    time.sleep(2.0)
    
    # 2. Test close tab
    action2 = {
        "action": "manage_tabs",
        "app": "brave",
        "tab_action": "close_tab"
    }
    print(f"\nExecuting tab action: {action2}")
    result2 = execute(action2)
    print(f"Result: {result2}")
    print("=" * 60)

