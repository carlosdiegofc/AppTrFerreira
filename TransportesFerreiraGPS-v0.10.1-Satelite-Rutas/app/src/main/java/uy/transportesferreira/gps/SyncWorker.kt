package uy.transportesferreira.gps

import android.content.Context
import androidx.work.*
import org.json.JSONObject
import java.io.File
import java.util.concurrent.TimeUnit

class SyncWorker(c:Context,p:WorkerParameters):Worker(c,p){
    override fun doWork():Result = if(Sync.flush(applicationContext)) Result.success() else Result.retry()
}
object Sync {
    private val lock=Any()
    fun schedule(c:Context){
        val request=OneTimeWorkRequestBuilder<SyncWorker>().setConstraints(Constraints.Builder().setRequiredNetworkType(NetworkType.CONNECTED).build())
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL,15,TimeUnit.SECONDS).build()
        WorkManager.getInstance(c).enqueueUniqueWork("trf-sync",ExistingWorkPolicy.APPEND_OR_REPLACE,request)
    }
    fun flush(c:Context):Boolean=synchronized(lock){
        val store=TripStore(c);val api=Api(c)
        try{
            val uid=api.session()?.getJSONObject("user")?.getString("id") ?: return@synchronized false
            val trips=store.trips().filter{it.optString("driver_id")==uid}
            for(t in trips){
                if(t.optInt("revision")<=t.optInt("synced_revision"))continue
                val body=JSONObject(t.toString());listOf("segment","revision","synced_revision","last_point","speed_kmh").forEach{body.remove(it)}
                api.json("/rest/v1/trf_driver_tracking_sessions?on_conflict=id",body,"resolution=merge-duplicates")
                store.markTripSynced(t.getString("id"),t.optInt("revision"))
            }
            // The latest location belongs to the newest local trip only; never replay old locations over it.
            val latest=trips.lastOrNull()
            latest?.optJSONObject("last_point")?.let{p->
                val loc=JSONObject(p.toString());listOf("trip_id","event_id","segment").forEach{loc.remove(it)}
                loc.put("driver_name",latest.getString("driver_name")).put("is_tracking",latest.optBoolean("active")&&!latest.optBoolean("paused"))
                    .put("updated_at",java.time.Instant.now().toString())
                api.json("/rest/v1/trf_driver_locations?on_conflict=driver_id",loc,"resolution=merge-duplicates")
            }
            for((file,r) in store.details().filter{it.second.optString("driver_id")==uid&&!it.second.optBoolean("synced")}){
                val body=JSONObject(r.toString());body.remove("synced")
                api.json("/rest/v1/trf_trip_details?on_conflict=trip_id",body,"resolution=ignore-duplicates");store.markSynced(file,r)
            }
            fun upload(records:List<Pair<File,JSONObject>>,table:String,bucket:String){
                for((file,r) in records.filter{it.second.optString("driver_id")==uid&&!it.second.optBoolean("synced")}){
                    if(!r.isNull("object_path")){
                        val photo=File(r.getString("local_path"))
                        try{api.request("/storage/v1/object/$bucket/${r.getString("object_path")}","POST",photo.readBytes(),contentType="image/jpeg")}
                        catch(e:ApiError){if(e.status!=409 && !(e.status==400 && e.response.contains("Duplicate")))throw e}
                    }
                    val body=JSONObject(r.toString());body.remove("local_path");body.remove("synced")
                    api.json("/rest/v1/$table?on_conflict=id",body,"resolution=ignore-duplicates");store.markSynced(file,r)
                }
            }
            upload(store.receipts(),"trf_driver_fuel_receipts","trf-fuel-receipts")
            upload(store.documents(),"trf_trip_documents","trf-trip-documents")
            for((file,p) in store.points().filter{it.second.optString("driver_id")==uid}.take(250)){
                api.json("/rest/v1/trf_driver_location_history?on_conflict=event_id",p,"resolution=ignore-duplicates")
                file.delete()
            }
            val pending=store.pendingCount()
            store.message(if(pending==0)"Todo guardado en el panel" else "$pending registros pendientes de envío")
            pending==0
        }catch(e:Exception){store.message(if(e is ApiError && e.status==401)"Volvé a iniciar sesión para sincronizar" else "Guardado en el teléfono · reintentando envío");false}
    }
}
