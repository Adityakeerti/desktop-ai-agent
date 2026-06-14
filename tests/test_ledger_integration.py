import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute
from backend.memory import get_last_ledger_action

def test_ledger_integration():
    print("=" * 60)
    print("TESTING LEDGER INTEGRATION")
    print("=" * 60)
    
    # Run a successful volume action
    action = {"action": "set_volume", "value": 75}
    print(f"Executing: {action}")
    result = execute(action)
    print(f"Result: {result}")
    
    # Retrieve the last ledger action
    last_action = get_last_ledger_action()
    print(f"\nRetrieved Last Ledger Action: {last_action}")
    
    if last_action and last_action["action_type"] == "set_volume" and str(last_action["value"]) == "75":
        print("\nSUCCESS: Ledger successfully recorded and retrieved action!")
    else:
        print("\nFAILURE: Ledger did not record or retrieve correctly.")
    print("=" * 60)

