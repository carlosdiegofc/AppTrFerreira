package uy.transportesferreira.gps
import android.Manifest
import android.annotation.SuppressLint
import android.content.Context
import android.content.pm.PackageManager
import android.location.Location
import com.google.android.gms.location.LocationServices
import com.google.android.gms.location.Priority
import com.google.android.gms.tasks.CancellationTokenSource
import org.json.JSONObject
import java.time.Instant
import kotlin.concurrent.thread
/**
 * «Chofer activo» (decision of 18/10/2026): while the app is open the phone tells the panel, when it opens and every
 * 5 minutes, that the driver is active, with the app version, the truck saved on the phone and, without a trip and if
 * the driver accepted it, where the phone is. Nothing is sent with the app closed, and outside a trip the location is
 * never read in the background. One row per driver in trf_driver_presence; the server notes the time.
 */
object Presence {
    const val EVERY_MS=5*60_000L
    /** A notice that could not go out (no signal, an expired session) is tried again this soon. */
    const val RETRY_MS=30_000L
    /** Whether the app is on screen (MainActivity.onStart and onStop): nothing is sent with it closed. */
    @Volatile private var open=false
    @Volatile private var pending:CancellationTokenSource?=null
    fun opened(){open=true}
    /** The app left the screen: a position still being looked for is dropped, and nothing more goes out. */
    fun closed(){open=false;pending?.cancel();pending=null}
    /**
     * Sends the notice for the account signed in now. The position goes with it only while place() allows it (no trip in
     * progress and the driver's consent) and with the location permission. Both are asked again when the position
     * arrives: a trip that started, or a consent withdrawn, while it was being looked for sends the notice without it.
     * done(sent) is called on another thread.
     */
    fun send(c:Context,name:String,vehicle:String?,version:String,place:()->Boolean,done:(Boolean)->Unit){
        val uid=Api(c).session()?.optJSONObject("user")?.optString("id")?.takeIf{it.isNotBlank()}?:return done(false)
        if(!place()||!granted(c))thread{done(post(c,uid,name,vehicle,version,null))}
        else locate(c){fix->val still=fix?.takeIf{place()&&granted(c)};thread{done(post(c,uid,name,vehicle,version,still))}}
    }
    private fun granted(c:Context)=listOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION).any{c.checkSelfPermission(it)==PackageManager.PERMISSION_GRANTED}
    /**
     * One position, as precise as the battery allows: the trip has its own, every 2 seconds; this is only "where is he".
     * done runs on the main thread, where place() reads the trip and the consent. A request cancelled when the app left
     * the screen, or replaced by a newer one, answers nothing, even if the app is open again when its position arrives.
     */
    @SuppressLint("MissingPermission") private fun locate(c:Context,done:(Location?)->Unit){
        val token=CancellationTokenSource();pending=token
        fun finish(fix:Location?){if(pending!==token)return;pending=null;done(fix)}
        try{LocationServices.getFusedLocationProviderClient(c).getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY,token.token)
            .addOnSuccessListener{fix:Location?->finish(fix)}.addOnFailureListener{finish(null)}}
        catch(_:Exception){finish(null)}
    }
    private fun post(c:Context,uid:String,name:String,vehicle:String?,version:String,fix:Location?):Boolean{
        if(!open)return false
        return try{
            val api=Api(c)
            // The notice belongs to the account that started it: after a change of account it is dropped.
            if(api.session()?.optJSONObject("user")?.optString("id")!=uid)return false
            val row=JSONObject().put("driver_id",uid).put("driver_name",name.trim().take(100).ifBlank{"Chofer"})
                .put("vehicle",FleetStats.truck(vehicle)?.take(120)?:JSONObject.NULL).put("app_version",version.trim().take(40).ifBlank{"?"})
            // A position goes with the time it was taken; without one, the last one stays and the panel says how old it is.
            if(fix!=null&&FleetStats.validPosition(fix.latitude,fix.longitude))row.put("latitude",fix.latitude).put("longitude",fix.longitude)
                .put("accuracy_m",if(fix.hasAccuracy())fix.accuracy.toDouble() else JSONObject.NULL).put("located_at",Instant.ofEpochMilli(fix.time).toString())
            api.json("/rest/v1/trf_driver_presence?on_conflict=driver_id",row,"resolution=merge-duplicates")
            true
        }catch(_:Exception){false}
    }
}
