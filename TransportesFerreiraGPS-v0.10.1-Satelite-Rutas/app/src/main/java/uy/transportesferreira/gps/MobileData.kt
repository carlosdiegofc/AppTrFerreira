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
 fun history(kind:String,limit:Int=50,refresh:Boolean=false):JSONArray{
  val key="$kind-${uid()}"
  if(refresh){val table=if(kind=="trips")"trf_driver_tracking_sessions" else "trf_driver_fuel_receipts";val order=if(kind=="trips")"started_at" else "recorded_at"
   val records=JSONArray();var offset=0
   while(offset<limit){val size=minOf(1000,limit-offset);val batch=array("/rest/v1/$table?driver_id=eq.${uid()}&order=$order.desc,id.desc&limit=$size&offset=$offset${if(kind=="trips")"" else "&archived=eq.false"}")
    for(i in 0 until batch.length())records.put(batch.getJSONObject(i));if(batch.length()<size)break;offset+=size
   }
   store.cache(key,JSONObject().put("rows",records))
  }
  val all=linkedMapOf<String,JSONObject>();val rows=store.cache(key).optJSONArray("rows")?:JSONArray()
  for(i in 0 until rows.length()){val r=rows.getJSONObject(i);all[r.getString("id")]=r}
  val local=if(kind=="trips")store.trips() else store.receipts().map{it.second}
  for(r in local.filter{it.optString("driver_id")==uid()})if((!store.cache(key).has("rows")&&!all.containsKey(r.getString("id"))) || (kind=="trips"&&r.optInt("revision")>r.optInt("synced_revision")) || (kind!="trips"&&!r.optBoolean("synced")))all[r.getString("id")]=r
  return JSONArray(all.values.sortedByDescending{it.optString(if(kind=="trips")"started_at" else "recorded_at")})
 }
 fun detail(trip:JSONObject,refresh:Boolean=false):JSONObject{
  val id=trip.getString("id");val key="detail-${uid()}-$id"
  if(refresh){val data=array("/rest/v1/trf_trip_details?trip_id=eq.$id&driver_id=eq.${uid()}");val docs=JSONArray();var offset=0
   while(true){val page=array("/rest/v1/trf_trip_documents?trip_id=eq.$id&driver_id=eq.${uid()}&order=created_at.asc,id.asc&limit=1000&offset=$offset");for(i in 0 until page.length())docs.put(page.getJSONObject(i));if(page.length()<1000)break;offset+=1000}
   store.cache(key,JSONObject().put("data",if(data.length()>0)data.getJSONObject(0).getJSONObject("data") else JSONObject()).put("documents",docs))
  }
  val result=store.cache(key);if(!result.has("data")){result.put("data",store.details().firstOrNull{it.second.optString("trip_id")==id}?.second?.optJSONObject("data")?:JSONObject())}
  val docs=result.optJSONArray("documents")?:JSONArray();val ids=(0 until docs.length()).map{docs.getJSONObject(it).optString("id")}.toSet()
  store.documents().filter{it.second.optString("trip_id")==id&&it.second.optString("driver_id")==uid()&&!ids.contains(it.second.optString("id"))}.forEach{docs.put(it.second)}
  result.put("documents",docs);return result
 }
 fun route(trip:JSONObject,refresh:Boolean=false):JSONArray{
  val key="route-${uid()}-${trip.getString("id")}"
  if(refresh){val out=JSONArray();var offset=0
   while(true){val path="/rest/v1/trf_driver_location_history?driver_id=eq.${uid()}&or=(trip_id.eq.${trip.getString("id")},trip_id.is.null)&recorded_at=gte.${enc(trip.getString("started_at"))}"+(if(!trip.isNull("ended_at"))"&recorded_at=lte.${enc(trip.getString("ended_at"))}" else "")+"&vehicle=eq.${enc(trip.optString("vehicle"))}&order=recorded_at.asc,id.asc&limit=1000&offset=$offset&select=latitude,longitude,recorded_at,segment"
    val page=array(path);for(i in 0 until page.length())out.put(page.getJSONObject(i));if(page.length()<1000)break;offset+=1000
   };store.cache(key,JSONObject().put("points",out))
  }
  return store.cache(key).optJSONArray("points")?:JSONArray()
 }
 fun photo(path:String,bucket:String):ByteArray{
  // Download with the current user's token. The Storage policy rechecks ownership.
  val result=api.json("/storage/v1/object/sign/$bucket/$path",JSONObject().put("expiresIn",120))
  val signed=JSONObject(result).optString("signedURL")
  val url=if(signed.startsWith("http"))signed else Config.SUPABASE_URL+"/storage/v1"+signed
  return java.net.URL(url).openConnection().apply{connectTimeout=10000;readTimeout=20000}.getInputStream().use{it.readBytes()}
 }
 companion object{fun enc(s:String)=URLEncoder.encode(s,"UTF-8")}
}
