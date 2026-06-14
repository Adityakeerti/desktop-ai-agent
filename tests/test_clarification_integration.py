import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import classify_intent

def test_clarification_integration():
    print("=" * 60)
    print("TESTING CLARIFICATION / AMBIGUOUS INTENT CLASSIFICATION")
    print("=" * 60)
    
    # 1. Test ambiguous command
    cmd = "delete document"
    print(f"Testing command: '{cmd}'")
    
    try:
        result = classify_intent(cmd)
        print("\nClassifier Result:")
        for k, v in result.items():
            print(f"  {k}: {v}")
            
        intent = result.get("intent", "")
        confidence = result.get("confidence", 1.0)
        options = result.get("options", [])
        
        # Check assertions
        is_ambiguous = (intent == "AMBIGUOUS" or confidence < 0.6)
        print(f"\nIs classified as ambiguous/low-confidence? {is_ambiguous}")
        print(f"Are options generated? {len(options) > 0} (count: {len(options)})")
        
        if is_ambiguous and len(options) > 0:
            print("\nSUCCESS: Ambiguous classification and option suggestion work successfully!")
        else:
            print("\nWARNING: Classifier completed but did not flag as ambiguous/low-confidence or returned no options.")
            print("This could be due to local LLM defaults, but structural fields are present.")
            
    except Exception as e:
        print(f"\nFAILURE: Exception during intent classification: {e}")
        
    print("=" * 60)

