import os
import sys
import glob
import time
import win32com.client

def get_recent_files(limit: int = 10) -> list[dict]:
    """Retrieve recent files from %APPDATA%/Microsoft/Windows/Recent."""
    recent_dir = os.path.expandvars(r"%APPDATA%\Microsoft\Windows\Recent")
    if not os.path.exists(recent_dir):
        return []
        
    shell = win32com.client.Dispatch("WScript.Shell")
    recent_items = []
    
    try:
        lnk_files = glob.glob(os.path.join(recent_dir, "*.lnk"))
        lnk_files.sort(key=os.path.getmtime, reverse=True)
        
        for lnk in lnk_files[:limit * 2]:
            try:
                shortcut = shell.CreateShortCut(lnk)
                target = shortcut.Targetpath
                if target and os.path.exists(target) and os.path.isfile(target):
                    name = os.path.basename(target)
                    mtime = os.path.getmtime(lnk)
                    mtime_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mtime))
                    recent_items.append({
                        "name": name,
                        "path": target.replace("\\", "/"),
                        "accessed_at": mtime_str
                    })
                    if len(recent_items) >= limit:
                        break
            except Exception:
                continue
    except Exception as e:
        print(f"Error getting recent files: {e}")
        
    return recent_items

def get_recycle_bin_items() -> list[dict]:
    """Retrieve all items in the Recycle Bin."""
    items_list = []
    try:
        shell = win32com.client.Dispatch("Shell.Application")
        recycle_bin = shell.NameSpace(10) # 10 = Recycle Bin
        if recycle_bin:
            items = recycle_bin.Items()
            for i in range(items.Count):
                item = items.Item(i)
                items_list.append({
                    "name": item.Name,
                    "path": item.Path.replace("\\", "/"),
                    "type": "Folder" if item.IsFolder else "File"
                })
    except Exception as e:
        print(f"Error listing recycle bin: {e}")
    return items_list

def restore_recycle_bin_item(name_or_path: str) -> bool:
    """Restore an item from the Recycle Bin by its name or path."""
    try:
        shell = win32com.client.Dispatch("Shell.Application")
        recycle_bin = shell.NameSpace(10)
        if recycle_bin:
            items = recycle_bin.Items()
            name_lower = name_or_path.lower().strip()
            for i in range(items.Count):
                item = items.Item(i)
                if item.Name.lower() == name_lower or item.Path.lower().replace("\\", "/") == name_lower:
                    for verb in item.Verbs():
                        vname = verb.Name.replace("&", "").lower()
                        if "restore" in vname or "undelete" in vname:
                            verb.DoIt()
                            return True
    except Exception as e:
        print(f"Error restoring from recycle bin: {e}")
    return False

def parse_size_to_bytes(size_val) -> int | None:
    if size_val is None or size_val == "":
        return None
    if isinstance(size_val, (int, float)):
        return int(size_val)
    s = str(size_val).strip().lower()
    import re
    m = re.match(r"^(\d+(?:\.\d+)?)\s*([kmg]b?|b)?$", s)
    if not m:
        try:
            return int(float(s))
        except ValueError:
            return None
    val = float(m.group(1))
    unit = m.group(2)
    if not unit or unit == "b":
        return int(val)
    elif unit.startswith("k"):
        return int(val * 1024)
    elif unit.startswith("m"):
        return int(val * 1024 * 1024)
    elif unit.startswith("g"):
        return int(val * 1024 * 1024 * 1024)
    return int(val)

def recursive_search_files(
    start_dir: str,
    query: str = None,
    ext: str = None,
    days: int = None,
    min_size: int | str = None,
    max_size: int | str = None,
    limit: int = 50
) -> list[dict]:
    """
    Search files recursively starting from start_dir.
    Filters:
    - query: match in filename (case insensitive)
    - ext: filename extension matching (e.g. '.pdf')
    - days: modified within last N days
    - min_size: minimum file size (int bytes or str '10MB')
    - max_size: maximum file size (int bytes or str '10MB')
    """
    results = []
    query_lower = query.lower().strip() if query else None
    ext_lower = ext.lower().strip() if ext else None
    if ext_lower and not ext_lower.startswith("."):
        ext_lower = "." + ext_lower
        
    now = time.time()
    seconds_limit = days * 86400 if days else None
    
    min_size_bytes = parse_size_to_bytes(min_size)
    max_size_bytes = parse_size_to_bytes(max_size)
    
    search_dirs = [start_dir]
    if start_dir == os.path.expanduser("~"):
        search_dirs = [
            os.path.join(start_dir, "Documents"),
            os.path.join(start_dir, "Downloads"),
            os.path.join(start_dir, "Desktop")
        ]
        search_dirs = [d for d in search_dirs if os.path.exists(d)]
        
    for current_start in search_dirs:
        for root, dirs, files in os.walk(current_start):
            dirs[:] = [d for d in dirs if not d.startswith(".") and d.lower() not in ("appdata", "node_modules", "vendor", "env", "venv")]
            
            for file in files:
                file_path = os.path.join(root, file)
                
                if ext_lower and not file.lower().endswith(ext_lower):
                    continue
                    
                if query_lower and query_lower not in file.lower():
                    continue
                    
                try:
                    mtime = os.path.getmtime(file_path)
                    if seconds_limit and (now - mtime) > seconds_limit:
                        continue
                    mtime_str = time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(mtime))
                    size = os.path.getsize(file_path)
                    
                    if min_size_bytes is not None and size < min_size_bytes:
                        continue
                    if max_size_bytes is not None and size > max_size_bytes:
                        continue
                except Exception:
                    continue
                    
                results.append({
                    "name": file,
                    "path": file_path.replace("\\", "/"),
                    "size_bytes": size,
                    "modified_at": mtime_str
                })
                
                if len(results) >= limit:
                    return results
                    
    return results
