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
 * 5 minutes, that the driver is active, with the app version, the truck saved on the phone and, without a trip, where the
 * phone is. Nothing is sent with the app closed, and outside a trip the location is never read in the background.
 * One row per driver in trf_driver_presence; the server notes the time.
 */
object Presence {
    const val EVERY_MS=5*60_000L
    /** Sends the notice; without a trip and with the location permission, the position goes with it. */
    fun send(c:Context,name:String,vehicle:String?,version:String,onTrip:Boolean){
        val granted=listOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION).any{c.checkSelfPermission(it)==PackageManager.PERMISSION_GRANTED}
        if(onTrip||!granted)thread{post(c,name,vehicle,version,null)} else locate(c){fix->thread{post(c,name,vehicle,version,fix)}}
    }
    /** One position, as precise as the battery allows: the trip has its own, every 2 seconds; this is only "where is he". */
    @SuppressLint("MissingPermission") private fun locate(c:Context,done:(Location?)->Unit){
        try{LocationServices.getFusedLocationProviderClient(c).getCurrentLocation(Priority.PRIORITY_BALANCED_POWER_ACCURACY,CancellationTokenSource().token)
            .addOnSuccessListener{fix:Location?->done(fix)}.addOnFailureListener{done(null)}}
        catch(_:Exception){done(null)}
    }
    private fun post(c:Context,name:String,vehicle:String?,version:String,fix:Location?){
        try{
            val api=Api(c);val uid=api.session()?.optJSONObject("user")?.optString("id")?.takeIf{it.isNotBlank()}?:return
            val row=JSONObject().put("driver_id",uid).put("driver_name",name.trim().take(100).ifBlank{"Chofer"})
                .put("vehicle",FleetStats.truck(vehicle)?.take(120)?:JSONObject.NULL).put("app_version",version.trim().take(40).ifBlank{"?"})
            // A position goes with the time it was taken; without one, the last one stays and the panel says how old it is.
            if(fix!=null&&FleetStats.validPosition(fix.latitude,fix.longitude))row.put("latitude",fix.latitude).put("longitude",fix.longitude)
                .put("accuracy_m",if(fix.hasAccuracy())fix.accuracy.toDouble() else JSONObject.NULL).put("located_at",Instant.ofEpochMilli(fix.time).toString())
            api.json("/rest/v1/trf_driver_presence?on_conflict=driver_id",row,"resolution=merge-duplicates")
        }catch(_:Exception){}
    }
}
