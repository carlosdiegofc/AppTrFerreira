package uy.transportesferreira.gps
import android.Manifest
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.work.*
import org.json.JSONObject
import java.time.Duration
import java.time.LocalDate
import java.time.LocalDateTime
import java.util.concurrent.TimeUnit

/** The check of papers and services, every day at 8:00; each one sets the next. */
class ReminderWorker(c:Context,p:WorkerParameters):Worker(c,p){
 override fun doWork():Result{try{Reminders.papers(applicationContext)}catch(_:Exception){};Reminders.schedule(applicationContext,true);return Result.success()}
}

/**
 * The notices of the phone (decision of 28/10/2026), worked out on it with what it already has (Notices): papers and
 * services at 8:00, a trip that looks left open (GpsService), and the question about the receipt when a trip ends
 * (MainActivity). Each kind can be turned off in Mi cuenta, one setting per account. Nothing is sent anywhere.
 */
object Reminders{
 const val PAPERS="papeles";const val TRIP="viaje";const val RECEIPT="boleta"
 private const val CHANNEL="avisos";private const val PAPERS_ID=20;private const val TRIP_ID=21
 private fun prefs(c:Context)=c.getSharedPreferences("gps",Context.MODE_PRIVATE)
 /** What was told already: each paper or service with its state and date, and the trips told they had been on for long. */
 private fun told(c:Context)=c.getSharedPreferences("avisos",Context.MODE_PRIVATE)
 fun on(c:Context,kind:String,uid:String)=prefs(c).getBoolean("avisos-$kind-$uid",true)
 fun set(c:Context,kind:String,uid:String,value:Boolean)=prefs(c).edit().putBoolean("avisos-$kind-$uid",value).apply()
 /** Whether the phone lets the app show notifications at all. */
 fun allowed(c:Context)=(Build.VERSION.SDK_INT<33||c.checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)==PackageManager.PERMISSION_GRANTED)&&manager(c).areNotificationsEnabled()
 private fun manager(c:Context)=c.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
 private fun channel(c:Context)=manager(c).apply{createNotificationChannel(NotificationChannel(CHANNEL,"Avisos",NotificationManager.IMPORTANCE_DEFAULT).apply{description="Papeles y services por vencer, y viajes que quedaron abiertos"})}
 private fun open(c:Context,code:Int)=PendingIntent.getActivity(c,code,Intent(c,MainActivity::class.java),PendingIntent.FLAG_IMMUTABLE or PendingIntent.FLAG_UPDATE_CURRENT)

 /** The next check at 8:00. From the check itself it waits for that one to end; from the app it takes the place of the one waiting. */
 fun schedule(c:Context,fromCheck:Boolean=false){
  val now=LocalDateTime.now();var at=now.toLocalDate().atTime(8,0);if(!at.isAfter(now))at=at.plusDays(1)
  val request=OneTimeWorkRequestBuilder<ReminderWorker>().setInitialDelay(Duration.between(now,at).toMillis(),TimeUnit.MILLISECONDS).build()
  WorkManager.getInstance(c).enqueueUniqueWork("trf-avisos",if(fromCheck)ExistingWorkPolicy.APPEND_OR_REPLACE else ExistingWorkPolicy.REPLACE,request)
 }

 /** Papers and services that became close or late since the last check, in one notice; the latest ones when there is signal. */
 fun papers(c:Context){
  val user=Api(c).session()?.optJSONObject("user")?:return;val uid=user.optString("id")
  if(uid.isBlank()||!on(c,PAPERS,uid))return
  val data=MobileData(c)
  try{data.documents(true);data.maintenance(true)}catch(_:Exception){}
  fun day(o:JSONObject,key:String)=o.optString(key).takeIf{it.isNotBlank()&&it!="null"}?.let{try{LocalDate.parse(it.take(10))}catch(_:Exception){null}}
  val docs=data.documents();val services=data.maintenance()
  val items=Notices.due((0 until docs.length()).map{docs.getJSONObject(it)}.map{Notices.Paper(it.optString("id"),it.optString("scope"),it.optString("driver_id"),it.optString("driver_name"),it.optString("vehicle"),it.optString("kind"),day(it,"expires_on"))},
   (0 until services.length()).map{services.getJSONObject(it)}.map{Notices.Service(it.optString("id"),it.optString("vehicle"),it.optString("kind"),day(it,"due_on"),day(it,"done_on"))},
   LocalDate.now(),uid,prefs(c).getString("truck","")?:"",UiMode.owner(user.optString("email")))
  val key="seen-$uid";val seen=try{JSONObject(told(c).getString(key,"{}")?:"{}")}catch(_:Exception){JSONObject()}
  val fresh=Notices.fresh(items,seen.keys().asSequence().associateWith{seen.optString(it)})
  // Without notifications nothing counts as told, so it is told once they are turned on.
  if(fresh.isNotEmpty()){if(!allowed(c))return
   val first=fresh.first()
   val title=if(fresh.size==1)listOf(first.kind,first.owner).filter{it.isNotBlank()}.joinToString(" · ") else "${fresh.size} avisos de papeles y services"
   val text=if(fresh.size==1)first.detail else first.line
   val style=Notification.InboxStyle().also{s->fresh.take(6).forEach{s.addLine(it.line)};if(fresh.size>6)s.setSummaryText("Y ${fresh.size-6} más")}
   try{channel(c).notify(PAPERS_ID,Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_warning).setContentTitle(title).setContentText(text).setStyle(if(fresh.size==1)Notification.BigTextStyle().bigText(first.detail) else style)
    .setContentIntent(open(c,PAPERS_ID)).setAutoCancel(true).build())}catch(_:SecurityException){return}}
  told(c).edit().putString(key,JSONObject(items.associate{it.key to it.mark}).toString()).apply()
 }

 /** «¿Te olvidaste de finalizar el viaje?»: the 14 hours once for each trip; a long stop each time GpsService asks. */
 fun tripOpen(c:Context,why:Notices.Open,trip:JSONObject){
  if(!on(c,TRIP,trip.optString("driver_id"))||!allowed(c))return
  val long="long-${trip.optString("id")}"
  if(why==Notices.Open.LONG&&told(c).getBoolean(long,false))return
  val text=if(why==Notices.Open.LONG)"El viaje lleva 14 horas en curso. Si ya terminó, finalizalo en la app." else "El camión está detenido hace 2 horas y el viaje sigue en curso. Si terminó, finalizalo; si es una espera, pausalo."
  try{channel(c).notify(TRIP_ID,Notification.Builder(c,CHANNEL).setSmallIcon(R.drawable.ic_flag).setContentTitle("¿Te olvidaste de finalizar el viaje?").setContentText(text).setStyle(Notification.BigTextStyle().bigText(text))
   .setContentIntent(open(c,TRIP_ID)).setAutoCancel(true).build())}catch(_:SecurityException){return}
  if(why==Notices.Open.LONG)told(c).edit().putBoolean(long,true).apply()
 }
 /** A trip that ended takes its notice away. */
 fun tripClosed(c:Context)=manager(c).cancel(TRIP_ID)
}
