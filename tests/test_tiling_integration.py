import sys
import os

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute

def test_tiling_integration():
    print("=" * 60)
    print("TESTING TILING AND POSITION INTEGRATION")
    print("=" * 60)
    
    # 1. Test tiling
    action = {
        "action": "tile_windows",
        "layout": "left_right",
        "apps": ["explorer", "brave"]
    }
    print(f"Executing tiling action: {action}")
    result = execute(action)
    print(f"Result: {result}")
    
    # 2. Test positioning
    action2 = {
        "action": "position_window",
        "value": "explorer",
        "monitor": 0,
        "x": 100,
        "y": 100,
        "width": 800,
        "height": 500
    }
    print(f"\nExecuting position action: {action2}")
    result2 = execute(action2)
    print(f"Result: {result2}")
    print("=" * 60)

