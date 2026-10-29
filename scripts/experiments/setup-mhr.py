"""Install only the optional local MHR experiment. No application API keys used.
Requires uv, or Python 3.12 available as python3.12. Downloads ~190MB; the
TorchScript model occupies ~665MB plus the isolated Python dependencies.
"""
from pathlib import Path
import hashlib
import os
import shutil
import subprocess
import urllib.request
import zipfile

ROOT=Path(__file__).resolve().parents[2]
LOCAL=ROOT/'.local'
ENV=LOCAL/'mhr-env'
ASSETS=LOCAL/'mhr/assets'
URL='https://github.com/facebookresearch/MHR/releases/download/v1.0.1/assets.zip'
ARCHIVE_HASH='e4f4f205cd87c0fa106577ba1de4fc763e4eb197c924461d2ef7e6944e9d6b94'
MODEL_HASH='352e271a6c42729c68554ceaea0c955e866970160c31e35506d782dc0f7377bc'

def digest(path):
 h=hashlib.sha256()
 with open(path,'rb') as f:
  for chunk in iter(lambda:f.read(1024*1024),b''):h.update(chunk)
 return h.hexdigest()

LOCAL.mkdir(exist_ok=True);ASSETS.mkdir(parents=True,exist_ok=True)
python=ENV/'bin/python'
uv=shutil.which('uv')
env={**os.environ,'UV_CACHE_DIR':str(LOCAL/'uv-cache')}
if not python.exists():
 if uv:subprocess.run([uv,'venv','--python','3.12',str(ENV)],env=env,check=True)
 else:subprocess.run(['python3.12','-m','venv',str(ENV)],check=True)
requirements=str(ROOT/'server/experiments/requirements-mhr.txt')
command=[uv,'pip','install','--python',str(python),'-r',requirements] if uv else [str(python),'-m','pip','install','-r',requirements]
subprocess.run(command,env=env,check=True)
model=ASSETS/'mhr_model.pt'
if not model.exists() or digest(model)!=MODEL_HASH:
 archive=LOCAL/'mhr-assets.zip'
 if not archive.exists() or digest(archive)!=ARCHIVE_HASH:
  print('Downloading official MHR v1.0.1 assets…',flush=True)
  temp=LOCAL/'mhr-assets.download'
  with urllib.request.urlopen(URL) as response,open(temp,'wb') as output:shutil.copyfileobj(response,output)
  if digest(temp)!=ARCHIVE_HASH:raise RuntimeError('Official archive checksum did not match')
  temp.replace(archive)
 with zipfile.ZipFile(archive) as z:
  for basename in ['mhr_model.pt','LICENSE.txt']:
   matches=[n for n in z.namelist() if Path(n).name==basename]
   if len(matches)!=1:raise RuntimeError('Unexpected release archive layout')
   with z.open(matches[0]) as source,open(ASSETS/basename,'wb') as output:shutil.copyfileobj(source,output)
if digest(model)!=MODEL_HASH:raise RuntimeError('Model checksum did not match')
print('Ready. Run npm run dev:mhr and npm run dev:upper-body in separate terminals.')
