package uy.transportesferreira.gps
import kotlin.math.*

/**
 * Trips that start by themselves (decision of 3/11/2026, optional, off until the driver turns it on in Mi cuenta). When
 * the phone goes in a vehicle, or the app is open, the GPS looks for the truck moving at 15 km/h or more for 3 minutes;
 * a stop of up to 90 seconds (a traffic light, a toll) does not break it. Then a trip starts with the last truck, from
 * the place and the time where it started to move (above 3 km/h), with the readings of those minutes as its route.
 * The trip always starts and goes to the panel at once (decision of 3/11/2026: a driver who does not look at the phone
 * must not lose it; first it was 5 minutes and a 10-minute wait to throw it away). «No estoy al volante» only leaves the
 * detection off for 8 hours. With the option on, a trip ends by itself after more than an hour stopped
 * (decision of 3/11/2026), at the time and the place where the truck stopped.
 */
object Drive{
 const val MIN_KMH=15.0
 /** Above this the truck is moving: where the trip starts, before it reaches MIN_KMH. */
 const val MOVE_KMH=3.0
 /** A slow start longer than this (traffic) does not count: the trip starts where it reached MIN_KMH. */
 const val SLOW_START_MS=5*60_000L
 /** More than this stopped, with the option on, the trip ends by itself. */
 const val STOPPED_END_MS=60*60_000L
 const val NEED_MS=3*60_000L
 /** A stop this long or shorter goes on with the same movement. */
 const val STOP_MS=90_000L
 /** Without a reading for this long the movement starts again. */
 const val LOST_MS=3*60_000L
 /** Without a trip after this long, the detection stops until the next time the phone goes in a vehicle. */
 const val GIVE_UP_MS=20*60_000L
 /** No longer used since 3/11/2026 (a trip that started by itself is never thrown away): kept for trips saved before. */
 const val GRACE_MS=3*60_000L
 /** «No estoy al volante» leaves the detection off this long. */
 const val PAUSE_MS=8*3_600_000L

 /** Is the detection off now because the driver said «No estoy al volante»? */
 fun paused(until:Long,now:Long)=now<until
 /** Is this trip still in its 3 minutes on the phone? (grace_until, a local field of the trip that is never sent) */
 fun inGrace(graceUntil:Long,now:Long)=graceUntil>0&&now<graceUntil
 /** Does the trip end by itself now? More than an hour stopped; never while paused or while a stop is being unloaded. */
 fun endsStopped(movedAt:Long,now:Long,paused:Boolean,unloading:Boolean)=!paused&&!unloading&&now-movedAt>STOPPED_END_MS

 /**
  * Tells when the truck has moved for long enough: feed it every reading. It answers with the time the truck started to
  * move once it went at MIN_KMH for NEED_MS, and null before. A reading without speed gets the speed from the previous one.
  */
 class Detector{
  private var since:Long?=null;private var lastFast=0L;private var last:DoubleArray?=null;private var lastAt=0L
  // The first reading above MOVE_KMH since the truck was last still: where it started to move.
  private var moveFrom:Long?=null;private var moveOrigin:DoubleArray?=null;private var start=0L
  /** Where the truck started to move. */
  var origin:DoubleArray?=null
   private set
  fun reset(){since=null;origin=null;moveFrom=null;moveOrigin=null}
  fun add(lat:Double,lng:Double,kmh:Double?,time:Long):Long?{
   val prev=last;val prevAt=lastAt;last=doubleArrayOf(lat,lng);lastAt=time
   if(prev!=null&&time-prevAt>LOST_MS)reset()
   val speed=kmh?:if(prev!=null&&time>prevAt)meters(prev[0],prev[1],lat,lng)/((time-prevAt)/1000.0)*3.6 else return null
   if(speed<MOVE_KMH){moveFrom=null;moveOrigin=null}
   else if(moveFrom==null){moveFrom=time;moveOrigin=doubleArrayOf(lat,lng)}
   if(speed>=MIN_KMH){
    if(since==null){
     since=time;val from=moveFrom
     if(from!=null&&time-from<=SLOW_START_MS){start=from;origin=moveOrigin}else{start=time;origin=doubleArrayOf(lat,lng)}
    }
    lastFast=time
   }else if(since!=null&&time-lastFast>STOP_MS)reset()
   val s=since?:return null
   return if(time-s>=NEED_MS)start else null
  }
 }
 fun meters(aLat:Double,aLng:Double,bLat:Double,bLng:Double):Double{
  val p=(bLat-aLat)*PI/180;val l=(bLng-aLng)*PI/180
  val h=sin(p/2).pow(2)+cos(aLat*PI/180)*cos(bLat*PI/180)*sin(l/2).pow(2)
  return 6371000*2*asin(sqrt(h.coerceIn(0.0,1.0)))
 }
}
