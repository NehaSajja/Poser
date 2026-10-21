"""Loopback-only reference service and playground, shared with the Poser application."""
from http.server import ThreadingHTTPServer,BaseHTTPRequestHandler
from urllib.parse import urlparse,parse_qs
import json,threading,uuid,traceback
from pathlib import Path
import search
from concurrent.futures import ThreadPoolExecutor
JOBS={};JOBS_LOCK=threading.Lock()
WORKERS=ThreadPoolExecutor(max_workers=4)
FEATURED=['1010','1176','1321','1351','201','1343','2273','2599','2933']
class Handler(BaseHTTPRequestHandler):
    def send(self,data,status=200,mime='application/json'):
        if mime=='application/json':data=json.dumps(data).encode()
        self.send_response(status);self.send_header('Content-Type',mime);self.send_header('Content-Length',str(len(data)));self.send_header('Cache-Control','no-store');self.end_headers();self.wfile.write(data)
    def do_GET(self):
        url=urlparse(self.path);q=parse_qs(url.query)
        try:
            if url.path=='/':return self.send(Path(__file__).with_name('index.html').read_bytes(),mime='text/html; charset=utf-8')
            if url.path in ['/font/regular','/font/bold']:
                weight='Regular' if url.path.endswith('regular') else 'Bold'
                return self.send((search.APP/'public/fonts/gt-maru'/f'GTMaru{weight}.ttf').read_bytes(),mime='font/ttf')
            if url.path=='/api/poses':return self.send({'featured':FEATURED,'poses':[{'id':p['id'],'name':p['name'],'description':p.get('description','')} for p in search.CATALOG.values()]})
            if url.path=='/api/status':return self.send({'vectors':len(list(search.DATA.glob('*.npz'))),'metadata':len(list(search.DATA.glob('meta-*.json'))),'model':(search.APP/'.local/met-art/mobileclip-s1.safetensors').exists()})
            if url.path.startswith('/pose/'):
                key=url.path.split('/')[-1];pose,view=key.rsplit('-',1)
                if pose not in search.CATALOG or view not in ['authored','front']:raise ValueError('Unknown pose')
                return self.send((search.POSES/'gallery'/f'{key}.png').read_bytes(),mime='image/png')
            if url.path.startswith('/api/job/'):
                job=JOBS.get(url.path.split('/')[-1]);return self.send(job or {'error':'Unknown job'},200 if job else 404)
            return self.send({'error':'Not found'},404)
        except Exception as e:self.send({'error':str(e)},400)
    def do_POST(self):
        if self.headers.get('Origin') not in [None,'http://127.0.0.1:4318','http://localhost:4318']:return self.send({'error':'Invalid origin'},403)
        if self.path!='/api/search':return self.send({'error':'Not found'},404)
        try:
            size=int(self.headers.get('Content-Length',0))
            if size>4096:raise ValueError('Request too large')
            args=json.loads(self.rfile.read(size));pose=str(args['pose']);view=args.get('view','authored');mode=args.get('mode','hybrid')
            if pose not in search.CATALOG or view not in ['authored','front'] or mode not in ['hybrid','image','text']:raise ValueError('Invalid query')
            with JOBS_LOCK:
                query=(pose,view,mode)
                existing=next((key for key,value in JOBS.items() if value.get('query')==query and (value['status'] in ('queued','running') or value['status']=='done' and not value['result'].get('warning'))),None)
                if existing:return self.send({'id':existing})
                # Cached poses stay available even while another pose is being compared.
                cached=search.cached_result(pose,view,mode)
                active=sum(value['status'] in ('queued','running') for value in JOBS.values())
                if active>=12 and cached is None:return self.send({'error':'Reference queue is full. Try shortly.'},409)
                for old in list(JOBS):
                    if len(JOBS)<32:break
                    if JOBS[old]['status'] not in ('queued','running'):JOBS.pop(old)
                id=uuid.uuid4().hex
                if cached is not None:
                    JOBS[id]={'status':'done','query':query,'result':{**cached,'cached':True}}
                    return self.send({'id':id})
                JOBS[id]={'status':'queued','query':query,'message':'Preparing references'}
            def run():
                try:
                    JOBS[id].update(status='running')
                    result=search.search(pose,view,mode,lambda msg:JOBS[id].update(message=msg));JOBS[id]={'status':'done','query':query,'result':result}
                except Exception as e:
                    traceback.print_exc();JOBS[id]={'status':'error','error':str(e)}
            WORKERS.submit(run);return self.send({'id':id})
        except Exception as e:return self.send({'error':str(e)},400)
if __name__=='__main__':
    print('Met pose playground: http://127.0.0.1:4318',flush=True)
    ThreadingHTTPServer(('127.0.0.1',4318),Handler).serve_forever()
