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
 private val handler=Handler(Looper.getMainLooper());private val distance=DistanceTracker();private val route=RouteSampler()
 private var callback:LocationCallback?=null;private var tripId:String?=null
 /** The reading before the last one, for the route: when the truck turns, it is the corner (RouteSampler.corner). */
 private var lastReading:JSONObject?=null
 private var watchSince=System.currentTimeMillis();private var lastRestart=0L
 // When the truck last moved, and whether its stop was already told (Notices.open): a trip that looks left open asks.
 private var movedAt=System.currentTimeMillis();private var toldStop=false
 // A stop being unloaded ends by itself when the truck moves off (Stops.Mover).
 private val mover=Stops.Mover()
 private val syncing=AtomicBoolean(false);private val executor=Executors.newSingleThreadExecutor()
 // The live position has its own line out, so it never waits behind the trip, the route or the photos.
 private val sendingLive=AtomicBoolean(false);private val liveExecutor=Executors.newSingleThreadExecutor();private var tripSentAt=0L
 // Each turn also moves the watch from outside forward (GpsWatch): it goes off only if this service stops.
 private val timer=object:Runnable{override fun run(){sync();watchdog();watch();handler.postDelayed(this,10000)}}
 override fun onBind(i:Intent?):IBinder?=null
 override fun onCreate(){super.onCreate();CrashLog.install(this);store=TripStore(this);fused=LocationServices.getFusedLocationProviderClient(this);(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel("gps","Viaje en curso",NotificationManager.IMPORTANCE_LOW));(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).createNotificationChannel(NotificationChannel("gps-alert","Avisos del GPS",NotificationManager.IMPORTANCE_HIGH))}
 override fun onStartCommand(i:Intent?,flags:Int,id:Int):Int{
  val t=store.current();if(t==null||!t.optBoolean("active")){stopSelf();return START_NOT_STICKY}
  // Android 12+ can refuse a foreground start from the background after the system killed the service.
  try{notifyTrip(t.optBoolean("paused"))}catch(_:Exception){store.warning("El GPS se detuvo en segundo plano · abrí la app para continuar");stopSelf();return START_NOT_STICKY}
  watchSince=System.currentTimeMillis()
  // A service the system started again goes on with the route's state kept with the trip (where it stopped, jitter, and
  // the trip's last reading, which may be the corner of a turn).
  if(tripId!=t.getString("id")){distance.reset();route.restore(t.optString("route_state"));lastReading=t.optJSONObject("last_point");tripId=t.getString("id")}
  when(i?.action){
   PAUSE->{GpsWatch.cancel(this);keepLast();store.update{it.put("paused",true).put("speed_kmh",0.0)};stopGps();distance.reset();sendLive();sync()}
   RESUME->{store.update{it.put("paused",false).put("segment",it.optInt("segment")+1)};distance.reset();movedAt=System.currentTimeMillis();toldStop=false;sync()}
   FINISH->{GpsWatch.cancel(this);keepLast();Reminders.tripClosed(this);store.update{it.optJSONObject("last_point")?.let{p->it.put("arrival_lat",p.optDouble("latitude")).put("arrival_lng",p.optDouble("longitude"))};it.put("active",false).put("paused",false).put("ended_at",Instant.now().toString()).put("speed_kmh",0.0)};stopGps();Sync.schedule(this);sync();stopForeground(STOP_FOREGROUND_REMOVE);stopSelf();return START_NOT_STICKY}
  }
  val paused=store.current()?.optBoolean("paused")?:false;try{notifyTrip(paused)}catch(_:Exception){};if(paused)stopGps() else startGps();handler.removeCallbacks(timer);handler.post(timer);return START_STICKY
 }
 private fun notifyTrip(paused:Boolean){val open=PendingIntent.getActivity(this,0,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT);startForeground(7,Notification.Builder(this,"gps").setContentTitle(if(paused)"Viaje pausado" else "Viaje en curso").setContentText(store.warning().ifBlank{"${store.current()?.optString("vehicle")} · Tocá para abrir"}).setContentIntent(open).setSmallIcon(android.R.drawable.ic_menu_mylocation).setOngoing(true).build())}
 @Suppress("MissingPermission") private fun startGps(){if(callback!=null)return;callback=object:LocationCallback(){override fun onLocationResult(r:LocationResult){r.locations.forEach{record(it)}}};try{fused.requestLocationUpdates(LocationRequest.Builder(Priority.PRIORITY_HIGH_ACCURACY,2000).setMinUpdateIntervalMillis(1000).setWaitForAccurateLocation(false).build(),callback!!,mainLooper).addOnFailureListener{store.message("GPS no disponible · revisá los permisos");stopGps()}}catch(_:SecurityException){store.message("Falta permiso de ubicación precisa");stopGps()}}
 private fun watchdog(){
  val t=store.current()?:return
  openCheck(t)
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
 /** A trip that looks left open asks whether to finish it: after 14 hours once, and once for each long stop without a pause. */
 private fun openCheck(t:JSONObject){
  if(!t.optBoolean("active"))return
  val started=try{Instant.parse(t.getString("started_at")).toEpochMilli()}catch(_:Exception){return}
  when(Notices.open(started,movedAt,System.currentTimeMillis(),t.optBoolean("paused"))){
   Notices.Open.LONG->Reminders.tripOpen(this,Notices.Open.LONG,t)
   Notices.Open.STOPPED->if(!toldStop){toldStop=true;Reminders.tripOpen(this,Notices.Open.STOPPED,t)}
   null->{}
  }
 }
 private fun watch(){val t=store.current();if(t!=null&&t.optBoolean("active")&&!t.optBoolean("paused"))GpsWatch.arm(this) else GpsWatch.cancel(this)}
 private fun alert(text:String){
  val open=PendingIntent.getActivity(this,1,Intent(this,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  (getSystemService(NOTIFICATION_SERVICE) as NotificationManager).notify(8,Notification.Builder(this,"gps-alert").setContentTitle("Revisá el GPS del viaje").setContentText(text).setContentIntent(open).setSmallIcon(android.R.drawable.ic_dialog_alert).setAutoCancel(true).build())
 }
 private fun clearAlert(){(getSystemService(NOTIFICATION_SERVICE) as NotificationManager).cancel(8)}
 private fun stopGps(){callback?.let{fused.removeLocationUpdates(it)};callback=null}
 private fun record(l:Location){val t=store.current()?:return;if(!t.optBoolean("active")||t.optBoolean("paused")||!l.hasAccuracy()||l.accuracy>50||System.currentTimeMillis()-l.time !in -2000..30000)return
  val delta=distance.add(DistanceTracker.Fix(l.latitude,l.longitude,l.accuracy.toDouble(),l.time),System.currentTimeMillis())
  if(!distance.accepted)return
  val filled=gap(t,l)
  val p=JSONObject().put("event_id",UUID.randomUUID().toString()).put("trip_id",t.getString("id")).put("driver_id",t.getString("driver_id")).put("vehicle",t.getString("vehicle")).put("latitude",l.latitude).put("longitude",l.longitude).put("accuracy_m",l.accuracy.toDouble()).put("speed_kmh",if(l.hasSpeed())(l.speed*3.6).coerceAtLeast(0.0) else JSONObject.NULL).put("heading",if(l.hasBearing())l.bearing.toDouble() else JSONObject.NULL).put("recorded_at",Instant.ofEpochMilli(l.time).toString()).put("segment",t.optInt("segment"))
  // The phone's own map draws every reading; the route sent to the panel keeps one every few seconds, the corners, and no
  // GPS jitter (RouteSampler). At a turn the reading before it, where the truck went round the corner, goes in first.
  store.appendTrack(t.getString("id"),l.latitude,l.longitude,t.optInt("segment"),l.time)
  val kmh=if(l.hasSpeed())(l.speed*3.6).coerceAtLeast(0.0) else null
  if((kmh?:0.0)>=Notices.MOVING_KMH){movedAt=System.currentTimeMillis();toldStop=false}
  unloadingCheck(t.getString("id"),kmh,l.time)
  if(route.keep(l.latitude,l.longitude,l.time,t.optInt("segment"),kmh,l.accuracy.toDouble(),if(l.hasBearing())l.bearing.toDouble() else null)){
   if(route.corner)lastReading?.let{store.addPoint(it)}
   store.addPoint(p)
  }
  lastReading=p
  // The trip (distance, last reading) goes up every 15 s, without waiting for the timer; a pause, a resume or the end go at once.
  // A stretch without signal just closed goes up at once too, so it gets its road.
  val now=System.currentTimeMillis();val send=filled!=null||now-tripSentAt>=15000;if(send)tripSentAt=now
  store.update(send){if(!it.has("origin_lat")){it.put("origin_lat",l.latitude).put("origin_lng",l.longitude)};it.put("distance_meters",it.optDouble("distance_meters",0.0)+delta+(filled?:0.0)).put("last_point",p).put("speed_kmh",p.optDouble("speed_kmh",0.0)).put("route_state",route.state())}
  sendLive();if(send)sync()
 }
 /** While a stop is being unloaded, the truck moving off ends it, from the moment it started to move. */
 private fun unloadingCheck(tripId:String,kmh:Double?,time:Long){
  val stop=Stops.unloading(store.stops(tripId))
  if(stop==null){mover.reset();return}
  val since=mover.add(kmh,time)?:return
  val arrived=try{Instant.parse(stop.getString("arrived_at")).toEpochMilli()}catch(_:Exception){0L}
  // A truck that was already moving when the driver arrived has not moved off yet: it counts from the arrival.
  if(since<arrived){mover.reset();return}
  store.finishStop(stop.getString("id"),"movimiento",Instant.ofEpochMilli(since));mover.reset();sync()
 }
 /**
  * A stretch without signal (Gaps): the reading before this one is in the same stretch of the trip, more than 90 seconds
  * ago and more than 300 m away. Up to 3 hours it is counted at once as the straight line and a fifth more, until the
  * sync gets Google's road (Sync.flush); a longer cut or a jump no truck could make is kept with nothing counted, for the
  * panel to check. Returns the meters counted, or null without a stretch.
  */
 private fun gap(t:JSONObject,l:Location):Double?{
  val prev=t.optJSONObject("last_point")?:return null
  if(prev.optInt("segment")!=t.optInt("segment"))return null
  val from=try{Instant.parse(prev.getString("recorded_at")).toEpochMilli()}catch(_:Exception){return null}
  val aLat=prev.optDouble("latitude");val aLng=prev.optDouble("longitude")
  if(!FleetStats.validPosition(aLat,aLng))return null
  val straight=Gaps.meters(aLat,aLng,l.latitude,l.longitude)
  val kind=Gaps.kind(from,l.time,straight)?:return null
  val meters=if(kind==Gaps.Kind.FILL)Gaps.straight(straight) else 0.0
  store.saveGap(JSONObject().put("id",UUID.randomUUID().toString()).put("trip_id",t.getString("id")).put("driver_id",t.getString("driver_id")).put("vehicle",t.getString("vehicle")).put("segment",t.optInt("segment"))
   .put("from_at",prev.getString("recorded_at")).put("to_at",Instant.ofEpochMilli(l.time).toString()).put("from_lat",aLat).put("from_lng",aLng).put("to_lat",l.latitude).put("to_lng",l.longitude)
   .put("straight_meters",straight).put("meters",meters).put("method",if(kind==Gaps.Kind.FILL)Gaps.Method.STRAIGHT.db else Gaps.Method.UNFILLED.db)
   .put("counted",meters).put("resolved",kind!=Gaps.Kind.FILL).put("found_at",System.currentTimeMillis()))
  return meters
 }
 /**
  * The route keeps a reading every few seconds, so the last one may not be in it: a pause or the end adds it, and the
  * route reaches where the truck stopped. It keeps its event_id, so a reading already queued or sent is not repeated.
  * A last reading the route left out as GPS jitter stays out.
  */
 private fun keepLast(){
  val p=store.current()?.optJSONObject("last_point")?:return
  // A reading without its id cannot go to the route without repeating itself; the end of the trip goes on anyway.
  if(p.optString("event_id").isBlank())return
  if(!route.jittery)try{store.addPoint(p)}catch(_:Exception){}
 }
 private fun sync(){if(syncing.compareAndSet(false,true))executor.execute{try{Sync.flush(this)}finally{syncing.set(false)}}}
 /** The latest reading to the live map; a reading that arrives while one is on its way goes with the next one. */
 private fun sendLive(){if(sendingLive.compareAndSet(false,true))try{liveExecutor.execute{try{Sync.live(this)}finally{sendingLive.set(false)}}}
  // A reading delivered while the service is closing has nowhere to go; flush() sends the trip's last one.
  catch(_:java.util.concurrent.RejectedExecutionException){sendingLive.set(false)}}
 override fun onDestroy(){handler.removeCallbacksAndMessages(null);stopGps();executor.shutdown();liveExecutor.shutdown();super.onDestroy()}
 companion object{const val PAUSE="trf.PAUSE";const val RESUME="trf.RESUME";const val FINISH="trf.FINISH"}
}
