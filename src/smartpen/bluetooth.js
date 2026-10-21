// Protocol/parser source: https://github.com/NeoSmartpen/WEB-SDK2.0
// The SDK is lazy-loaded after the native chooser to preserve user activation.
const SERVICE = '4f99f138-9d53-5bfa-9e50-b147491afe68';
const NOTIFY = '64cd86b1-2256-5aeb-9f04-2caf6c60ae57';
const WRITE = '8bc8cc7d-88ca-56b0-af9a-9bf514d0d61a';

export async function connectPen({onDot,onMessage,onClose}, signal) {
  if (!navigator.bluetooth) throw new Error('Open this app in desktop Chrome or Edge to connect a smartpen.');
  const device = await navigator.bluetooth.requestDevice({
    filters:[{services:[0x19f1]},{services:[SERVICE]}], optionalServices:[0x19f1,SERVICE],
  });
  let controller, notify, writer, closed=false, writes=Promise.resolve(), handshake;
  const close = () => {
    if (closed) return;
    closed=true; clearTimeout(handshake);
    signal?.removeEventListener('abort',close);
    notify?.removeEventListener('characteristicvaluechanged',received);
    device.removeEventListener('gattserverdisconnected',close);
    if (device.gatt?.connected) device.gatt.disconnect();
    onClose();
  };
  function received(event) {
    if (closed) return;
    const view=event.target.value;
    try { controller.putData(Array.from(new Uint8Array(view.buffer,view.byteOffset,view.byteLength))); }
    catch (error) { onMessage('error','Could not decode a pen packet: '+error.message); close(); }
  }
  const check = () => { if (closed || signal?.aborted) { device.gatt?.disconnect(); throw new Error('Connection cancelled.'); } };
  signal?.addEventListener('abort',close,{once:true});
  try {
    check();
    const {PenController,PenMessageType} = await import('web_pen_sdk');
    check();
    const server = await device.gatt.connect();
    check();
    let service;
    try { service=await server.getPrimaryService(SERVICE); }
    catch { service=await server.getPrimaryService(0x19f1); }
    const modern = service.uuid===SERVICE;
    notify=await service.getCharacteristic(modern?NOTIFY:0x2ba1);
    writer=await service.getCharacteristic(modern?WRITE:0x2ba0);
    check();
    controller=new PenController(); controller.device=device;
    controller.addCallback((_pen,dot)=>onDot(dot),(_pen,type,args)=>{
      if (closed) return;
      if (type===PenMessageType.PEN_CONNECTION_SUCCESS) onMessage('identity',controller.info);
      if (type===PenMessageType.PEN_SETTING_INFO) onMessage('settings',args);
      if (type===PenMessageType.PEN_AUTHORIZED) {
        controller.RequestAvailableNotes();
      }
      if (type===PenMessageType.PEN_USING_NOTE_SET_RESULT) {
        clearTimeout(handshake);
        if (args?.Result === false || args?.result === false) {
          onMessage('error','The pen rejected live note input.'); close();
        } else onMessage('ready',null);
      }
      if (type===PenMessageType.PEN_PASSWORD_REQUEST) {
        onMessage('error','This pen is password protected. Unlock it in your Neo app, then reconnect.'); close();
      }
      if (type===PenMessageType.EVENT_POWER_OFF) close();
    });
    controller.addWrite(data=>{
      // GATT writes cannot overlap. Install the writer before starting the handshake.
      writes=writes.then(async()=>{
        if (closed) return;
        const bytes=new Uint8Array(data);
        if (writer.properties.write) await writer.writeValueWithResponse(bytes);
        else await writer.writeValueWithoutResponse(bytes);
      }).catch(error=>{onMessage('error','Bluetooth write failed: '+error.message);close();});
    });
    notify.addEventListener('characteristicvaluechanged',received);
    device.addEventListener('gattserverdisconnected',close);
    await notify.startNotifications(); check();
    onMessage('connecting',device.name||'Neo smartpen');
    handshake=setTimeout(()=>{onMessage('error','The pen did not finish its handshake. Disconnect USB, close Neo Studio, and try again.');close();},12000);
    controller.OnConnected();
    return {disconnect:close};
  } catch (error) { close(); throw error; }
}
