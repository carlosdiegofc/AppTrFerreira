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
            val trips=store.trips().filter{it.optString("driver_id")==uid}
            var failures=0
            for(t in trips){
              try{
                if(t.optInt("revision")<=t.optInt("synced_revision"))continue
                val body=JSONObject(t.toString());listOf("segment","revision","synced_revision","last_point","speed_kmh","synced_at","pending_documents").forEach{body.remove(it)}
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
            val points=store.points().filter{it.second.optString("driver_id")==uid}.take(250)
            if(points.isNotEmpty())try{
                api.request("/rest/v1/trf_driver_location_history?on_conflict=event_id","POST",JSONArray(points.map{it.second}).toString().toByteArray(),"resolution=ignore-duplicates")
                points.forEach{it.first.delete()}
            }catch(_:Exception){
                for((file,p) in points){
                    try{api.json("/rest/v1/trf_driver_location_history?on_conflict=event_id",p,"resolution=ignore-duplicates")
                    file.delete()}catch(_:Exception){failures++}
                }
            }
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
}
