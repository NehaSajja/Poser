export const POSE_KEYS=['head','neck','pelvis','l_shoulder','r_shoulder','l_elbow','r_elbow','l_wrist','r_wrist','l_hip','r_hip','l_knee','r_knee','l_ankle','r_ankle'] as const;
export type PoseKey=typeof POSE_KEYS[number];
export type Joint=[number,number,number];
export type PoseJoints=Partial<Record<PoseKey,Joint>>;
export type PoseGeometry={joints:PoseJoints;aspect:number};
export type PoseComparison={score:number;coverage:number;mirrored:boolean;parts:{arms:number|null;legs:number|null;torso:number|null};compared:number;total:number};
export const POSE_SEGMENTS:[PoseKey,PoseKey][]=[['head','neck'],['neck','pelvis'],['l_shoulder','r_shoulder'],['l_hip','r_hip'],['l_shoulder','l_elbow'],['l_elbow','l_wrist'],['r_shoulder','r_elbow'],['r_elbow','r_wrist'],['l_hip','l_knee'],['l_knee','l_ankle'],['r_hip','r_knee'],['r_knee','r_ankle']];
export function validJoints(value:unknown):PoseJoints{
  const result:PoseJoints={};if(!value||typeof value!=='object')return result;
  for(const key of POSE_KEYS){const v=(value as Record<string,unknown>)[key];if(Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=1))result[key]=v as Joint;}
  return result;
}
const groups={torso:POSE_SEGMENTS.slice(0,4),arms:POSE_SEGMENTS.slice(4,8),legs:POSE_SEGMENTS.slice(8,12)};
function geometryScore(ref:PoseGeometry,art:PoseGeometry,mirrored:boolean):PoseComparison{
  const parts={arms:null,legs:null,torso:null} as PoseComparison['parts'];let compared=0;let quality=0;
  for(const [part,segments] of Object.entries(groups)){
    let sum=0,weight=0;
    for(const [a,b] of segments){const p=ref.joints[a],q=ref.joints[b],r=art.joints[a],s=art.joints[b];if(!p||!q||!r||!s)continue;const confidence=Math.min(p[2],q[2],r[2],s[2]);if(confidence<.35)continue;
      const u=[(q[0]-p[0])*ref.aspect,q[1]-p[1]],v=[(s[0]-r[0])*art.aspect*(mirrored?-1:1),s[1]-r[1]];const length=Math.hypot(...u)*Math.hypot(...v);if(length<1e-7)continue;
      const angle=Math.acos(Math.max(-1,Math.min(1,(u[0]*v[0]+u[1]*v[1])/length)));
      const score=100*Math.exp(-Math.pow(angle/.8,2));sum+=score*confidence;weight+=confidence;compared++;quality+=confidence;
    }
    if(weight>0)parts[part as keyof typeof parts]=Math.round(sum/weight);
  }
  const coverage=quality/POSE_SEGMENTS.length;let sum=0,weight=0;
  for(const [name,w] of [['arms',.35],['legs',.4],['torso',.25]] as const)if(parts[name]!==null){sum+=parts[name]!*w;weight+=w;}
  // Occluded or missing limbs reduce confidence in the overall match; they never become invented evidence.
  let score=weight?sum*(.65+.35*coverage):0;if(compared<6)score=Math.min(score,55);
  return {score:Math.round(score),coverage:Math.round(coverage*100),mirrored,parts,compared,total:POSE_SEGMENTS.length};
}
export function comparePose(ref:PoseGeometry,art:PoseGeometry):PoseComparison{
  const direct=geometryScore(ref,art,false),mirror=geometryScore(ref,art,true);
  const swapped:PoseGeometry={aspect:art.aspect,joints:{}};for(const key of POSE_KEYS){const source=key.startsWith('l_')?key.replace('l_','r_'):key.startsWith('r_')?key.replace('r_','l_'):key;swapped.joints[key]=art.joints[source as PoseKey];}
  const opposite=geometryScore(ref,swapped,true);const best=opposite.score>mirror.score?opposite:mirror;
  return best.score>direct.score+7?best:direct;
}
export function samPose(metadata:{keypoint_names:string[];people:{keypoints_2d:number[][]}[]},width:number,height:number):PoseGeometry{
  const source=metadata.people[0]?.keypoints_2d||[];const byName=Object.fromEntries(metadata.keypoint_names.map((name,i)=>[name,source[i]]));const joints:PoseJoints={};
  for(const key of POSE_KEYS){const name=key==='head'?'nose':key.replace(/^l_/,'left-').replace(/^r_/,'right-');const p=byName[name];if(p?.length>=2)joints[key]=[Math.max(0,Math.min(1,p[0]/width)),Math.max(0,Math.min(1,p[1]/height)),1];}
  if(joints.l_hip&&joints.r_hip)joints.pelvis=[(joints.l_hip[0]+joints.r_hip[0])/2,(joints.l_hip[1]+joints.r_hip[1])/2,1];
  return {joints,aspect:width/height};
}
