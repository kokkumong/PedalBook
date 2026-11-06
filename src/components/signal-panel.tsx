'use client';

import { useMemo, useState } from 'react';
import type { Board } from '../domain/board.ts';
import { emptySignal, signalNode } from '../domain/signal-config.ts';
import type { SignalChain, SignalPort } from '../domain/signal-config.ts';
import { patchCables } from '../domain/signal-chain.ts';

const edgeNames = { left: '왼쪽', right: '오른쪽', top: '위쪽', bottom: '아래쪽' };
function NumberSetting({ label, value, min, max, onChange }: { label: string; value: number; min: number; max: number; onChange: (value: number) => void }) {
  const [draft,setDraft]=useState(String(value));
  return <label className="signal-number">{label}<input type="number" min={min} max={max} step="0.5" value={draft} onChange={event=>setDraft(event.target.value)} onBlur={()=>{const number=Number(draft);if(draft.trim() && Number.isFinite(number) && number>=min && number<=max)onChange(number);else setDraft(String(value));}} onKeyDown={event=>{if(event.key==='Enter')event.currentTarget.blur();}}/></label>;
}
export function SignalPanel({ board, onChange, onClose }: { board: Board; onChange: (chain: SignalChain) => void; onClose: () => void }) {
  const chain=board.signalChain??emptySignal();
  const routes=useMemo(()=>patchCables(board),[board]);
  const [adding,setAdding]=useState('');
  const remaining=board.items.filter(item=>!chain.nodes.some(node=>node.instanceId===item.instanceId));
  const updatePort=(index:number,which:'input'|'output',patch:Partial<SignalPort>)=>onChange({...chain,nodes:chain.nodes.map((node,i)=>i===index?{...node,[which]:{...node[which],...patch}}:node)});
  const move=(index:number,delta:number)=>{const nodes=[...chain.nodes];[nodes[index],nodes[index+delta]]=[nodes[index+delta],nodes[index]];onChange({...chain,nodes});};
  const validRoutes=routes.filter(route=>route.routed);
  return <aside className="inspector panel signal-drawer" aria-label="시그널 체인">
    <div className="drawer-heading"><div><span className="eyebrow">PATCH CABLES</span><strong>시그널 체인</strong></div><button className="icon-button" aria-label="시그널 체인 닫기" onClick={onClose}>×</button></div>
    <div className="signal-content">
      <p className="signal-intro">소리가 흐르는 순서대로 페달을 추가하세요.<br/>앞 페달의 OUT → 다음 페달의 IN을 연결해요.</p>
      <div className="signal-add"><select aria-label="체인에 추가할 페달" value={adding} onChange={event=>setAdding(event.target.value)}><option value="">페달 선택…</option>{remaining.map(item=><option key={item.instanceId} value={item.instanceId}>{board.items.indexOf(item)+1}. {item.pedal.name}</option>)}</select><button className="button primary" disabled={!remaining.some(item=>item.instanceId===adding)} onClick={()=>{onChange({...chain,nodes:[...chain.nodes,signalNode(adding)]});setAdding('');}}>추가</button></div>
      {!chain.nodes.length && <div className="signal-empty">아직 연결한 페달이 없어요.<br/>파워서플라이는 오디오 체인에서 제외하세요.</div>}
      <ol className="signal-list">{chain.nodes.map((node,index)=>{const item=board.items.find(item=>item.instanceId===node.instanceId)!;return <li key={node.instanceId}>
        <div className="signal-item-head"><span className="signal-index">{index+1}</span><span className="signal-name"><small>{item.pedal.brand}</small><strong>{item.pedal.name}</strong></span><div className="signal-order"><button disabled={index===0} aria-label={`${item.pedal.name} 순서 올리기`} onClick={()=>move(index,-1)}>↑</button><button disabled={index===chain.nodes.length-1} aria-label={`${item.pedal.name} 순서 내리기`} onClick={()=>move(index,1)}>↓</button><button aria-label={`${item.pedal.name} 체인에서 제외`} onClick={()=>onChange({...chain,nodes:chain.nodes.filter(n=>n.instanceId!==node.instanceId)})}>×</button></div></div>
        <details className="signal-ports"><summary>잭 위치 조정</summary><p>페달 정면 기준 · 위치는 왼쪽/위쪽부터의 비율이에요.</p>{(['input','output'] as const).map(which=><div className="signal-port" key={which}><strong>{which==='input'?'IN':'OUT'}</strong><select aria-label={`${index+1}번 ${which==='input'?'IN':'OUT'} 잭 방향`} value={node[which].edge} onChange={event=>updatePort(index,which,{edge:event.target.value as SignalPort['edge']})}>{Object.entries(edgeNames).map(([value,label])=><option value={value} key={value}>{label}</option>)}</select><NumberSetting key={`${which}-${node[which].offsetPct}`} label="위치 %" value={node[which].offsetPct} min={5} max={95} onChange={offsetPct=>updatePort(index,which,{offsetPct})}/></div>)}<p>3D 잭 높이: 장비 높이의 45%를 기본으로 사용해요.</p>{(['input','output'] as const).map(which=><label className="signal-number" key={which}>{which.toUpperCase()} 높이 (mm)<input type="number" min="1" max="500" step="0.5" placeholder="자동" defaultValue={node[which].heightMm} key={`${which}-${node[which].heightMm}`} onBlur={event=>{const value=event.target.value;const n=Number(value);if(!value)updatePort(index,which,{heightMm:undefined});else if(n>=1&&n<=500)updatePort(index,which,{heightMm:n});else event.target.value=String(node[which].heightMm??'');}}/></label>)}</details>
      </li>;})}</ol>
      <details className="signal-settings"><summary>플러그·케이블 규격 <span>{chain.plugWidthMm} / {chain.plugLengthMm} / {chain.cableDiameterMm} mm</span></summary><p>잭에 꽂힌 금속 팁을 제외한 바깥 하우징의 최대 두께와 돌출 길이예요. 기본값은 배치용 예시이며 사용 제품의 실측값으로 바꿔주세요.</p><NumberSetting key={`w${chain.plugWidthMm}`} label="플러그 두께 (mm)" value={chain.plugWidthMm} min={4} max={40} onChange={plugWidthMm=>onChange({...chain,plugWidthMm})}/><NumberSetting key={`l${chain.plugLengthMm}`} label="플러그 돌출 (mm)" value={chain.plugLengthMm} min={5} max={60} onChange={plugLengthMm=>onChange({...chain,plugLengthMm})}/><NumberSetting key={`d${chain.cableDiameterMm}`} label="케이블 굵기 (mm)" value={chain.cableDiameterMm} min={1} max={12} onChange={cableDiameterMm=>onChange({...chain,cableDiameterMm})}/></details>
      <label className="signal-visible"><input type="checkbox" checked={chain.visible} onChange={event=>onChange({...chain,visible:event.target.checked})}/>케이블 표시</label>
      {routes.length>0 && <div className="signal-routes"><strong>{routes.length}개 연결 · {validRoutes.length}개 경로 생성</strong>{routes.map(route=><div className="signal-route" key={route.index}><div><span style={{background:route.color}}/>{route.index+1} → {route.index+2}<b>{route.lengthMm===null?'경로 확인 필요':`평면 약 ${Math.ceil(route.lengthMm/10)} cm`}</b></div>{route.warnings.map(warning=><p className="signal-warning" key={warning}>{warning}</p>)}</div>)}</div>}
      <p className="signal-note">모노 직렬 연결 · 잭 위치는 수정 가능한 가정값이에요. 이동·회전 후 경로가 다시 정리됩니다. 평면 길이는 구매 길이가 아니며 굽힘·높이·체결 여유가 추가로 필요해요. 3D는 배선 미리보기이며 하부 보강대·관통홀·단차의 실제 통과 여부는 확인해 주세요.</p>
    </div>
  </aside>;
}
