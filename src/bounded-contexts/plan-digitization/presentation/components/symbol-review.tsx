"use client";
import {useMemo} from 'react';
import {SYMBOL_LABELS,type SymbolProposal,type SymbolDetection} from '../../domain/symbol-detection';

export function SymbolReview({value,canvas,onChange,disabled}:{value:SymbolProposal;canvas:HTMLCanvasElement;onChange:(value:SymbolProposal)=>void;disabled:boolean}) {
  const previews=useMemo(()=>value.items.map(item=>{
    const [x1,y1,x2,y2]=item.box,pad=Math.max(x2-x1,y2-y1)*.2;
    const left=Math.max(0,x1-pad),top=Math.max(0,y1-pad),right=Math.min(canvas.width,x2+pad),bottom=Math.min(canvas.height,y2+pad);
    const image=document.createElement('canvas');image.width=160;image.height=120;
    const ctx=image.getContext('2d');
    if(!ctx)return '';
    ctx.fillStyle='#fff';ctx.fillRect(0,0,160,120);
    const scale=Math.min(160/(right-left),120/(bottom-top)),w=(right-left)*scale,h=(bottom-top)*scale;
    ctx.drawImage(canvas,left,top,right-left,bottom-top,(160-w)/2,(120-h)/2,w,h);
    ctx.strokeStyle='#b22a84';ctx.lineWidth=2;
    ctx.strokeRect((160-w)/2+(x1-left)*scale,(120-h)/2+(y1-top)*scale,(x2-x1)*scale,(y2-y1)*scale);
    return image.toDataURL('image/png');
  }),[canvas,value.items]);
  function update(id:string,patch:Partial<SymbolDetection>) {
    onChange({...value,items:value.items.map(i=>i.id===id?{...i,...patch}:i)});
  }
  return <section className="symbol-review" aria-label="Revisión de mobiliario detectado">
    <h4>Mobiliario: del símbolo a la familia 3D</h4>
    <p>{value.items.length} propuestas · {value.items.filter(i=>i.status==='confirmed').length} confirmadas. Comprueba el recorte antes de incluirlo. La puntuación de la red no certifica que sea correcto.</p>
    <p>Las alturas son aproximadas. Ajusta la orientación; para una escalera también debes indicar su tipo. {!value.model.classes.includes('plant')&&'Las plantas no están soportadas por estos pesos.'}</p>
    {value.model.training&&<p>Modelo entrenado con {value.model.training.images} imágenes y recortes de tus fuentes, durante {value.model.training.epochs} épocas. Etiquetado provisional; evaluación arquitectónica independiente pendiente. Una detección sobre una imagen usada para entrenar no mide generalización.</p>}
    {!value.items.length&&<p role="status">No se encontraron muebles por encima del umbral. Esto no significa que el plano no los contenga.</p>}
    <div className="symbol-review-grid">
      {value.items.map((item,index)=><fieldset key={item.id} disabled={disabled} className="symbol-review-card">
        <legend>#{index+1} · {SYMBOL_LABELS[item.kind]} · {Math.round(item.score*100)}%</legend>
        <svg viewBox="0 0 160 120" role="img" aria-label={`Recorte de la propuesta ${index+1}: ${SYMBOL_LABELS[item.kind]}`}><image href={previews[index]} width="160" height="120"/></svg>
        <label>Orientación<select aria-label={`Orientación de propuesta ${index+1}`} value={item.rotation} onChange={e=>update(item.id,{rotation:Number(e.target.value) as SymbolDetection['rotation']})}>{[0,90,180,270].map(n=><option key={n} value={n}>{n}°</option>)}</select></label>
        {item.kind==='stair'&&<label>Tipo de escalera<select aria-label={`Tipo de escalera ${index+1}`} value={item.stairType??''} onChange={e=>update(item.id,{stairType:(e.target.value||undefined) as SymbolDetection['stairType'],status:'proposed'})}><option value="">Selecciona según el plano</option><option value="straight">Recta (aproximación)</option><option value="spiral">Caracol (aproximación)</option></select></label>}
        <label>Pasar al modelo<select aria-label={`Decisión sobre propuesta ${index+1}`} value={item.status} onChange={e=>update(item.id,{status:e.target.value as SymbolDetection['status']})}>
          <option value="proposed">Pendiente · no incluir</option><option value="confirmed" disabled={item.kind==='stair'&&!item.stairType}>Confirmar e incluir en 3D</option><option value="rejected">Descartar</option>
        </select></label>
      </fieldset>)}
    </div>
  </section>;
}
