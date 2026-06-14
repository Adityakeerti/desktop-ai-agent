import sys
import os
import time

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.memory import save_fact, get_all_facts, clear_all_facts
from backend.windows_agent import build_prompt, update_local_memories_from_message

def test_memory_integration():
    print("=" * 60)
    print("TESTING LOCAL FACT-MEMORY ENGINE")
    print("=" * 60)
    
    # 1. Clear facts
    clear_all_facts()
    print("Facts after clearing: ", get_all_facts())
    
    # 2. Save a fact
    save_fact("User prefers Brave browser over Chrome")
    save_fact("User's name is Aditya")
    print("\nFacts stored in database:")
    all_facts = get_all_facts()
    for f in all_facts:
        print(f"  - {f}")
        
    # 3. Test prompt retrieval with matching keyword
    cmd = "open brave browser"
    prompt = build_prompt(cmd)
    
    print(f"\nCommand: '{cmd}'")
    print("Is memory context present in prompt? ", "RELEVANT USER FACTS" in prompt)
    
    if "RELEVANT USER FACTS" in prompt:
        print("\n--- INJECTED MEMORY SNIPPET ---")
        start = prompt.find("RELEVANT USER FACTS")
        end = prompt.find("CURRENT COMMAND:")
        print(prompt[start:end])
        print("-------------------------------")
        print("\nSUCCESS: Facts retrieved and matched correctly!")
    else:
        print("\nFAILURE: No matched facts in prompt.")
        
    # 4. Test background fact extraction
    cmd2 = "I also work on a project called Adityakeerti/desktop-ai-agent"
    print(f"\nSimulating post-interaction fact extraction for command: '{cmd2}'")
    update_local_memories_from_message(cmd2)
    time.sleep(2.0) # Wait for potential async write
    
    print("\nUpdated facts in database:")
    for f in get_all_facts():
        print(f"  - {f}")
    print("=" * 60)

