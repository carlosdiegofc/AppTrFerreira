package uy.transportesferreira.gps

import android.content.Context
import androidx.work.*
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

class SyncWorker(c:Context,p:WorkerParameters):Worker(c,p){
    override fun doWork():Result = if(Sync.flush(applicationContext)) Result.success() else Result.retry()
}
object Sync {
    private val lock=Any()
    /** live() and flush() both write the live row: one at a time, so a slower write never puts an older reading back. */
    private val liveLock=Any()
    fun schedule(c:Context){
        val request=OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,15,TimeUnit.SECONDS).build()
        WorkManager.getInstance(c).enqueueUniqueWork("trf-sync",ExistingWorkPolicy.APPEND_OR_REPLACE,request)
    }
    /** The row of trf_driver_locations for the newest local trip: where the truck is now, for the live maps. */
    private fun liveRow(latest:JSONObject?):JSONObject?=latest?.optJSONObject("last_point")?.let{p->
        val loc=JSONObject(p.toString());listOf("trip_id","event_id","segment").forEach{loc.remove(it)}
        loc.put("driver_name",latest.getString("driver_name")).put("is_tracking",latest.optBoolean("active")&&!latest.optBoolean("paused"))
            .put("updated_at",java.time.Instant.now().toString())
    }
    /** Writes the live row of the trip latest() returns, read only once the previous write has finished. */
    private fun putLive(api:Api,latest:()->JSONObject?){synchronized(liveLock){liveRow(latest())?.let{api.json("/rest/v1/trf_driver_locations?on_conflict=driver_id",it,"resolution=merge-duplicates")}}}
    /**
     * Only the latest position, right after each reading and without waiting for the rest of the sync (trip, route,
     * photos), so the live maps follow the truck within seconds. Failures wait for the next reading or for flush().
     */
    fun live(c:Context):Boolean=try{
        // The trip in progress only (reading every saved trip each time would cost battery); flush() covers the rest.
        val api=Api(c);val uid=api.session()?.getJSONObject("user")?.getString("id");val store=TripStore(c)
        putLive(api){store.current()?.takeIf{uid!=null&&it.optString("driver_id")==uid}}
        true
    }catch(_:Exception){false}
    fun flush(c:Context):Boolean=synchronized(lock){
        val store=TripStore(c);val api=Api(c)
        try{
            val uid=api.session()?.getJSONObject("user")?.getString("id") ?: return@synchronized false
            for(t in store.trips().filter{it.optString("driver_id")==uid})try{store.recoverDraftDocuments(t.getString("id"))}catch(_:Exception){}
            // Stretches without signal waiting for the road get it now, before the trip and the route go up with their meters and readings.
            for((_,g) in store.gaps().filter{it.second.optString("driver_id")==uid&&!it.second.optBoolean("resolved")})try{settle(c,store,g)}catch(_:Exception){}
            val trips=store.trips().filter{it.optString("driver_id")==uid}
            var failures=0
            for(t in trips){
              try{
                if(t.optInt("revision")<=t.optInt("synced_revision"))continue
                val body=JSONObject(t.toString());listOf("segment","revision","synced_revision","last_point","speed_kmh","synced_at","pending_documents","route_state").forEach{body.remove(it)}
                api.json("/rest/v1/trf_driver_tracking_sessions?on_conflict=id",body,"resolution=merge-duplicates")
                store.markTripSynced(t.getString("id"),t.optInt("revision"))
              }catch(_:Exception){failures++}
            }
            // The latest location belongs to the newest local trip only; never replay old locations over it. The trip is
            // read again here, not taken from the list above, which may be older than what live() sent meanwhile.
            try{putLive(api){store.trips().filter{it.optString("driver_id")==uid}.lastOrNull()}}catch(_:Exception){failures++}
            for((file,r) in store.details().filter{it.second.optString("driver_id")==uid&&!it.second.optBoolean("synced")}){
                try{val body=JSONObject(r.toString());body.remove("synced");body.remove("synced_at")
                api.json("/rest/v1/trf_trip_details?on_conflict=trip_id",body,"resolution=ignore-duplicates");store.markSynced(file,r)}catch(_:Exception){failures++}
            }
            // The route goes in one request per sync; if that fails, one by one, so a single bad reading does not hold the rest.
            // The estimated readings of a stretch go apart: a request sends the same fields in every reading.
            val points=store.points().filter{it.second.optString("driver_id")==uid}.take(250)
            for(group in points.partition{!it.second.optBoolean("estimated")}.toList().filter{it.isNotEmpty()})try{
                api.request("/rest/v1/trf_driver_location_history?on_conflict=event_id","POST",JSONArray(group.map{it.second}).toString().toByteArray(),"resolution=ignore-duplicates")
                group.forEach{it.first.delete()}
            }catch(_:Exception){
                for((file,p) in group){
                    try{api.json("/rest/v1/trf_driver_location_history?on_conflict=event_id",p,"resolution=ignore-duplicates")
                    file.delete()}catch(_:Exception){failures++}
                }
            }
            // A settled stretch goes up after its trip, which it belongs to, and is not kept on the phone.
            for((file,g) in store.gaps().filter{it.second.optString("driver_id")==uid&&it.second.optBoolean("resolved")})try{
                val body=JSONObject(g.toString());listOf("counted","resolved","found_at","asked_at").forEach{body.remove(it)}
                api.json("/rest/v1/trf_route_gaps?on_conflict=id",body,"resolution=ignore-duplicates");file.delete()
            }catch(_:Exception){failures++}
            fun upload(records:List<Pair<File,JSONObject>>,table:String,bucket:String){
                for((file,r) in records.filter{it.second.optString("driver_id")==uid&&!it.second.optBoolean("synced")}){
                    try{if(!r.isNull("object_path")){
                        val photo=File(r.getString("local_path"))
                        try{api.request("/storage/v1/object/$bucket/${r.getString("object_path")}","POST",photo.readBytes(),contentType="image/jpeg")}
                        catch(e:ApiError){if(e.status!=409 && !(e.status==400 && e.response.contains("Duplicate")))throw e}
                    }
                    val body=JSONObject(r.toString());body.remove("local_path");body.remove("synced");body.remove("synced_at")
                    api.json("/rest/v1/$table?on_conflict=id",body,"resolution=ignore-duplicates");store.markSynced(file,r)}catch(_:Exception){failures++}
                }
            }
            upload(store.receipts(),"trf_driver_fuel_receipts","trf-fuel-receipts")
            upload(store.documents(),"trf_trip_documents","trf-trip-documents")
            val pending=store.pendingCount()
            store.message(if(pending==0&&failures==0)"Todo guardado en el panel" else "$pending pendientes · $failures errores de envío; se reintentará")
            pending==0&&failures==0
        }catch(e:Exception){store.message(if(e is ApiError && e.status==401)"Volvé a iniciar sesión para sincronizar" else "Guardado en el teléfono · reintentando envío");false}
    }
    /**
     * A stretch without signal gets its road (Gaps.settle): Google's, or the straight line once Google answered without
     * one or after a day without an answer. Its estimated readings join the route, spread over the time without signal,
     * with ids made from the stretch's, so doing it again does not repeat them. Then the trip counts the stretch's meters.
     */
    private fun settle(c:Context,store:TripStore,g:JSONObject){
        val now=System.currentTimeMillis()
        if(now-g.optLong("asked_at")<Gaps.ASK_EVERY_MS)return
        val from=java.time.Instant.parse(g.getString("from_at")).toEpochMilli();val to=java.time.Instant.parse(g.getString("to_at")).toEpochMilli()
        val aLat=g.getDouble("from_lat");val aLng=g.getDouble("from_lng");val bLat=g.getDouble("to_lat");val bLng=g.getDouble("to_lng")
        val straight=g.optDouble("straight_meters")
        var road:Roads.Road?=null;var answered=false
        try{road=Roads.between(c,aLat,aLng,bLat,bLng);answered=true}catch(_:Exception){}
        val method=Gaps.settle(straight,to-from,road?.meters,answered,now-g.optLong("found_at",now))
        if(method==null){store.saveGap(g.put("asked_at",now));return}
        val path=if(method==Gaps.Method.ROUTE)road!!.path else listOf(doubleArrayOf(aLat,aLng))+Gaps.line(aLat,aLng,bLat,bLng)+listOf(doubleArrayOf(bLat,bLng))
        val gapId=g.getString("id")
        Gaps.timed(path,from,to).forEachIndexed{i,(at,time)->
            store.addPoint(JSONObject().put("event_id",java.util.UUID.nameUUIDFromBytes("$gapId:$i".toByteArray()).toString()).put("trip_id",g.getString("trip_id"))
                .put("driver_id",g.getString("driver_id")).put("vehicle",g.getString("vehicle")).put("latitude",at[0]).put("longitude",at[1])
                // Without precision, speed or heading: the observer of tolls and scales (0005) leaves it out.
                .put("accuracy_m",JSONObject.NULL).put("speed_kmh",JSONObject.NULL).put("heading",JSONObject.NULL)
                .put("recorded_at",java.time.Instant.ofEpochMilli(time).toString()).put("segment",g.optInt("segment")).put("estimated",true))
        }
        store.settleGap(g,if(method==Gaps.Method.ROUTE)road!!.meters else Gaps.straight(straight),method.db)
    }
}
