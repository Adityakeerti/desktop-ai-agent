import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import build_prompt, execute
from backend.memory import record_ledger_action

def test_corrections_integration():
    print("=" * 60)
    print("TESTING NATURAL CORRECTIONS PROMPT INTEGRATION")
    print("=" * 60)
    
    # 1. Normal prompt
    cmd1 = "open notepad"
    prompt1 = build_prompt(cmd1)
    print("Is correction context present in normal prompt? ", "PREVIOUS ACTION CONTEXT:" in prompt1)
    
    # 2. Populate ledger with an action
    record_ledger_action("open_app", "notepad", {}, "Opened: notepad")
    
    # 3. Correction prompt
    cmd2 = "no, I meant Chrome"
    prompt2 = build_prompt(cmd2)
    print("Is correction context present in correction prompt? ", "PREVIOUS ACTION CONTEXT:" in prompt2)
    
    if "PREVIOUS ACTION CONTEXT:" in prompt2:
        print("\nSUCCESS: Correction context successfully extracted and injected!")
        print("\n--- INJECTED CONTEXT SNIPPET ---")
        # Find and print the context section
        start = prompt2.find("PREVIOUS ACTION CONTEXT:")
        end = prompt2.find("CURRENT COMMAND:")
        print(prompt2[start:end])
        print("--------------------------------")
    else:
        print("\nFAILURE: Correction context was not found in the prompt.")
    print("=" * 60)

