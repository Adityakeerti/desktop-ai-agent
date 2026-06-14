import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute

def test_focus_integration():
    print("=" * 60)
    print("TESTING APP STATE FOCUS INTEGRATION")
    print("=" * 60)
    
    # We know 'brave' or 'explorer' or 'edge' is running. Let's try 'explorer' or 'brave'.
    action = {"action": "open_app", "value": "explorer"}
    print(f"Executing action: {action}")
    result = execute(action)
    print(f"Result: {result}")
    
    action2 = {"action": "open_app", "value": "brave"}
    print(f"\nExecuting action: {action2}")
    result2 = execute(action2)
    print(f"Result: {result2}")
    print("=" * 60)

