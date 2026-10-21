import { describe, expect, it } from 'vitest';
import { applicableRate, externalMaps, fuelEstimate, roadVehicleKey, tollBalance, validatePoint, type TankReference, type TollMovement, type TollRate } from '../../src/lib/road';
const ref: TankReference = {vehicle_key:'plate:abc1234',vehicle_name:'Volvo · ABC1234',capacity_l:400,liters:200,consumption:40,warning_l:50,trip_meters:{a:10000},receipt_liters:{r:100},measured_at:'2026-10-21T10:00:00Z',updated_at:'2026-10-21T10:00:00Z'};
const trip = {id:'a',vehicle:ref.vehicle_name,distance_meters:110000};
const receipt = {id:'r',vehicle:ref.vehicle_name,liters:100};
describe('control de ruta', () => {
  it('keeps different plates separate, independent of model spelling', () => {
    expect(roadVehicleKey('Otro modelo · ABC1234')).toBe(ref.vehicle_key);
    expect(roadVehicleKey('Volvo · DEF')).not.toBe(ref.vehicle_key);
    expect(roadVehicleKey('Volvo')).toBe('model:volvo');
  });
  it('opens a valid static location and rejects missing/invalid fixes', () => {
    expect(externalMaps(-34,-56)?.google).toContain('-34%2C-56');
    expect(externalMaps(null,null)).toBeNull(); expect(externalMaps(0,0)).toBeNull(); expect(externalMaps(100,-56)).toBeNull();
  });
  it('selects rate by actual time including offsets, never a future rate', () => {
    const rates = [{id:'a',point_id:'p',vehicle_key:ref.vehicle_key,amount:200,valid_from:'2026-10-21T10:00:00-03:00'}, {id:'b',point_id:'p',vehicle_key:ref.vehicle_key,amount:300,valid_from:'2026-10-21T14:00:00Z'}] as TollRate[];
    expect(applicableRate(rates,'p',ref.vehicle_key,'2026-10-21T13:30:00Z')?.amount).toBe(200);
    expect(applicableRate(rates,'p','plate:other','2026-10-21T13:30:00Z')).toBeNull();
  });
  it('sums cents and only this truck', () => {
    expect(tollBalance([{vehicle_key:'a',amount:0.1},{vehicle_key:'a',amount:0.2},{vehicle_key:'b',amount:999}] as TollMovement[],'a')).toBe(0.3);
  });
  it('subtracts only new distance and adds only new loads', () => {
    expect(fuelEstimate(ref,[trip],[receipt,{...receipt,id:'new',liters:40}])).toMatchObject({known:true,liters:200,km:500,low:false});
    expect(fuelEstimate(ref,[{...trip,distance_meters:410000}],[receipt])).toMatchObject({known:true,liters:40,low:true});
  });
  it('refuses guesses after missing/changed old records or a distance reset', () => {
    for (const [trips,receipts] of [[[],[receipt]],[[trip],[]],[[trip],[{...receipt,liters:null}]],[[trip],[{...receipt,liters:99}]],[[{...trip,distance_meters:0}],[receipt]]] as const) expect(fuelEstimate(ref,trips,receipts).known).toBe(false);
  });
  it('rejects impossible zones and limits', () => {
    const p = {name:'Balanza',latitude:-34,longitude:-56,radius_m:50,warning_m:500,speed_limit:5,notes:''};
    expect(validatePoint(p)).toBeNull(); expect(validatePoint({...p,warning_m:60})).not.toBeNull(); expect(validatePoint({...p,speed_limit:-1})).not.toBeNull();
  });
});
