import { Icon } from './icons';
import { Button } from './components/ui/button';
import { Input } from './components/ui/input';
import { Card } from './components/ui/card';
import { Checkbox } from './components/ui/checkbox';
import { Switch } from './components/ui/switch';
import { RadioGroup, RadioGroupItem } from './components/ui/radio-group';
import { Select, SelectTrigger, SelectValue } from './components/ui/select';
import { Label } from './components/ui/label';
import { Separator } from './components/ui/separator';
import { getControlSize } from './componentSizes';
export function Component({element,id}) {
 const {kind,text,showInk,outline} = element;
 const size = getControlSize(kind, element.h);
 const props={className:`component ${kind}`, tabIndex:-1, id};
 if(showInk && !outline) return null;
 if(kind==='button') return <Button {...props} size={size.buttonSize} data-control-size={size.name}>{text||'Button'}<Icon name="arrow"/></Button>;
 if(kind==='input') return <Input {...props} className={`${props.className} ${size.inputClass} text-sm`} data-control-size={size.name} aria-label="Input component" readOnly value="" placeholder={text||'Input'}/>;
 if(kind==='checkbox') return <Checkbox {...props} aria-label="Checkbox component" checked={element.checked??true}/>;
 if(kind==='switch') return <Switch {...props} aria-label="Switch component" checked={element.checked??true}/>;
 if(kind==='radio') return <RadioGroup {...props} value={element.checked===false?'':'selected'} aria-label="Radio component"><RadioGroupItem value="selected" tabIndex={-1} aria-label="Radio option"/></RadioGroup>;
 if(kind==='select') return <Select open={false}><SelectTrigger {...props} aria-label="Select component"><SelectValue placeholder="Select"/></SelectTrigger></Select>;
 if(kind==='container') return <Card {...props}/>;
 if(kind==='text') return <Label {...props}>{text||'Label'}</Label>;
 if(kind==='separator') return <Separator {...props}/>;
 return null;
}
export function SketchMarks({element}) {
 if(!element.showInk) return null;
 const strokes=element.outline?element.strokes?.slice(element.outlineStrokeCount??1):element.strokes;
 return <svg className="retained-ink" width="100%" height="100%">{strokes?.map((stroke,i)=><polyline key={i} points={stroke.map(p=>`${p.x*element.w},${p.y*element.h}`).join(' ')} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>)}</svg>;
}
