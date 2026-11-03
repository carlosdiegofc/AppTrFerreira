package uy.transportesferreira.gps
import kotlin.math.*

/**
 * Trips that start by themselves (decision of 3/11/2026, optional, off until the driver turns it on in Mi cuenta). When
 * the phone goes in a vehicle, or the app is open, the GPS looks for the truck moving at 15 km/h or more for 5 minutes;
 * a stop of up to 90 seconds (a traffic light, a toll) does not break it. Then a trip starts with the last truck, from
 * where it started to move. For 10 minutes it stays on the phone, and «No estoy al volante» throws it away without it
 * reaching the panel, and leaves the detection off for 8 hours.
 */
object Drive{
 const val MIN_KMH=15.0
 const val NEED_MS=5*60_000L
 /** A stop this long or shorter goes on with the same movement. */
 const val STOP_MS=90_000L
 /** Without a reading for this long the movement starts again. */
 const val LOST_MS=3*60_000L
 /** Without a trip after this long, the detection stops until the next time the phone goes in a vehicle. */
 const val GIVE_UP_MS=20*60_000L
 /** A trip that started by itself stays on the phone this long, for «No estoy al volante». */
 const val GRACE_MS=10*60_000L
 /** «No estoy al volante» leaves the detection off this long. */
 const val PAUSE_MS=8*3_600_000L

 /** Is the detection off now because the driver said «No estoy al volante»? */
 fun paused(until:Long,now:Long)=now<until
 /** Is this trip still in its 10 minutes on the phone? (grace_until, a local field of the trip that is never sent) */
 fun inGrace(graceUntil:Long,now:Long)=graceUntil>0&&now<graceUntil

 /**
  * Tells when the truck has moved for long enough: feed it every reading. It answers with the time the movement
  * started once it lasted NEED_MS, and null before. A reading without speed gets the speed from the previous reading.
  */
 class Detector{
  private var since:Long?=null;private var lastFast=0L;private var last:DoubleArray?=null;private var lastAt=0L
  /** Where the movement started: the first reading at speed. */
  var origin:DoubleArray?=null
   private set
  fun reset(){since=null;origin=null}
  fun add(lat:Double,lng:Double,kmh:Double?,time:Long):Long?{
   val prev=last;val prevAt=lastAt;last=doubleArrayOf(lat,lng);lastAt=time
   if(prev!=null&&time-prevAt>LOST_MS)reset()
   val speed=kmh?:if(prev!=null&&time>prevAt)meters(prev[0],prev[1],lat,lng)/((time-prevAt)/1000.0)*3.6 else return null
   if(speed>=MIN_KMH){
    if(since==null){since=time;origin=doubleArrayOf(lat,lng)}
    lastFast=time
   }else if(since!=null&&time-lastFast>STOP_MS)reset()
   val s=since?:return null
   return if(time-s>=NEED_MS)s else null
  }
 }
 fun meters(aLat:Double,aLng:Double,bLat:Double,bLng:Double):Double{
  val p=(bLat-aLat)*PI/180;val l=(bLng-aLng)*PI/180
  val h=sin(p/2).pow(2)+cos(aLat*PI/180)*cos(bLat*PI/180)*sin(l/2).pow(2)
  return 6371000*2*asin(sqrt(h.coerceIn(0.0,1.0)))
 }
}
