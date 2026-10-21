// One Ncode unit = 56 / 600 inch (Neo NoteServer.ts). At 96 logical px/in:
export const NCODE_SCALE = 8.96;
const POINTER_ID = 9234;
export function paperKey(dot) {
  const p = dot.pageInfo || dot;
  return [p.section ?? 0,p.owner ?? 0,p.book ?? p.note ?? 0,p.page ?? 0].join('/');
}

// Normal pointer dispatch preserves tldraw's native ink, undo, and application hooks.
// The first pen point anchors to the canvas center; subsequent strokes keep their
// paper-relative coordinates. Re-anchor when moving to a different working area.
export function createPenInput(editor) {
  let active = null, pending = null, anchor = null, maxForce = null, timer = null;
  function dispatch(name, point) {
    const screen = editor.pageToScreen(point);
    editor.dispatch({type:'pointer',target:'canvas',name,pointerId:POINTER_ID,
      button:0,isPen:true,isPenDirect:false,point:{...screen,z:point.z},
      shiftKey:false,altKey:false,ctrlKey:false,metaKey:false,accelKey:false});
  }
  function finish() {
    clearTimeout(timer);
    pending = null;
    if (!active) return;
    // Don't finish a stroke on a different canvas after navigation.
    if (active.canvas === editor.getCurrentPageId()) dispatch('pointer_up',active.last);
    else editor.cancel();
    active = null;
  }
  return {
    setMaxForce(value) { maxForce = Number.isFinite(value) && value > 0 ? value : null; },
    reanchor() { finish(); anchor = null; },
    finish,
    dot(dot) {
      const type = dot.dotType ?? dot.DotType;
      if (type === 2 || type === 5) { finish(); return; }
      if (type !== 0 && type !== 1) return;
      const canvas = editor.getCurrentPageId();
      const paper = paperKey(dot);
      const positioned = Number.isFinite(dot.x) && Number.isFinite(dot.y) && dot.x >= 0 && dot.y >= 0;
      if (type === 0) {
        finish();
        if (editor.getInstanceState().isReadonly || editor.inputs.getIsPointing()) return;
        // NewPenDown is a contact event, not a coordinate: the SDK emits (-1,-1),
        // then PEN_INFO, then positioned MOVE samples. Older formats may include
        // a position on DOWN. Both paths start ink at the first positioned sample.
        const contactOnly = dot.x === -1 && dot.y === -1;
        if (!positioned && !contactOnly) return;
        pending = {canvas};
        timer = setTimeout(finish,3000);
      }
      if (active && (active.paper !== paper || active.canvas !== canvas)) { finish(); return; }
      if (pending && pending.canvas !== canvas) { finish(); return; }
      if (editor.getInstanceState().isReadonly) { finish(); return; }
      if (!positioned) return;
      if (!active) {
        // A MOVE may begin ink only after contact. Never take over a mouse drag.
        if (!pending) return;
        if (editor.inputs.getIsPointing()) { finish(); return; }
        pending = null;
        if (!anchor || anchor.paper !== paper || anchor.canvas !== canvas) {
          const center = editor.getViewportPageBounds().center;
          anchor = {paper,canvas,x:dot.x,y:dot.y,cx:center.x,cy:center.y};
        }
        editor.setCurrentTool('draw');
        editor.focus();
      }
      const point = {x:anchor.cx+(dot.x-anchor.x)*NCODE_SCALE,
        y:anchor.cy+(dot.y-anchor.y)*NCODE_SCALE,
        z:maxForce && Number.isFinite(dot.f) ? Math.max(0,Math.min(1,dot.f/maxForce)) : .5};
      if (!active) { active = {paper,canvas,last:point}; dispatch('pointer_down',point); }
      else { active.last = point; dispatch('pointer_move',point); }
      clearTimeout(timer);
      timer = setTimeout(finish,3000); // recover a missing UP/disconnection
    },
  };
}
