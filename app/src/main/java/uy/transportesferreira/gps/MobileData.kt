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
