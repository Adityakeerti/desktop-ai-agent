import os
import tempfile
import pytest
from backend.utils.file_search import recursive_search_files, parse_size_to_bytes

def test_parse_size_to_bytes():
    assert parse_size_to_bytes(500) == 500
    assert parse_size_to_bytes("500") == 500
    assert parse_size_to_bytes("500b") == 500
    assert parse_size_to_bytes("1kb") == 1024
    assert parse_size_to_bytes("1.5mb") == int(1.5 * 1024 * 1024)
    assert parse_size_to_bytes("1gb") == 1024 * 1024 * 1024
    assert parse_size_to_bytes("") is None
    assert parse_size_to_bytes(None) is None

def test_file_size_filtering():
    with tempfile.TemporaryDirectory() as tmpdir:
        # Create 3 files:
        # 1. small.txt (10 bytes)
        # 2. medium.txt (10 KB = 10240 bytes)
        # 3. large.txt (1 MB = 1048576 bytes)
        
        small_path = os.path.join(tmpdir, "small.txt")
        medium_path = os.path.join(tmpdir, "medium.txt")
        large_path = os.path.join(tmpdir, "large.txt")
        
        with open(small_path, "wb") as f:
            f.write(b"0" * 10)
            
        with open(medium_path, "wb") as f:
            f.write(b"0" * 10240)
            
        with open(large_path, "wb") as f:
            f.write(b"0" * (1024 * 1024))
            
        # Search all
        all_files = recursive_search_files(tmpdir)
        names = [f["name"] for f in all_files]
        assert "small.txt" in names
        assert "medium.txt" in names
        assert "large.txt" in names
        
        # Test min_size = 500 (bytes)
        res = recursive_search_files(tmpdir, min_size=500)
        names = [f["name"] for f in res]
        assert "small.txt" not in names
        assert "medium.txt" in names
        assert "large.txt" in names
        
        # Test max_size = "500KB"
        res = recursive_search_files(tmpdir, max_size="500KB")
        names = [f["name"] for f in res]
        assert "small.txt" in names
        assert "medium.txt" in names
        assert "large.txt" not in names
        
        # Test min_size = "1KB", max_size = "500KB"
        res = recursive_search_files(tmpdir, min_size="1KB", max_size="500KB")
        names = [f["name"] for f in res]
        assert "small.txt" not in names
        assert "medium.txt" in names
        assert "large.txt" not in names
