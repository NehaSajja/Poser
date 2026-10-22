"""Single-process, thread-safe daily request allowance, persisted across restarts."""
import json, threading
from datetime import datetime, timezone
from pathlib import Path

def quota_limit(value):
    """Only an explicit 'unlimited' disables a configured call allowance."""
    if value == 'unlimited':return None
    if not isinstance(value,str) or not value.isascii() or not value.isdecimal():
        raise ValueError('Usage limits must be nonnegative integers or unlimited')
    return int(value)

class DailyQuota:
    def __init__(self, path, limit, today=lambda: datetime.now(timezone.utc).date().isoformat(), total_limit=None):
        if limit is not None and (type(limit) is not int or limit < 0):
            raise ValueError('Usage limits must be nonnegative integers')
        if total_limit is not None and (type(total_limit) is not int or total_limit<0):raise ValueError('Invalid total limit')
        self.path=Path(path);self.limit=limit;self.total_limit=total_limit;self.today=today;self.lock=threading.Lock()
        self.path.parent.mkdir(parents=True,exist_ok=True)
        try:
            self.state=json.loads(self.path.read_text())
            datetime.strptime(self.state['day'],'%Y-%m-%d')
            if type(self.state['used']) is not int or self.state['used']<0:raise ValueError('Invalid usage ledger')
            self.state.setdefault('total',self.state['used'])
            if type(self.state['total']) is not int or self.state['total']<self.state['used']:raise ValueError('Invalid total usage ledger')
        except FileNotFoundError:
            self.state={'day':self.today(),'used':0,'total':0}
    def reserve(self):
        with self.lock:
            day=self.today();used=self.state['used'] if self.state['day']==day else 0
            if self.total_limit is not None and self.state['total']>=self.total_limit:raise RuntimeError('The overall demo allowance has been reached. Ask the owner to extend it.')
            if self.limit is not None and used>=self.limit:raise RuntimeError('Today’s demo allowance has been reached. Try again tomorrow.')
            state={'day':day,'used':used+1,'total':self.state['total']+1}
            temporary=self.path.with_suffix('.tmp');temporary.write_text(json.dumps(state));temporary.replace(self.path)
            self.state=state
