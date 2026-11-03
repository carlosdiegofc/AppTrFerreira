package uy.transportesferreira.gps
import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import com.google.android.gms.location.ActivityRecognition
import com.google.android.gms.location.ActivityTransition
import com.google.android.gms.location.ActivityTransitionRequest
import com.google.android.gms.location.ActivityTransitionResult
import com.google.android.gms.location.DetectedActivity

/**
 * Trips that start by themselves (Drive, decision of 3/11/2026): off until the driver turns it on in Mi cuenta. Android
 * says when the phone goes in a vehicle (activity recognition, the «Actividad física» permission); then the GPS service
 * looks at the speed (GpsService.DETECT). With the location «Permitir todo el tiempo» that works with the app closed; without
 * it, a notification asks to open the app, and opening it is enough for the trip to start.
 */
object AutoTrip{
 const val NOT_DRIVING="trf.NOT_DRIVING"
 const val TRANSITION="trf.TRANSITION"
 /** The extra of the notification that opens the app to look for the trip (without «Permitir todo el tiempo»). */
 const val OPEN_EXTRA="trf_auto"
 private const val NOTE=9
 private fun prefs(c:Context)=c.getSharedPreferences("auto-trip",Context.MODE_PRIVATE)
 fun on(c:Context)=prefs(c).getBoolean("on",false)
 fun pausedUntil(c:Context)=prefs(c).getLong("until",0L)
 fun paused(c:Context)=Drive.paused(pausedUntil(c),System.currentTimeMillis())
 fun name(c:Context)=prefs(c).getString("name","")?.ifBlank{null}?:"Chofer"
 /** The truck of the last trip, kept by the app (MainActivity.saveTruck). */
 fun truck(c:Context)=c.getSharedPreferences("gps",Context.MODE_PRIVATE).getString("truck","")?:""
 private fun granted(c:Context,p:String)=ContextCompat.checkSelfPermission(c,p)==PackageManager.PERMISSION_GRANTED
 fun locationGranted(c:Context)=granted(c,Manifest.permission.ACCESS_FINE_LOCATION)
 fun backgroundGranted(c:Context)=Build.VERSION.SDK_INT<29||granted(c,Manifest.permission.ACCESS_BACKGROUND_LOCATION)
 fun activityGranted(c:Context)=Build.VERSION.SDK_INT<29||granted(c,Manifest.permission.ACTIVITY_RECOGNITION)
 /** On, not paused and with the location: the GPS may look for a trip. */
 fun ready(c:Context)=on(c)&&!paused(c)&&locationGranted(c)
 fun turnOn(c:Context,driver:String){prefs(c).edit().putBoolean("on",true).putString("name",driver).putLong("until",0L).apply();register(c)}
 fun turnOff(c:Context){prefs(c).edit().putBoolean("on",false).apply();unregister(c);stopLooking(c)}
 /** The name of the driver for the trips that start by themselves, kept fresh each time the app opens. */
 fun remember(c:Context,driver:String){if(on(c))prefs(c).edit().putString("name",driver).apply()}
 /** «No estoy al volante»: 8 hours without looking for trips. */
 fun pause(c:Context){prefs(c).edit().putLong("until",System.currentTimeMillis()+Drive.PAUSE_MS).apply();stopLooking(c)}
 fun resume(c:Context){prefs(c).edit().putLong("until",0L).apply()}
 private fun transitions(c:Context)=PendingIntent.getBroadcast(c,2,Intent(c,AutoTripReceiver::class.java).setAction(TRANSITION),
  // Activity recognition fills the intent with its result: it has to be mutable.
  PendingIntent.FLAG_UPDATE_CURRENT or (if(Build.VERSION.SDK_INT>=31)PendingIntent.FLAG_MUTABLE else 0))
 /** Asks Android to say when the phone goes in a vehicle and when it leaves it. */
 @Suppress("MissingPermission") fun register(c:Context){
  if(!on(c)||!activityGranted(c))return
  val request=ActivityTransitionRequest(listOf(
   ActivityTransition.Builder().setActivityType(DetectedActivity.IN_VEHICLE).setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_ENTER).build(),
   ActivityTransition.Builder().setActivityType(DetectedActivity.IN_VEHICLE).setActivityTransition(ActivityTransition.ACTIVITY_TRANSITION_EXIT).build()))
  try{ActivityRecognition.getClient(c).requestActivityTransitionUpdates(request,transitions(c))}catch(_:Exception){}
 }
 @Suppress("MissingPermission") fun unregister(c:Context){try{ActivityRecognition.getClient(c).removeActivityTransitionUpdates(transitions(c))}catch(_:Exception){}}
 /** The GPS looks at the speed: from the app, or from the background with «Permitir todo el tiempo». */
 fun look(c:Context){
  if(!ready(c)||TripStore(c).current()?.optBoolean("active")==true)return
  try{ContextCompat.startForegroundService(c,Intent(c,GpsService::class.java).setAction(GpsService.DETECT))}catch(_:Exception){ask(c)}
 }
 private fun stopLooking(c:Context){try{c.startService(Intent(c,GpsService::class.java).setAction(GpsService.DETECT_STOP))}catch(_:Exception){}}
 private fun manager(c:Context):NotificationManager{
  val nm=c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
  nm.createNotificationChannel(NotificationChannel("auto","Viajes automáticos",NotificationManager.IMPORTANCE_HIGH));return nm
 }
 private fun openApp(c:Context,extra:Boolean)=PendingIntent.getActivity(c,3,Intent(c,MainActivity::class.java).apply{if(extra)putExtra(OPEN_EXTRA,true)},PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
 private fun notDriving(c:Context)=Notification.Action.Builder(null,"No estoy al volante",PendingIntent.getBroadcast(c,4,Intent(c,AutoTripReceiver::class.java).setAction(NOT_DRIVING),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)).build()
 /** Without «Permitir todo el tiempo» the GPS cannot start from the background: opening the app is enough. */
 fun ask(c:Context){
  try{manager(c).notify(NOTE,Notification.Builder(c,"auto").setContentTitle("Parece que vas manejando").setContentText("Tocá para abrir la app: el viaje empieza solo con el último camión.")
   .setContentIntent(openApp(c,true)).addAction(notDriving(c)).setSmallIcon(android.R.drawable.ic_menu_mylocation).setAutoCancel(true).setTimeoutAfter(Drive.GIVE_UP_MS).build())}catch(_:Exception){}
 }
 /** A trip started by itself: for 10 minutes «No estoy al volante» throws it away. */
 fun started(c:Context,vehicle:String){
  try{manager(c).notify(NOTE,Notification.Builder(c,"auto").setContentTitle("Viaje iniciado solo").setContentText("$vehicle · Si no estás al volante, tocá «No estoy al volante» antes de 10 minutos.")
   .setStyle(Notification.BigTextStyle().bigText("$vehicle. El camión anduvo 5 minutos a más de 15 km/h. Si no estás al volante, tocá «No estoy al volante» antes de 10 minutos: el viaje se descarta y no llega al panel."))
   .setContentIntent(openApp(c,false)).addAction(notDriving(c)).setSmallIcon(android.R.drawable.ic_menu_mylocation).setAutoCancel(true).setTimeoutAfter(Drive.GRACE_MS).build())}catch(_:Exception){}
 }
 fun noTruck(c:Context){
  try{manager(c).notify(NOTE,Notification.Builder(c,"auto").setContentTitle("No se pudo iniciar el viaje solo").setContentText("Abrí la app y elegí el camión una vez: después los viajes empiezan solos.")
   .setContentIntent(openApp(c,false)).setSmallIcon(android.R.drawable.ic_dialog_alert).setAutoCancel(true).build())}catch(_:Exception){}
 }
 fun cancelNote(c:Context){try{(c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTE)}catch(_:Exception){}}
 /** «No estoy al volante», from the app or from the notification. */
 fun notDriving(c:Context){
  pause(c);cancelNote(c)
  try{c.startService(Intent(c,GpsService::class.java).setAction(GpsService.DISCARD))}catch(_:Exception){}
 }
}

/** What Android tells the app about the trips that start by themselves: the vehicle, «No estoy al volante», a restart. */
class AutoTripReceiver:BroadcastReceiver(){
 override fun onReceive(c:Context,i:Intent?){
  when(i?.action){
   Intent.ACTION_BOOT_COMPLETED,Intent.ACTION_MY_PACKAGE_REPLACED->AutoTrip.register(c)
   AutoTrip.NOT_DRIVING->AutoTrip.notDriving(c)
   AutoTrip.TRANSITION->{
    if(!ActivityTransitionResult.hasResult(i))return
    val events=ActivityTransitionResult.extractResult(i)?.transitionEvents?:return
    val last=events.lastOrNull{it.activityType==DetectedActivity.IN_VEHICLE}?:return
    if(last.transitionType==ActivityTransition.ACTIVITY_TRANSITION_ENTER){
     if(!AutoTrip.ready(c)||TripStore(c).current()?.optBoolean("active")==true)return
     if(AutoTrip.backgroundGranted(c))AutoTrip.look(c) else AutoTrip.ask(c)
    }else try{c.startService(Intent(c,GpsService::class.java).setAction(GpsService.DETECT_STOP))}catch(_:Exception){}
   }
  }
 }
}
