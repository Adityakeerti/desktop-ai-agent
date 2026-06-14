import sys
import os
import shutil
import zipfile

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.windows_agent import execute

def test_archive():
    print("=" * 60)
    print("TESTING COMPRESS/EXTRACT ARCHIVE UTILITY")
    print("=" * 60)

    # 1. Create temporary files to compress
    cwd = os.getcwd()
    file_a = os.path.join(cwd, "temp_archive_a.txt")
    file_b = os.path.join(cwd, "temp_archive_b.txt")
    archive_zip = os.path.join(cwd, "test_archive.zip")
    extracted_dir = os.path.join(cwd, "test_extracted")

    print("\nCreating temporary files for archiving...")
    with open(file_a, "w", encoding="utf-8") as f:
        f.write("temporary file a content")
    with open(file_b, "w", encoding="utf-8") as f:
        f.write("temporary file b content")
    print("OK: Temporary files created.")

    try:
        # 2. Run zip_files action
        print("\nZipping files...")
        res = execute({
            "action": "zip_files",
            "files": [file_a, file_b],
            "output": archive_zip
        })
        print(f"Result: {res}")
        assert os.path.exists(archive_zip)
        assert zipfile.is_zipfile(archive_zip)
        print("OK: Zip file created successfully.")

        # 3. Run unzip_files action
        print("\nExtracting files...")
        res = execute({
            "action": "unzip_files",
            "archive": archive_zip,
            "output": extracted_dir
        })
        print(f"Result: {res}")
        assert "Successfully extracted" in res
        assert os.path.exists(extracted_dir)
        
        # Verify extracted contents
        ext_a = os.path.join(extracted_dir, "temp_archive_a.txt")
        ext_b = os.path.join(extracted_dir, "temp_archive_b.txt")
        assert os.path.exists(ext_a)
        assert os.path.exists(ext_b)
        
        with open(ext_a, "r", encoding="utf-8") as f:
            assert f.read() == "temporary file a content"
        with open(ext_b, "r", encoding="utf-8") as f:
            assert f.read() == "temporary file b content"
            
        print("OK: Archive contents extracted and verified successfully.")

        print("\n" + "=" * 60)
        print("ALL ARCHIVE COMPRESSION/EXTRACTION TESTS COMPLETED SUCCESSFULLY!")
        print("=" * 60)

    finally:
        # Clean up files and directories
        print("\nCleaning up files...")
        if os.path.exists(file_a):
            os.remove(file_a)
        if os.path.exists(file_b):
            os.remove(file_b)
        if os.path.exists(archive_zip):
            os.remove(archive_zip)
        if os.path.exists(extracted_dir):
            shutil.rmtree(extracted_dir)
        print("OK: Cleanup complete.")

