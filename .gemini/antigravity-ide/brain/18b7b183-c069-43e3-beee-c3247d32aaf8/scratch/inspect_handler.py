import os
import sqlite3
import shutil
import glob

local_appdata = os.environ.get("LOCALAPPDATA", "")
db_pattern = os.path.join(local_appdata, "Microsoft", "Windows", "Notifications", "wpndatabase.db")
db_paths = glob.glob(db_pattern)
if not db_paths:
    db_pattern_rec = os.path.join(local_appdata, "Microsoft", "Windows", "Notifications", "*", "wpndatabase.db")
    db_paths = glob.glob(db_pattern_rec)

if db_paths:
    db_path = db_paths[0]
    temp_db = "temp_wpndatabase.db"
    shutil.copy2(db_path, temp_db)
    
    conn = sqlite3.connect(temp_db)
    cursor = conn.cursor()
    
    # Get columns of NotificationHandler
    cursor.execute("PRAGMA table_info(NotificationHandler);")
    cols = [c[1] for c in cursor.fetchall()]
    print(f"NotificationHandler columns: {cols}")
    
    # Query sample rows
    cursor.execute("SELECT * FROM NotificationHandler LIMIT 10;")
    for row in cursor.fetchall():
        print(row)
        
    conn.close()
    os.remove(temp_db)
