"""Download pinned official MHR runtime weights and retain their license."""
from pathlib import Path
import hashlib
import shutil
import sys
import tempfile
import urllib.request
import zipfile

URL = 'https://github.com/facebookresearch/MHR/releases/download/v1.0.1/assets.zip'
ARCHIVE_HASH = 'e4f4f205cd87c0fa106577ba1de4fc763e4eb197c924461d2ef7e6944e9d6b94'
MODEL_HASH = '352e271a6c42729c68554ceaea0c955e866970160c31e35506d782dc0f7377bc'

def digest(path):
    h = hashlib.sha256()
    with open(path, 'rb') as file:
        for block in iter(lambda: file.read(1024 * 1024), b''): h.update(block)
    return h.hexdigest()

def download(destination):
    destination.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory() as tmp:
        archive = Path(tmp) / 'assets.zip'
        with urllib.request.urlopen(URL, timeout=180) as source, archive.open('wb') as output:
            shutil.copyfileobj(source, output)
        if digest(archive) != ARCHIVE_HASH: raise RuntimeError('MHR archive checksum mismatch')
        with zipfile.ZipFile(archive) as bundle:
            for name in ['mhr_model.pt', 'LICENSE.txt']:
                members = [m for m in bundle.namelist() if Path(m).name == name]
                if len(members) != 1: raise RuntimeError('Unexpected MHR archive layout')
                with bundle.open(members[0]) as source, (destination / name).open('wb') as output:
                    shutil.copyfileobj(source, output)
    if digest(destination / 'mhr_model.pt') != MODEL_HASH: raise RuntimeError('MHR model checksum mismatch')

if __name__ == '__main__': download(Path(sys.argv[1]))
