// Small provisional loops can be thumbs or a dropdown end-cap. This only offers
// a grouping hypothesis; the model still decides whether it forms one control.
export function controlDetail(outer,inner){
 return ['container','unknown'].includes(inner.kind)&&!inner.committedKind&&
  outer.w>=outer.h*1.3&&outer.h<=160&&inner.w<outer.w*.6&&inner.w<=outer.h*1.3&&inner.h<=outer.h*1.05&&
  inner.x>=outer.x-12&&inner.y>=outer.y-12&&inner.x+inner.w<=outer.x+outer.w+12&&inner.y+inner.h<=outer.y+outer.h+12;
}
