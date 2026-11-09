'use client';
import { useState } from 'react';
import type { Board, Point } from '../domain/board.ts';
import { emptyCableLayout, manualCableLength, MAX_CABLES } from '../domain/manual-cables.ts';
import type { CableLayout } from '../domain/manual-cables.ts';

function NumberSetting({label,value,min,max,onChange}:{label:string;value:number;min:number;max:number;onChange:(value:number)=>void}) {
  const [draft,setDraft]=useState(String(value));
  return <label className="signal-number">{label}<input type="number" min={min} max={max} step="0.1" value={draft} onChange={e=>setDraft(e.target.value)} onBlur={()=>{const n=Number(draft);if(draft.trim()&&Number.isFinite(n)&&n>=min&&n<=max)onChange(n);setDraft(String(value));}} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}}/></label>;
}
export function SignalPanel({board,selectedId,onSelect,onAdd,onEdit,onEndpoint,onRemove,onChange,onClose}:{
  board:Board;selectedId:string|null;onSelect:(id:string)=>void;onAdd:()=>void;onEdit:()=>void;
  onEndpoint:(id:string,end:'start'|'end',point:Point)=>void;onRemove:(id:string)=>void;
  onChange:(layout:CableLayout)=>void;onClose:()=>void;
}) {
  const layout=board.cableLayout??emptyCableLayout(), selected=layout.cables.find(c=>c.id===selectedId);
  return <aside className="inspector panel signal-drawer" aria-label="패치 케이블">
    <div className="drawer-heading"><div><span className="eyebrow">PATCH CABLES</span><strong>패치 케이블</strong></div><button className="icon-button" aria-label="패치 케이블 닫기" onClick={onClose}>×</button></div>
    <div className="signal-content"><p className="signal-intro">시작점과 끝점을 직접 놓아 연결하세요.<br/>놓은 끝점을 끌어 선의 위치를 바꿀 수 있어요.</p>
      <button className="button primary full" disabled={layout.cables.length>=MAX_CABLES} onClick={onAdd}>＋ 케이블 추가</button>
      {!layout.cables.length && <p className="signal-empty">추가 버튼 → 시작점 클릭 → 끝점 클릭<br/>Esc로 배치를 취소할 수 있어요.</p>}
      <ol className="manual-cable-list">{layout.cables.map((c,i)=><li key={c.id}><button className={selectedId===c.id?'selected':''} onClick={()=>onSelect(c.id)} aria-pressed={selectedId===c.id}><i style={{background:c.color}}/><span>케이블 {i+1}<small>{c.side==='top'?'상판':'하부'} · 직선 약 {Math.ceil(manualCableLength(c)/10)} cm</small></span></button><button aria-label={`케이블 ${i+1} 삭제`} onClick={()=>onRemove(c.id)}>×</button></li>)}</ol>
      {selected && <div className="manual-cable-details"><button className="button light full" onClick={onEdit}>2D에서 끝점 이동</button>
        <details><summary>끝점 좌표·높이</summary>{(['start','end'] as const).map(end=><fieldset key={end}><legend>{end==='start'?'시작점':'끝점'} · mm</legend>{(['xMm','yMm','heightMm'] as const).map(axis=><NumberSetting key={`${selected.id}-${end}-${axis}-${selected[end][axis]}`} label={axis==='xMm'?'X':axis==='yMm'?'Y':'높이'} value={selected[end][axis]} min={axis==='heightMm'?0:-5000} max={axis==='heightMm'?500:5000} onChange={value=>{if(axis==='heightMm')onChange({...layout,cables:layout.cables.map(c=>c.id===selected.id?{...c,[end]:{...c[end],heightMm:value}}:c)});else onEndpoint(selected.id,end,{xMm:selected[end].xMm,yMm:selected[end].yMm,[axis]:value});}}/>)}</fieldset>)}</details>
        {manualCableLength(selected)<layout.plugLengthMm*2 && <p className="signal-warning">플러그 두 개가 겹칠 수 있어요. 끝점 간격을 늘려 주세요.</p>}
      </div>}
      <details className="signal-settings"><summary>플러그·케이블 규격</summary><p>바깥 플러그의 최대 두께와 길이예요. 실제 제품 치수에 맞춰 조정해 주세요.</p>{(['plugWidthMm','plugLengthMm','cableDiameterMm'] as const).map((key,i)=><NumberSetting key={`${key}-${layout[key]}`} label={['플러그 두께 (mm)','플러그 길이 (mm)','케이블 굵기 (mm)'][i]} value={layout[key]} min={[4,5,1][i]} max={[40,60,12][i]} onChange={value=>onChange({...layout,[key]:value})}/>)}</details>
      <label className="signal-visible"><input type="checkbox" checked={layout.visible} onChange={e=>onChange({...layout,visible:e.target.checked})}/>케이블 표시</label>
      <p className="signal-note">끝점은 보드 좌표에 고정됩니다. 페달을 옮겨도 끝점은 그대로예요. 배치는 2D에서 편집하고 3D에서도 확인할 수 있어요. 표시 길이는 두 점 사이 거리이며 실제 구매 길이는 여유가 필요합니다.</p>
    </div>
  </aside>;
}
