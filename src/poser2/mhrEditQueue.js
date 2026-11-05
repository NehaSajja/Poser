// The server comparison and browser preview share one latest-input queue.
// Preview frames never wait for a request; only settled poses enter history.
export function createMhrEditQueue({native,render,committed,error,notice=()=>{},pauseMs=140,
 raf=requestAnimationFrame,caf=cancelAnimationFrame,clock=()=>performance.now()}){
 let sequence=0,epoch=0,sent=-1,local=null,pending=null,running=null,frame=0,timer=0,final=false,disposed=false,last=null;
 const clear=()=>{clearTimeout(timer);timer=0;if(frame)caf(frame);frame=0;local=null;pending=null;last=null;};
 function begin(){sequence++;epoch++;sent=-1;clear();final=false;native.cancelPreview?.();}
 function done(){if(final&&!running&&!pending&&!local&&!disposed){final=false;committed();}}
 async function flush(){
  while(pending&&!disposed){const request=pending;pending=null;const started=clock();native.metric?.({type:'request'});
   try{const packet=await native.evaluate(request.body);native.metric?.({type:'network',ms:clock()-started});
    if(disposed||request.epoch!==epoch||(native.preview&&request.sequence!==sequence)){native.metric?.({type:'stale'});continue;}
    if(native.preview)await native.settle(packet,render);else{native.apply(packet);render();native.metric?.({type:'response-frame',ms:clock()-request.inputAt});}
    if(request.sequence===sequence)notice(request.notice);
   }catch(e){if(!disposed&&request.sequence===sequence){final=false;error(e);}}
  }
  running=null;done();
 }
 function send(request){if(disposed||request.sequence!==sequence||request.sequence===sent)return;sent=request.sequence;pending=request;if(!running)running=flush();}
 function preview(){
  frame=0;if(!local)return;const request=local;local=null;
  try{request.body=native.preview(request.body);render();native.metric?.({type:'input-frame',ms:clock()-request.inputAt});notice(request.notice);last=request;
   clearTimeout(timer);timer=setTimeout(()=>{timer=0;send(request);},pauseMs);
  }catch(e){final=false;error(e);}
 }
 function queue(body,message=''){
  const request={body,notice:message,sequence:++sequence,epoch,inputAt:clock()};pending=null;clearTimeout(timer);timer=0;
  if(native.preview&&!body.shape){local=request;if(!frame)frame=raf(preview);}
  else{last=request;send(request);}
 }
 function flushPreview(){if(frame){caf(frame);frame=0;}if(local)preview();clearTimeout(timer);timer=0;}
 function commit(){final=true;flushPreview();if(last)send(last);else done();}
 async function finish(){flushPreview();if(last)send(last);while(running)await running;}
 return {begin,queue,commit,finish,cancel:begin,dispose(){disposed=true;begin();},get busy(){return Boolean(running||pending||local||timer);}};
}
