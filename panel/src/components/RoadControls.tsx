import { useEffect, useRef, useState } from 'react';
import { ConfirmDialog } from './ConfirmDialog';
import { DataError, refused } from '../data/api';
import { Link } from 'react-router';
import { useRoadAccount, useRoadWrite, useTankObservations, type RoadWrite } from '../data/road';
import { type FleetUnit, unitTitle } from '../lib/fleet';
import { money, decimal } from '../lib/format';
import { POINT_LABEL, type RoadPoint, type PointKind, externalMaps, roadVehicleKey, tollBalance, applicableRate, fuelEstimate, nearbyPoints, validatePoint } from '../lib/road';

export type RoadView = 'live' | 'controls' | 'places';
type Field = { name: string; label: string; value: string | number; type?: string; min?: number; max?: number; step?: string; optional?: boolean };
/** The same native dialog, fields and buttons used by the rest of the panel. */
function Editor({ title, fields, save, close }: { title: string; fields: Field[]; save: (v: Record<string,string>) => Promise<void>; close: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState('');
  const [discard,setDiscard] = useState(false);
  const [uncertain,setUncertain] = useState(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const cancel = () => { if (!busy) { if (dirty) setDiscard(true); else close(); } };
  return <><dialog ref={dialog} className="form-dialog form-dialog-small" onCancel={e => { e.preventDefault(); cancel(); }} aria-label={title}>
    <form onChange={() => setDirty(true)} onSubmit={async e => {
      e.preventDefault(); const values = Object.fromEntries(new FormData(e.currentTarget).entries()) as Record<string,string>;
      setBusy(true); setError('');
      try { await save(values); close(); } catch (err) { setUncertain((err instanceof DataError && !refused(err)) || err instanceof TypeError); setError(err instanceof Error ? err.message : 'No se pudo guardar. Volvé a intentar.'); } finally { setBusy(false); }
    }}><header><h2>{title}</h2></header><fieldset disabled={busy} className="road-fields">
      {fields.map(f => <label className="field" key={f.name}>{f.label}<input readOnly={uncertain} name={f.name} type={f.type ?? 'text'} defaultValue={f.value} min={f.min} max={f.max} step={f.step} required={!f.optional} maxLength={f.type ? undefined : 500}/></label>)}
    </fieldset>{error && <p role="alert">{error}</p>}<footer className="road-actions"><button className="btn" type="button" disabled={busy} onClick={cancel}>Cancelar</button><button className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Guardar'}</button></footer></form>
  </dialog>{discard && <ConfirmDialog title="Descartar cambios" confirmLabel="Descartar" onCancel={() => setDiscard(false)} onConfirm={close}>Los cambios sin guardar se pierden. Si se cortó una respuesta, revisá el registro antes de volver a cargarlo.</ConfirmDialog>}</>;
}
export function PointEditor({ point, kind, location, close }: { point?: RoadPoint; kind: PointKind; location: { latitude: number; longitude: number }; close: () => void }) {
  const mutation = useRoadWrite();
  const [id] = useState(() => point?.id ?? crypto.randomUUID());
  return <Editor title={point ? `Editar ${point.name}` : `Agregar ${POINT_LABEL[kind].toLowerCase()}`} close={close} fields={[
    { name:'name', label:'Nombre', value:point?.name ?? '' },
    { name:'latitude',label:'Latitud',type:'number',step:'any',min:-90,max:90,value:point?.latitude ?? location.latitude },
    { name:'longitude',label:'Longitud',type:'number',step:'any',min:-180,max:180,value:point?.longitude ?? location.longitude },
    { name:'radius_m',label:'Zona de paso (metros)',type:'number',min:15,max:150,value:point?.radius_m ?? 50 },
    { name:'warning_m',label:'Avisar cerca (metros)',type:'number',min:30,max:5000,value:point?.warning_m ?? 500 },
    { name:'speed_limit',label:'Límite de velocidad (km/h)',type:'number',step:'any',min:1,max:130,optional:true,value:point?.speed_limit ?? (kind === 'scale' ? 5 : '') },
    { name:'notes',label:'Nota / lugar de trabajo',optional:true,value:point?.notes ?? '' },
  ]} save={async v => {
    const now = new Date().toISOString();
    const row: RoadPoint = { id, kind, name:v.name!.trim(),latitude:Number(v.latitude),longitude:Number(v.longitude),radius_m:Number(v.radius_m),warning_m:Number(v.warning_m),speed_limit:v.speed_limit ? Number(v.speed_limit) : null,notes:v.notes ?? '',archived:false,created_at:point?.created_at ?? now,updated_at:point?.updated_at ?? now };
    const error = validatePoint(row); if (error) throw new Error(error);
    await mutation.mutateAsync({ type:'point',row,before:point?.updated_at ?? null });
  }}/>;
}
export function TruckRoad({ unit, points, now }: { unit: FleetUnit; points: readonly RoadPoint[]; now: number }) {
  const label = unitTitle(unit), key = roadVehicleKey(label);
  const account = useRoadAccount(key), observations = useTankObservations(key), mutation = useRoadWrite();
  const [editor,setEditor] = useState<{ title:string; fields:Field[]; build:(v:Record<string,string>) => RoadWrite | Promise<RoadWrite>; pending?:RoadWrite } | null>(null);
  const maps = externalMaps(unit.lat,unit.lng);
  const a = account.data;
  const estimate = a?.tank && observations.data && !observations.error ? fuelEstimate(a.tank,observations.data.trips,observations.data.receipts) : null;
  const nearby = nearbyPoints(unit, points, now);
  const movement = () => {
    const id = crypto.randomUUID(), time = new Date().toISOString();
    setEditor({ title:'Recarga o ajuste de telepeaje',fields:[{name:'amount',label:'Importe en UYU (+ suma, − descuenta)',type:'number',step:'0.01',value:''},{name:'notes',label:'Motivo / comprobante',value:''}],build:v => {
      const amount = Number(v.amount); if (!Number.isFinite(amount) || !amount || Math.abs(amount) >= 10000000) throw new Error('Indicá un importe distinto de cero.');
      return {type:'movement',row:{id,vehicle_key:key,vehicle_name:label,amount,kind:'adjustment',notes:v.notes!.trim(),happened_at:time,created_at:time,event_id:null}};
    } });
  };
  const tank = () => {
    const o = observations.data; if (!o || observations.error || o.receipts.some(r => r.liters === null)) return;
    const ref = a?.tank;
    setEditor({ title:'Referencia de combustible actual',fields:[
      {name:'capacity',label:'Capacidad del tanque (L)',type:'number',step:'any',min:1,max:5000,value:ref?.capacity_l ?? ''},
      {name:'liters',label:'Litros que tiene ahora (medidos)',type:'number',step:'any',min:0,max:5000,value:''},
      {name:'consumption',label:'Consumo de referencia (L / 100 km)',type:'number',step:'any',min:0.1,max:200,value:ref?.consumption ?? ''},
      {name:'warning',label:'Avisar por debajo de (L)',type:'number',step:'any',min:0,max:5000,value:ref?.warning_l ?? 50},
    ],build:async v => {
      const fresh = await observations.refetch();
      if (fresh.error || !fresh.data || fresh.data.receipts.some(r => r.liters === null)) throw new Error('No se pudo leer una referencia completa. Revisá las cargas.');
      const baseline = fresh.data;
      const capacity = Number(v.capacity),liters = Number(v.liters),warning = Number(v.warning);
      if (liters > capacity || warning > capacity) throw new Error('Los litros y el aviso no pueden superar la capacidad.');
      const time = new Date().toISOString();
      return {type:'tank',before:ref?.updated_at ?? null,row:{vehicle_key:key,vehicle_name:label,capacity_l:capacity,liters,warning_l:warning,consumption:Number(v.consumption),trip_meters:Object.fromEntries(baseline.trips.map(t => [t.id,t.distance_meters])),receipt_liters:Object.fromEntries(baseline.receipts.map(r => [r.id,r.liters!])),measured_at:time,updated_at:ref?.updated_at ?? time}};
    } });
  };
  return <section className="road-truck" aria-label="Control del camión">
    {maps && <div><p>Última ubicación conocida{unit.at ? ` · ${new Date(unit.at).toLocaleString('es-UY')}` : ''}</p><div className="road-actions"><a className="btn" href={maps.google} target="_blank" rel="noreferrer">Google Maps</a><a className="btn" href={maps.apple} target="_blank" rel="noreferrer">Apple Maps</a></div></div>}
    {nearby.map(({point,meters}) => <p className="road-warning" key={point.id} role="status">{POINT_LABEL[point.kind]}: {point.name}, a {Math.round(meters)} m en línea recta{point.speed_limit !== null ? ` · límite ${point.speed_limit} km/h` : ''}</p>)}
    {account.error ? <p role="alert">No se pudo actualizar el control de ruta. <button className="btn" onClick={() => void account.refetch()}>Reintentar</button></p> : !a ? <p>Cargando control de ruta…</p> : <>
      <h3>Telepeaje · {money(tollBalance(a.movements,key),'UYU')}</h3><p className="muted">Saldo estimado por camión. Contrastalo con los cobros del operador.</p>
      <button className="btn" onClick={movement}>Recarga / ajuste</button>
      <details><summary>Movimientos ({a.movements.length})</summary>{[...a.movements].sort((x,y) => y.happened_at.localeCompare(x.happened_at)).map(m => <p key={m.id}>{new Date(m.happened_at).toLocaleDateString('es-UY')} · {m.notes} · <strong>{money(m.amount,'UYU')}</strong></p>)}</details>
      <details><summary>Tarifas de peajes</summary>{points.filter(p => p.kind === 'toll').map(p => {
        const rate = applicableRate(a.rates,p.id,key,new Date(now).toISOString());
        return <div className="road-point" key={p.id}><span>{p.name} · {rate ? money(rate.amount,'UYU') : 'Sin tarifa'}</span><button className="btn" onClick={() => {
          const id = crypto.randomUUID(),time = new Date().toISOString();
          const localTime = new Date(Date.now() - new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);
          setEditor({title:`Tarifa · ${p.name}`,fields:[{name:'amount',label:'Precio UYU',type:'number',step:'0.01',min:0,max:9999999,value:rate?.amount ?? ''},{name:'from',label:'Vigente desde (hora local)',type:'datetime-local',value:localTime}],build:v => ({type:'rate',row:{id,point_id:p.id,vehicle_key:key,amount:Number(v.amount),valid_from:new Date(v.from!).toISOString(),created_at:time}})});
        }}>Cambiar precio</button></div>;
      })}</details>
      <h3>Combustible estimado</h3>
      {observations.error ? <p role="alert">No se pudieron leer todas las cargas y distancias. <button className="btn" onClick={() => void observations.refetch()}>Reintentar</button></p> : estimate?.known ? <p className={estimate.low ? 'road-warning' : ''}>{decimal(estimate.liters)} L · autonomía aproximada {Math.round(estimate.km)} km{estimate.low ? ' · Combustible bajo' : ''}</p> : <p>{estimate && !estimate.known ? estimate.reason : 'Definí los litros actuales y el consumo para comenzar.'}</p>}
      <p className="muted">Se calcula con kilómetros GPS y las cargas de Combustible; no es una medición del tanque. Una pérdida de señal o carga sin registrar puede alterar el resultado.</p>
      <div className="road-actions"><button className="btn" onClick={tank} disabled={!observations.data || !!observations.error || observations.data.receipts.some(r => r.liters === null)}>Calibrar tanque / consumo</button><Link className="btn" to="/combustible">Cargar combustible</Link></div>
      {observations.data?.receipts.some(r => r.liters === null) && <p>Completá los litros de las boletas antes de calibrar.</p>}
      <details><summary>Últimos 30 pasos registrados</summary>{a.events.length === 0 && <p>Todavía no hay pasos registrados.</p>}{a.events.map(e => <p key={e.id}>{e.point_name} · {new Date(e.happened_at).toLocaleString('es-UY')} · {e.speed_kmh === null ? 'Sin velocidad' : `${Math.round(e.speed_kmh)} km/h (máxima GPS)`}{e.speed_limit !== null && e.speed_kmh !== null && e.speed_kmh > e.speed_limit ? ' · Revisar velocidad' : ''}{e.kind === 'toll' && e.amount === null ? ' · Sin tarifa, no descontado' : ''}</p>)}</details>
      <p className="muted">Los avisos sonoros del teléfono requieren una próxima actualización móvil. A baja velocidad, el GPS no certifica una infracción.</p>
    </>}
    {editor && <Editor title={editor.title} fields={editor.fields} close={() => setEditor(null)} save={async v => { const write = editor.pending ?? await editor.build(v); editor.pending = write; try { await mutation.mutateAsync(write); } catch (error) { if (refused(error)) delete editor.pending; throw error; } }}/>} 
  </section>;
}

