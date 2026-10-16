import type { Blueprint } from './entities/blueprint';
export const SYMBOL_KINDS = ['chair','table','sofa','bed','plant','stair','vehicle'] as const;
export type SymbolKind = typeof SYMBOL_KINDS[number];
export const SYMBOL_LABELS: Record<SymbolKind,string> = {chair:'Silla',table:'Mesa',sofa:'Sofá',bed:'Cama',plant:'Planta',stair:'Escalera',vehicle:'Coche'};
export interface SymbolDetection {
  id:string; kind:SymbolKind; score:number; box:[number,number,number,number];
  status:'proposed'|'confirmed'|'rejected'; rotation:0|90|180|270; stairType?:'straight'|'spiral';
}
export interface SymbolProposal {
  model:{id:string;revision:string;checkpointSha256:string;artifactSha256:string;usage:string;size:number;classes:string[];
    training?:{datasetSha256:string;images:number;epochs:number;annotationQuality:string;independentValidation:boolean}};
  threshold:number;passes:number;elapsedMs:number;items:SymbolDetection[];
}
const CLASSES='bath bath_tub bay_window bed bedside_cupboard blind_window chair class_31 class_32 class_34 class_35 double_door elevator escalator gas_stove half_height_cabinet high_cabinet opening_symbol parking railing refrigerator single_door sink sliding_door sofa squat_toilet stair table toilet tv_cabinet urinal wall wardrobe washing_machine window';
export function validSymbols(value:unknown,size:{width:number;height:number}):value is SymbolProposal|undefined {
  if(value===undefined)return true;
  if(!value||typeof value!=='object')return false;
  const s=value as SymbolProposal,m=s.model;
  if(!m)return false;
  const known=m.id==='floorcad-symbols-v1'&&m.revision==='02995225d7aed598bc7e0214f5b7f3fe7fe95657'&&m.checkpointSha256==='be1a5a404c5ad1c454ba7531e2c16548a6330945319cbf989751ff73578b494c'&&m.classes?.join(' ')===CLASSES;
  const pilot=['ark-objects-pilot-v1','ark-objects-pilot-v2'].includes(m.id)&&/^[a-f0-9]{40}$/.test(m.revision)&&/^[a-f0-9]{64}$/.test(m.checkpointSha256)&&
    m.classes?.join(',')===(m.id==='ark-objects-pilot-v2'?'chair,table,sofa,bed,plant,stair,vehicle':'chair,table,sofa,bed,plant,stair')&&m.training?.independentValidation===false&&m.training.annotationQuality==='agent-provisional'&&
    /^[a-f0-9]{64}$/.test(m.training.datasetSha256)&&Number.isInteger(m.training.images)&&m.training.images>0&&m.training.images<=10000&&Number.isInteger(m.training.epochs)&&m.training.epochs>=1&&m.training.epochs<=1000;
  if((!known&&!pilot)||!Array.isArray(m.classes)||!/^[a-f0-9]{64}$/.test(m.artifactSha256)||m.usage!=='experimental-research'||m.size!==640||
    s.threshold!==.35||!Number.isInteger(s.passes)||s.passes<1||s.passes>10||
    !Number.isFinite(s.elapsedMs)||s.elapsedMs<0||s.elapsedMs>90000||!Array.isArray(s.items)||s.items.length>300)return false;
  const ids=new Set<string>();
  return s.items.every(i=>{
    if(!i||!/^symbol-\d+$/.test(i.id)||ids.has(i.id)||!SYMBOL_KINDS.includes(i.kind)||!m.classes.includes(i.kind)||!Number.isFinite(i.score)||i.score<s.threshold||i.score>1||
      !Array.isArray(i.box)||i.box.length!==4||!i.box.every(Number.isFinite)||i.box[0]<0||i.box[1]<0||i.box[2]<=i.box[0]||i.box[3]<=i.box[1]||i.box[2]>size.width||i.box[3]>size.height||
      !['proposed','confirmed','rejected'].includes(i.status)||![0,90,180,270].includes(i.rotation)||
      (i.stairType!==undefined&&(i.kind!=='stair'||!['straight','spiral'].includes(i.stairType))))return false;
    ids.add(i.id);return true;
  });
}
/** Only reviewed detections become families. No object is added from room names. */
export function symbolGeometry(proposal:SymbolProposal|undefined,levelId:string,rise:number) {
  const fixtures:NonNullable<Blueprint['fixtures']>=[],stairs:NonNullable<Blueprint['stairs']>=[];
  for(const i of proposal?.items??[]) {
    if(i.status!=='confirmed')continue;
    const [x1,y1,x2,y2]=i.box,x=(x1+x2)/2,y=(y1+y2)/2;
    const turned=i.rotation===90||i.rotation===270;
    const width=turned?y2-y1:x2-x1,depth=turned?x2-x1:y2-y1;
    if(i.kind==='stair') {
      // Stair subtype and orientation must be confirmed; a class box cannot reveal tread geometry.
      if(!i.stairType)continue;
      stairs.push({id:`neural-${i.id}`,levelId,x,y,type:i.stairType,radius:(i.stairType==='spiral'?Math.min(width,depth):width)/2,length:depth,rotation:i.rotation,rise});
    }else {
      fixtures.push({id:`neural-${i.id}`,levelId,x,y,width,depth,rotation:i.rotation,kind:i.kind,
        height:{chair:.85,table:.75,sofa:.85,bed:.55,plant:1.0,vehicle:1.5}[i.kind],name:`${SYMBOL_LABELS[i.kind]} · IA revisada`,evidence:'neural-box',sourceIds:[i.id]});
    }
  }
  return {fixtures,stairs};
}
export function overlapsSymbol(polygon:Array<[number,number]>,symbols:SymbolProposal|undefined) {
  const xs=polygon.map(p=>p[0]),ys=polygon.map(p=>p[1]);
  const a=[Math.min(...xs),Math.min(...ys),Math.max(...xs),Math.max(...ys)];
  return symbols?.items.some(i=>{
    if(i.status!=='confirmed')return false;
    const b=i.box,area=Math.max(0,Math.min(a[2],b[2])-Math.max(a[0],b[0]))*Math.max(0,Math.min(a[3],b[3])-Math.max(a[1],b[1]));
    return area/Math.min((a[2]-a[0])*(a[3]-a[1]),(b[2]-b[0])*(b[3]-b[1]))>.5;
  })??false;
}

/** Resolve against the exact source sheet; symbol IDs repeat on different pages. */
export function symbolForFixture(plan:Blueprint,fixture:NonNullable<Blueprint['fixtures']>[number]) {
  if(fixture.evidence!=='neural-box'||!fixture.sheetId)return undefined;
  const sheet=plan.sheets?.find(s=>s.id===fixture.sheetId&&s.levelId===fixture.levelId);
  const item=sheet?.neural?.symbols?.items.find(i=>fixture.sourceIds?.includes(i.id)&&i.kind===fixture.kind&&i.status==='confirmed');
  return item&&sheet?{sheet,item}:undefined;
}
