package uy.transportesferreira.gps
import android.Manifest
import android.app.*
import android.content.pm.PackageManager
import android.location.LocationManager
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
 private var watchSince=System.currentTimeMillis();private var lastRestart=0L
 private val syncing=AtomicBoolean(false);private val executor=Executors.newSingleThreadExecutor()
 private val timer=object:Runnable{override fun run(){sync();watchdog();handler.postDelayed(this,15000)}}
 override fun onBind(i:Intent?):IBinder?=null
 override fun onCreate(){super.onCreate();store=TripStore(this);fused=LocationServices.getFusedLocationProviderClient(this);(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel("gps","Viaje en curso",NotificationManager.IMPORTANCE_LOW));(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel("gps-alert","Avisos del GPS",NotificationManager.IMPORTANCE_HIGH))}
 override fun onStartCommand(i:Intent?,flags:Int,id:Int):Int{
  val t=store.current();if(t==null||!t.optBoolean("active")){stopSelf();return START_NOT_STICKY}
  // Android 12+ can refuse a foreground start from the background after the system killed the service.
  try{notifyTrip(t.optBoolean("paused"))}catch(_:Exception){store.warning("El GPS se detuvo en segundo plano · abrí la app para continuar");stopSelf();return START_NOT_STICKY}
  watchSince=System.currentTimeMillis()
  if(tripId!=t.getString("id")){distance.reset();tripId=t.getString("id")}
  when(i?.action){
   PAUSE->{store.update{it.put("paused",true).put("speed_kmh",0.0)};stopGps();distance.reset()}
   RESUME->{store.update{it.put("paused",false).put("segment",it.optInt("segment")+1)};distance.reset()}
   FINISH->{store.update{it.optJSONObject("last_point")?.let{p->it.put("arrival_lat",p.optDouble("latitude")).put("arrival_lng",p.optDouble("longitude"))};it.put("active",false).put("paused",false).put("ended_at",Instant.now().toString()).put("speed_kmh",0.0)};stopGps();Sync.schedule(this);sync();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY}
  }
  val paused=store.current()?.optBoolean("paused")?:false;try{notifyTrip(paused)}catch(_:Exception){};if(paused)stopGps() else startGps();handler.removeCallbacks(timer);handler.post(timer);return START_STICKY
 }
 private fun notifyTrip(paused:Boolean){val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT);startForeground(7,Notification.Builder(this,"gps").setContentTitle(if(paused)"Viaje pausado" else "Viaje en curso").setContentText(store.warning().ifBlank{"${store.current()?.optString("vehicle")} · Tocá para abrir"}).setContentIntent(open).setSmallIcon(android.R.drawable.ic_menu_mylocation).setOngoing(true).build())}
 @Suppress("MissingPermission") private fun startGps(){if(callback!=null)return;callback=object:LocationCallback(){override fun onLocationResult(r:LocationResult){r.locations.forEach{record(it)}}};try{fused.requestLocationUpdates(LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY,5000).setMinUpdateIntervalMillis(3000).setWaitForAccurateLocation(false).build(),callback!!,mainLooper).addOnFailureListener{store.message("GPS no disponible · revisá los permisos");stopGps()}}catch(_:SecurityException){store.message("Falta permiso de ubicación precisa");stopGps()}}
 private fun watchdog(){
  val t=store.current()?:return
  if(!t.optBoolean("active")||t.optBoolean("paused")){if(store.warning().isNotEmpty()){store.warning("");clearAlert()};return}
  val now=System.currentTimeMillis()
  val granted=checkSelfPermission(Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED
  val gpsOn=try{(getSystemService(LOCATION_SERVICE) as LocationManager).isProviderEnabled(LocationManager.GPS_PROVIDER)}catch(_:Exception){true}
  val lastFix=try{java.time.Instant.parse(t.optJSONObject("last_point")?.optString("recorded_at")?:t.getString("started_at")).toEpochMilli()}catch(_:Exception){now}
  val silent=(now-maxOf(lastFix,watchSince))/1000
  val warn=when{!granted->"Falta el permiso de ubicación precisa";!gpsOn->"El GPS del teléfono está apagado · activalo";silent>120->"Sin señal GPS hace ${silent/60} min";else->""}
  if(warn!=store.warning()){
   val had=store.warning().isNotEmpty();store.warning(warn);try{notifyTrip(false)}catch(_:Exception){}
   if(warn.isNotEmpty())alert(warn) else if(had)clearAlert()
  }
  // A location client that stops delivering fixes is restarted at most once a minute.
  if(granted&&gpsOn&&silent>60&&now-lastRestart>60000){lastRestart=now;stopGps();startGps()}
 }
 private fun alert(text:String){
  val open=PendingIntent.getActivity(this,1,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(8,Notification.Builder(this,"gps-alert").setContentTitle("Revisá el GPS del viaje").setContentText(text).setContentIntent(open).setSmallIcon(android.R.drawable.ic_dialog_alert).setAutoCancel(true).build())
 }
 private fun clearAlert(){(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).cancel(8)}
 private fun stopGps(){callback?.let{fused.removeLocationUpdates(it)};callback=null}
 private fun record(l:Location){val t=store.current()?:return;if(!t.optBoolean("active")||t.optBoolean("paused")||!l.hasAccuracy()||l.accuracy>50||System.currentTimeMillis()-l.time !in -2000..30000)return
  val delta=distance.add(DistanceTracker.Fix(l.latitude,l.longitude,l.accuracy.toDouble(),l.time),System.currentTimeMillis())
  val p=JSONObject().put("event_id",UUID.randomUUID().toString()).put("trip_id",t.getString("id")).put("driver_id",t.getString("driver_id")).put("vehicle",t.getString("vehicle")).put("latitude",l.latitude).put("longitude",l.longitude).put("accuracy_m",l.accuracy.toDouble()).put("speed_kmh",if(l.hasSpeed())(l.speed*3.6).coerceAtLeast(0.0) else JSONObject.NULL).put("heading",if(l.hasBearing())l.bearing.toDouble() else JSONObject.NULL).put("recorded_at",Instant.ofEpochMilli(l.time).toString()).put("segment",t.optInt("segment"))
  store.addPoint(p);store.appendTrack(t.getString("id"),l.latitude,l.longitude,t.optInt("segment"),l.time);store.update{if(!it.has("origin_lat")){it.put("origin_lat",l.latitude).put("origin_lng",l.longitude)};it.put("distance_meters",it.optDouble("distance_meters",0.0)+delta).put("last_point",p).put("speed_kmh",p.optDouble("speed_kmh",0.0))};sync()
 }
 private fun sync(){if(syncing.compareAndSet(false,true))executor.execute{try{Sync.flush(this)}finally{syncing.set(false)}}}
 override fun onDestroy(){handler.removeCallbacksAndMessages(null);stopGps();executor.shutdown();super.onDestroy()}
 companion object{const val PAUSE="trf.PAUSE";const val RESUME="trf.RESUME";const val FINISH="trf.FINISH"}
}
