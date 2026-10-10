package uy.transportesferreira.gps
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.net.URLEncoder
class MobileData(private val c:Context){
 private val api=Api(c);private val store=TripStore(c)
 fun uid()=api.session()?.getJSONObject("user")?.getString("id")?:error("Iniciá sesión")
 private fun array(path:String)=JSONArray(api.request(path))
 fun catalog(refresh:Boolean=false):JSONObject{
  if(refresh){val a=array("/rest/v1/trf_mobile_catalog?id=eq.fleet&select=data");if(a.length()>0)store.cache("catalog-${uid()}",a.getJSONObject(0).getJSONObject("data"))}
  return store.cache("catalog-${uid()}")
 }
 /** With fleet=true the driver filter is dropped; row security still decides which drivers an account can read. */
 fun history(kind:String,limit:Int=50,refresh:Boolean=false,fleet:Boolean=false):JSONArray{
  val key="$kind-${if(fleet)"fleet-" else ""}${uid()}"
  if(refresh){val table=if(kind=="trips")"trf_driver_tracking_sessions" else "trf_driver_fuel_receipts";val order=if(kind=="trips")"started_at" else "recorded_at"
   val owner=if(fleet)"" else "driver_id=eq.${uid()}&"
   val records=JSONArray();var offset=0
   while(offset<limit){val size=minOf(1000,limit-offset);val batch=array("/rest/v1/$table?${owner}order=$order.desc,id.desc&limit=$size&offset=$offset${if(kind=="trips")"" else "&archived=eq.false"}")
    for(i in 0 until batch.length())records.put(batch.getJSONObject(i));if(batch.length()<size)break;offset+=size
   }
   store.cache(key,JSONObject().put("rows",records).put("fetched_at",System.currentTimeMillis()))
   // The list still shows without destinations if this extra lookup fails.
   if(kind=="trips")try{fetchTripInfo(records,fleet)}catch(_:Exception){}
  }
  val all=linkedMapOf<String,JSONObject>();val rows=store.cache(key).optJSONArray("rows")?:JSONArray()
  for(i in 0 until rows.length()){val r=rows.getJSONObject(i);all[r.getString("id")]=r}
  if(!fleet){val local=if(kind=="trips")store.trips() else store.receipts().map{it.second}
   for(r in local.filter{it.optString("driver_id")==uid()})if((!all.containsKey(r.getString("id")) && (!store.cache(key).has("rows") || r.optLong("synced_at",0)>store.cache(key).optLong("fetched_at",0))) || (kind=="trips"&&r.optInt("revision")>r.optInt("synced_revision")) || (kind!="trips"&&!r.optBoolean("synced")))all[r.getString("id")]=r
  }
  return JSONArray(all.values.sortedByDescending{it.optString(if(kind=="trips")"started_at" else "recorded_at")})
 }
 /** Destination, client and cargo for the trip list, fetched in one request per 40 trips. */
 private fun fetchTripInfo(rows:JSONArray,fleet:Boolean){
  val out=JSONObject();val ids=(0 until rows.length()).map{rows.getJSONObject(it).getString("id")}
  ids.chunked(40).forEach{chunk->val a=array("/rest/v1/trf_trip_details?trip_id=in.(${chunk.joinToString(","){enc(it)}})&select=trip_id,data${if(fleet)"" else "&driver_id=eq.${uid()}"}")
   for(i in 0 until a.length()){val d=a.getJSONObject(i);out.put(d.getString("trip_id"),d.optJSONObject("data")?:JSONObject())}}
  store.cache("tripinfo-${if(fleet)"fleet-" else ""}${uid()}",JSONObject().put("data",out))
 }
 fun tripInfo(fleet:Boolean=false):JSONObject{
  val out=store.cache("tripinfo-${if(fleet)"fleet-" else ""}${uid()}").optJSONObject("data")?:JSONObject()
  if(!fleet)store.details().forEach{val tid=it.second.optString("trip_id");if(tid.isNotBlank()&&!out.has(tid))out.put(tid,it.second.optJSONObject("data")?:JSONObject())}
  return out
 }
 fun detail(trip:JSONObject,refresh:Boolean=false):JSONObject{
  val id=trip.getString("id");val owner=trip.optString("driver_id").ifBlank{uid()};val key="detail-${uid()}-$id"
  if(refresh){val data=array("/rest/v1/trf_trip_details?trip_id=eq.$id&driver_id=eq.${enc(owner)}");val docs=JSONArray();var offset=0
   while(true){val page=array("/rest/v1/trf_trip_documents?trip_id=eq.$id&driver_id=eq.${enc(owner)}&order=created_at.asc,id.asc&limit=1000&offset=$offset");for(i in 0 until page.length())docs.put(page.getJSONObject(i));if(page.length()<1000)break;offset+=1000}
   store.cache(key,JSONObject().put("data",if(data.length()>0)data.getJSONObject(0).getJSONObject("data") else JSONObject()).put("documents",docs))
  }
  val result=store.cache(key);if(!result.has("data")){result.put("data",store.details().firstOrNull{it.second.optString("trip_id")==id}?.second?.optJSONObject("data")?:JSONObject())}
  val docs=result.optJSONArray("documents")?:JSONArray();val ids=(0 until docs.length()).map{docs.getJSONObject(it).optString("id")}.toSet()
  store.documents().filter{it.second.optString("trip_id")==id&&it.second.optString("driver_id")==owner&&!ids.contains(it.second.optString("id"))}.forEach{docs.put(it.second)}
  result.put("documents",docs);return result
 }
 fun route(trip:JSONObject,refresh:Boolean=false):JSONArray{
  val key="route-${uid()}-${trip.getString("id")}";val owner=trip.optString("driver_id").ifBlank{uid()}
  if(refresh){val out=JSONArray();var offset=0
   while(true){val path="/rest/v1/trf_driver_location_history?driver_id=eq.${enc(owner)}&or=(trip_id.eq.${trip.getString("id")},trip_id.is.null)&recorded_at=gte.${enc(trip.getString("started_at"))}"+(if(!trip.isNull("ended_at"))"&recorded_at=lte.${enc(trip.getString("ended_at"))}" else "")+"&vehicle=eq.${enc(trip.optString("vehicle"))}&order=recorded_at.asc,id.asc&limit=1000&offset=$offset&select=latitude,longitude,recorded_at,segment"
    val page=array(path);for(i in 0 until page.length())out.put(page.getJSONObject(i));if(page.length()<1000)break;offset+=1000
   };store.cache(key,JSONObject().put("points",out))
  }
  return store.cache(key).optJSONArray("points")?:JSONArray()
 }
 /** Trips in progress with their last GPS reading, plus recently finished trips to place idle trucks. */
 fun fleet(refresh:Boolean=false):JSONObject{
  val key="fleet-${uid()}"
  if(refresh){
   val active=array("/rest/v1/trf_driver_tracking_sessions?active=eq.true&select=id,driver_id,driver_name,vehicle,started_at,paused,load_type,distance_meters&order=started_at.desc&limit=50")
   for(i in 0 until active.length()){val s=active.getJSONObject(i);val p=array("/rest/v1/trf_driver_location_history?trip_id=eq.${enc(s.getString("id"))}&select=latitude,longitude,speed_kmh,recorded_at&order=recorded_at.desc&limit=1");if(p.length()>0)s.put("last",p.getJSONObject(0))}
   val recent=array("/rest/v1/trf_driver_tracking_sessions?active=eq.false&select=driver_name,vehicle,ended_at,arrival_lat,arrival_lng&order=ended_at.desc.nullslast&limit=100")
   store.cache(key,JSONObject().put("active",active).put("recent",recent).put("fetched_at",System.currentTimeMillis()))
  }
  return store.cache(key)
 }
 class Performance(val trucks:FleetStats.Summary,val drivers:FleetStats.Summary,val fetchedAt:Long)
 /**
  * Month totals per truck and per driver for the owner, from the same rows as the web panel summary:
  * app trips that started in the month with what the office completed in the panel, trips typed by hand, and fuel receipts.
  * Returns null until the month has been fetched once.
  */
 fun performance(month:java.time.YearMonth,refresh:Boolean=false):Performance?{
  val key="performance-${uid()}-$month"
  if(refresh){
   val zone=java.time.ZoneId.systemDefault()
   val from=enc(month.atDay(1).atStartOfDay(zone).toInstant().toString());val to=enc(month.plusMonths(1).atDay(1).atStartOfDay(zone).toInstant().toString())
   val sessions=linkedMapOf<String,JSONObject>()
   for(s in all("/rest/v1/trf_driver_tracking_sessions?select=id,driver_name,vehicle,distance_meters,load_type&started_at=gte.$from&started_at=lt.$to&order=started_at.desc,id.desc"))sessions[s.getString("id")]=s
   // Old labels without plate are added to the catalog truck they name. The catalog is refreshed after the first answer, so being offline fails once.
   try{catalog(true)}catch(_:Exception){}
   val fleet=trucks()
   val panel=HashMap<String,JSONObject>();val details=HashMap<String,JSONObject>()
   sessions.keys.chunked(40).forEach{chunk->val ids=chunk.joinToString(","){enc(it)}
    val p=array("/rest/v1/trf_panel_trips?select=app_trip_id,driver_name,vehicle,billable_km,kg,amount,currency,deleted_at&app_trip_id=in.($ids)");for(i in 0 until p.length())panel[p.getJSONObject(i).optString("app_trip_id")]=p.getJSONObject(i)
    val d=array("/rest/v1/trf_trip_details?select=trip_id,data&trip_id=in.($ids)");for(i in 0 until d.length())details[d.getJSONObject(i).optString("trip_id")]=json(d.getJSONObject(i),"data")}
   val trips=mutableListOf<FleetStats.Trip>()
   for((id,s) in sessions){val p=panel[id]
    trips.add(FleetStats.Trip(FleetStats.canonical(text(p,"vehicle")?:text(s,"vehicle"),fleet),text(p,"driver_name")?:text(s,"driver_name"),(num(s,"distance_meters")?:0.0)/1000,s.optString("load_type")!="empty",num(p,"billable_km")?:0.0,num(p,"kg")?:num(details[id],"kg")?:0.0,num(p,"amount")?:0.0,text(p,"currency")=="USD",text(p,"deleted_at")!=null))}
   for(p in all("/rest/v1/trf_panel_trips?select=id,driver_name,vehicle,billable_km,kg,amount,currency,deleted_at&source=eq.manual&departure_at=gte.$from&departure_at=lt.$to&order=departure_at.desc,id.desc"))
    trips.add(FleetStats.Trip(FleetStats.canonical(text(p,"vehicle"),fleet),text(p,"driver_name"),0.0,null,num(p,"billable_km")?:0.0,num(p,"kg")?:0.0,num(p,"amount")?:0.0,text(p,"currency")=="USD",text(p,"deleted_at")!=null))
   val fuel=all("/rest/v1/trf_driver_fuel_receipts?select=id,driver_name,vehicle,liters,total,panel_data&or=(archived.is.null,archived.is.false)&recorded_at=gte.$from&recorded_at=lt.$to&order=recorded_at.desc,id.desc").map{r->val d=json(r,"panel_data")
    FleetStats.Fuel(FleetStats.canonical(text(d,"vehicle")?:text(r,"vehicle"),fleet),text(r,"driver_name"),num(d,"litros")?:num(r,"liters")?:0.0,num(d,"monto")?:num(r,"total")?:0.0,text(d,"moneda")=="USD")}
   store.cache(key,JSONObject().put("trucks",pack(FleetStats.summarize(trips,fuel))).put("drivers",pack(FleetStats.summarize(trips,fuel,true))).put("fetched_at",System.currentTimeMillis()))
  }
  val saved=store.cache(key);if(!saved.has("fetched_at"))return null
  return Performance(unpack(saved.optJSONObject("trucks")),unpack(saved.optJSONObject("drivers")),saved.optLong("fetched_at"))
 }
 /** Trucks of the catalog, as model and plate. */
 fun trucks():List<FleetStats.CatalogTruck>{val a=catalog().optJSONArray("equipos")?:JSONArray();return (0 until a.length()).map{a.getJSONObject(it)}.map{FleetStats.CatalogTruck(text(it,"tipo")?:"",text(it,"matriculaCamion")?:"")}.filter{it.label.isNotEmpty()}}
 /** Every row of a query, 1000 at a time. The path must carry a stable order. */
 private fun all(path:String):List<JSONObject>{
  val out=mutableListOf<JSONObject>();var offset=0
  while(true){val page=array("$path&limit=1000&offset=$offset");for(i in 0 until page.length())out.add(page.getJSONObject(i));if(page.length()<1000)break;offset+=1000}
  return out
 }
 private fun text(o:JSONObject?,key:String):String?=if(o==null||o.isNull(key))null else FleetStats.text(o.optString(key))
 private fun num(o:JSONObject?,key:String):Double?=if(o==null||o.isNull(key))null else FleetStats.number(o.opt(key))
 /** JSON columns may arrive as objects (jsonb) or as text (json saved as a string): both are accepted. */
 private fun json(o:JSONObject,key:String):JSONObject=o.optJSONObject(key)?:try{JSONObject(o.optString(key))}catch(_:Exception){JSONObject()}
 private fun pack(s:FleetStats.Summary):JSONObject=JSONObject().put("rows",JSONArray(s.rows.map{pack(it)})).put("total",pack(s.total))
 private fun pack(r:FleetStats.Row):JSONObject=JSONObject().put("name",r.name).put("trips",r.trips).put("gps_km",r.gpsKm).put("loaded_km",r.loadedKm).put("empty_km",r.emptyKm).put("billable_km",r.billableKm).put("kg",r.kg)
  .put("billed_uyu",r.billedUyu).put("billed_usd",r.billedUsd).put("unbilled",r.unbilled).put("liters",r.liters).put("fuel_uyu",r.fuelUyu).put("fuel_usd",r.fuelUsd)
 private fun unpack(o:JSONObject?):FleetStats.Summary{val a=o?.optJSONArray("rows")?:JSONArray();return FleetStats.Summary((0 until a.length()).map{row(a.getJSONObject(it))},row(o?.optJSONObject("total")?:JSONObject()))}
 private fun row(o:JSONObject):FleetStats.Row=FleetStats.Row(o.optString("name")).apply{trips=o.optInt("trips");gpsKm=o.optDouble("gps_km",0.0);loadedKm=o.optDouble("loaded_km",0.0);emptyKm=o.optDouble("empty_km",0.0);billableKm=o.optDouble("billable_km",0.0);kg=o.optDouble("kg",0.0)
  billedUyu=o.optDouble("billed_uyu",0.0);billedUsd=o.optDouble("billed_usd",0.0);unbilled=o.optInt("unbilled");liters=o.optDouble("liters",0.0);fuelUyu=o.optDouble("fuel_uyu",0.0);fuelUsd=o.optDouble("fuel_usd",0.0)}
 /** Truck services; row security limits them to drivers and administrators. */
 fun maintenance(refresh:Boolean=false):JSONArray{
  val key="maintenance-${uid()}"
  if(refresh)store.cache(key,JSONObject().put("rows",array("/rest/v1/trf_vehicle_maintenance?select=*&order=created_at.desc&limit=500")).put("fetched_at",System.currentTimeMillis()))
  return store.cache(key).optJSONArray("rows")?:JSONArray()
 }
 /** Own driver papers (every driver's for administrators) plus truck papers. */
 fun documents(refresh:Boolean=false):JSONArray{
  val key="documents-${uid()}"
  if(refresh)store.cache(key,JSONObject().put("rows",array("/rest/v1/trf_documents?select=*&order=expires_on.asc.nullslast&limit=500")).put("fetched_at",System.currentTimeMillis()))
  return store.cache(key).optJSONArray("rows")?:JSONArray()
 }
 /** Row security filters edits silently, so an update or delete that touches nothing means no permission. */
 fun saveRecord(table:String,row:JSONObject,id:String?){
  if(id==null)api.json("/rest/v1/$table",row,"return=minimal")
  else check(JSONArray(api.json("/rest/v1/$table?id=eq.${enc(id)}",row,"return=representation","PATCH")).length()>0){"Sin permiso"}
 }
 fun deleteRecord(table:String,id:String){check(JSONArray(api.request("/rest/v1/$table?id=eq.${enc(id)}","DELETE",prefer="return=representation")).length()>0){"Sin permiso"}}
 fun photo(path:String,bucket:String):ByteArray{
  // Download with the current user's token. The Storage policy rechecks ownership.
  val result=api.json("/storage/v1/object/sign/$bucket/$path",JSONObject().put("expiresIn",120))
  val signed=JSONObject(result).optString("signedURL")
  val url=if(signed.startsWith("http"))signed else Config.SUPABASE_URL+"/storage/v1"+signed
  return java.net.URL(url).openConnection().apply{connectTimeout=10000;readTimeout=20000}.getInputStream().use{it.readBytes()}
 }
 companion object{fun enc(s:String)=URLEncoder.encode(s,"UTF-8")}
}
