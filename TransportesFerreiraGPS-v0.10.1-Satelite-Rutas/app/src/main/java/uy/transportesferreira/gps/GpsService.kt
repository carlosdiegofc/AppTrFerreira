package uy.transportesferreira.gps
import android.app.*
import android.content.Intent
import android.location.Location
import android.os.*
import com.google.android.gms.location.*
import org.json.JSONObject
import java.time.Instant
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
class GpsService:Service(){
 private lateinit var fused:FusedLocationProviderClient
 private lateinit var store:TripStore
 private val handler=Handler(Looper.getMainLooper());private val distance=DistanceTracker()
 private var callback:LocationCallback?=null;private var tripId:String?=null
 private val syncing=AtomicBoolean(false);private val executor=Executors.newSingleThreadExecutor()
 private val timer=object:Runnable{override fun run(){sync();handler.postDelayed(this,15000)}}
 override fun onBind(i:Intent?):IBinder?=null
 override fun onCreate(){super.onCreate();store=TripStore(this);fused=LocationServices.getFusedLocationProviderClient(this);(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel("gps","Viaje en curso",NotificationManager.IMPORTANCE_LOW))}
 override fun onStartCommand(i:Intent?,flags:Int,id:Int):Int{
  val t=store.current();if(t==null||!t.optBoolean("active")){stopSelf();return START_NOT_STICKY};notifyTrip(t.optBoolean("paused"))
  if(tripId!=t.getString("id")){distance.reset();tripId=t.getString("id")}
  when(i?.action){
   PAUSE->{store.update{it.put("paused",true).put("speed_kmh",0.0)};stopGps();distance.reset()}
   RESUME->{store.update{it.put("paused",false).put("segment",it.optInt("segment")+1)};distance.reset()}
   FINISH->{store.update{it.optJSONObject("last_point")?.let{p->it.put("arrival_lat",p.optDouble("latitude")).put("arrival_lng",p.optDouble("longitude"))};it.put("active",false).put("paused",false).put("ended_at",Instant.now().toString()).put("speed_kmh",0.0)};stopGps();Sync.schedule(this);sync();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY}
  }
  val paused=store.current()?.optBoolean("paused")?:false;notifyTrip(paused);if(paused)stopGps() else startGps();handler.removeCallbacks(timer);handler.post(timer);return START_STICKY
 }
 private fun notifyTrip(paused:Boolean){val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT);startForeground(7,Notification.Builder(this,"gps").setContentTitle(if(paused)"Viaje pausado" else "Viaje en curso").setContentText("${store.current()?.optString("vehicle")} · Tocá para abrir").setContentIntent(open).setSmallIcon(android.R.drawable.ic_menu_mylocation).setOngoing(true).build())}
 @Suppress("MissingPermission") private fun startGps(){if(callback!=null)return;callback=object:LocationCallback(){override fun onLocationResult(r:LocationResult){r.locations.forEach{record(it)}}};try{fused.requestLocationUpdates(LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY,5000).setMinUpdateIntervalMillis(3000).setWaitForAccurateLocation(true).build(),callback!!,mainLooper).addOnFailureListener{store.message("GPS no disponible · revisá los permisos");stopGps()}}catch(_:SecurityException){store.message("Falta permiso de ubicación precisa");stopGps()}}
 private fun stopGps(){callback?.let{fused.removeLocationUpdates(it)};callback=null}
 private fun record(l:Location){val t=store.current()?:return;if(!t.optBoolean("active")||t.optBoolean("paused")||!l.hasAccuracy()||l.accuracy>50||System.currentTimeMillis()-l.time !in -2000..30000)return
  val delta=distance.add(DistanceTracker.Fix(l.latitude,l.longitude,l.accuracy.toDouble(),l.time),System.currentTimeMillis())
  val p=JSONObject().put("event_id",UUID.randomUUID().toString()).put("trip_id",t.getString("id")).put("driver_id",t.getString("driver_id")).put("vehicle",t.getString("vehicle")).put("latitude",l.latitude).put("longitude",l.longitude).put("accuracy_m",l.accuracy.toDouble()).put("speed_kmh",if(l.hasSpeed())(l.speed*3.6).coerceAtLeast(0.0) else JSONObject.NULL).put("heading",if(l.hasBearing())l.bearing.toDouble() else JSONObject.NULL).put("recorded_at",Instant.ofEpochMilli(l.time).toString()).put("segment",t.optInt("segment"))
  store.addPoint(p);store.update{if(!it.has("origin_lat")){it.put("origin_lat",l.latitude).put("origin_lng",l.longitude)};it.put("distance_meters",it.optDouble("distance_meters",0.0)+delta).put("last_point",p).put("speed_kmh",p.optDouble("speed_kmh",0.0))};sync()
 }
 private fun sync(){if(syncing.compareAndSet(false,true))executor.execute{try{Sync.flush(this)}finally{syncing.set(false)}}}
 override fun onDestroy(){handler.removeCallbacksAndMessages(null);stopGps();executor.shutdown();super.onDestroy()}
 companion object{const val PAUSE="trf.PAUSE";const val RESUME="trf.RESUME";const val FINISH="trf.FINISH"}
}
