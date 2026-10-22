"""Single-process, thread-safe daily request allowance, persisted across restarts."""
import json, threading
from datetime import datetime, timezone
from pathlib import Path

class DailyQuota:
    def __init__(self, path, limit, today=lambda: datetime.now(timezone.utc).date().isoformat()):
        if not isinstance(limit, int) or limit < 0:
            raise ValueError('Usage limits must be nonnegative integers')
        self.path=Path(path);self.limit=limit;self.today=today;self.lock=threading.Lock()
        self.path.parent.mkdir(parents=True,exist_ok=True)
        try:
            self.state=json.loads(self.path.read_text())
            datetime.strptime(self.state['day'],'%Y-%m-%d')
            if type(self.state['used']) is not int or self.state['used']<0:raise ValueError('Invalid usage ledger')
        except FileNotFoundError:
            self.state={'day':self.today(),'used':0}
    def reserve(self):
        with self.lock:
            day=self.today();used=self.state['used'] if self.state['day']==day else 0
            if used>=self.limit:raise RuntimeError('Today’s demo allowance has been reached. Try again tomorrow.')
            state={'day':day,'used':used+1}
            temporary=self.path.with_suffix('.tmp');temporary.write_text(json.dumps(state));temporary.replace(self.path)
            self.state=state
