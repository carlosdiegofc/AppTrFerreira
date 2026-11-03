package uy.transportesferreira.gps
import android.app.AlarmManager
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import java.time.Instant

/**
 * A watch on the GPS of the trip from outside its service (decision of 30/10/2026). Some phones put the app to sleep in
 * the background and its service stops reading without a word: on 30/10 a trip at 110 km/h had 17 minutes without
 * readings. The service moves this alarm forward every 10 seconds; if the service stops, the alarm goes off and, with
 * the trip going and no reading for a while, warns the driver with sound to open the app, which starts the GPS again.
 */
class GpsWatch:BroadcastReceiver(){
 override fun onReceive(c:Context,i:Intent?){
  val store=TripStore(c);val t=store.current()
  if(t==null||!t.optBoolean("active")||t.optBoolean("paused"))return
  val now=System.currentTimeMillis()
  val last=millis(t.optJSONObject("last_point")?.optString("recorded_at"))
  val minutes=Watch.silentMinutes(last,millis(t.optString("started_at"))?:now,now)
  if(minutes!=null){
   val text="El GPS del viaje no registra hace $minutes min · tocá para abrir la app"
   store.warning(text)
   val open=PendingIntent.getActivity(c,1,Intent(c,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
   try{val nm=c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    // The service makes this channel; a service the phone stopped before its first start may not have.
    nm.createNotificationChannel(android.app.NotificationChannel("gps-alert","Avisos del GPS",NotificationManager.IMPORTANCE_HIGH))
    nm.notify(8,android.app.Notification.Builder(c,"gps-alert").setContentTitle("El GPS del viaje se cortó")
    .setContentText(text).setStyle(android.app.Notification.BigTextStyle().bigText("$text. Si pasa seguido, en Mi cuenta › Revisar GPS están los pasos para que el teléfono no duerma la app."))
    .setContentIntent(open).setSmallIcon(android.R.drawable.ic_dialog_alert).setAutoCancel(true).build())}catch(_:Exception){}
  }
  // While the trip goes on without its service the warning comes back every so often.
  arm(c,Watch.AGAIN_MS)
 }
 companion object{
  private fun millis(v:String?)=try{if(v.isNullOrBlank())null else Instant.parse(v).toEpochMilli()}catch(_:Exception){null}
  private fun intent(c:Context)=PendingIntent.getBroadcast(c,0,Intent(c,GpsWatch::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)
  /** Sets the alarm (inexact, also with the phone dozing); each call moves it forward. */
  fun arm(c:Context,delay:Long=Watch.ARM_MS){
   try{(c.getSystemService(Context.ALARM_SERVICE) as AlarmManager).setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,System.currentTimeMillis()+delay,intent(c))}catch(_:Exception){}
  }
  fun cancel(c:Context){try{(c.getSystemService(Context.ALARM_SERVICE) as AlarmManager).cancel(intent(c))}catch(_:Exception){}}
 }
}

/** When a trip without readings counts as a GPS cut (GpsWatch). */
object Watch{
 /** The alarm goes off this long after the service last moved it forward. */
 const val ARM_MS=4*60_000L
 /** The warning again, while the GPS stays cut. */
 const val AGAIN_MS=10*60_000L
 /** Without a reading for this long the GPS counts as cut. */
 const val CUT_MS=3*60_000L
 /** Minutes without readings, counted from the last one (or the start of the trip), or null while it is not a cut. */
 fun silentMinutes(lastReading:Long?,started:Long,now:Long):Long?{
  val since=maxOf(lastReading?:started,started)
  val silent=now-since
  return if(silent>=CUT_MS)silent/60_000 else null
 }
}
