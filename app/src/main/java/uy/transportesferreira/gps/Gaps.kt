package uy.transportesferreira.gps
import kotlin.math.*

/**
 * Stretches without signal (decision of 28/10/2026): when the GPS of a trip comes back after more than 90 seconds without
 * readings and the truck turned up more than 300 m away, the road between the two points is asked to Google, counted in
 * the trip and drawn as estimated. Up to 3 hours; a longer cut, or a jump no truck could make, stays unfilled, to be
 * checked in the panel. Pure functions.
 */
object Gaps{
 /** Without readings this long the trip lost the signal: the same 90 seconds that cut the line on the maps. */
 const val GAP_MS=90_000L
 /** Closer than this the truck did not go anywhere worth filling. */
 const val MIN_METERS=300.0
 const val MAX_MS=3*3600_000L
 /** No truck averages more than this between two readings. */
 const val MAX_KMH=120.0
 /** A road found must not average more than this either, or it is not the road it took. */
 const val ROUTE_MAX_KMH=130.0
 /** Without the road, the straight line and a fifth more for the bends. */
 const val STRAIGHT_FACTOR=1.2
 /** How long a stretch waits for the road (no signal, the service not enabled yet) before it keeps the straight line. */
 const val WAIT_ROUTE_MS=24*3600_000L
 /** While it waits, Google is asked again this often at most: the trip syncs every 15 seconds. */
 const val ASK_EVERY_MS=10*60_000L

 enum class Kind{FILL,UNFILLED}
 /** What a jump of meters after so long without readings is: a stretch to fill, one to leave for checking, or none. */
 fun kind(fromTime:Long,toTime:Long,meters:Double):Kind?{
  val ms=toTime-fromTime
  if(ms<=GAP_MS||meters<MIN_METERS)return null
  return if(ms>MAX_MS||kmh(meters,ms)>MAX_KMH+1e-9)Kind.UNFILLED else Kind.FILL
 }
 private fun kmh(meters:Double,ms:Long)=meters*3.6/(ms/1000.0)
 fun straight(meters:Double)=meters*STRAIGHT_FACTOR
 /** A road is taken when it is not shorter than the straight line and could be driven in the time there was. */
 fun routeOk(routeMeters:Double,straightMeters:Double,ms:Long)=routeMeters.isFinite()&&routeMeters>=straightMeters*0.95&&ms>0&&kmh(routeMeters,ms)<=ROUTE_MAX_KMH+1e-9

 /** How a stretch was filled, as trf_route_gaps.method keeps it. */
 enum class Method(val db:String){ROUTE("ruta"),STRAIGHT("recta"),UNFILLED("sin_rellenar")}
 /**
  * What a stretch to fill ends as: Google's road when it could be the one driven; the straight line when Google answered
  * without one, or gave one no truck could drive, or after a day without an answer; null while it waits.
  */
 fun settle(straightMeters:Double,ms:Long,road:Double?,answered:Boolean,waitedMs:Long):Method?=when{
  answered&&road!=null&&routeOk(road,straightMeters,ms)->Method.ROUTE
  answered||waitedMs>=WAIT_ROUTE_MS->Method.STRAIGHT
  else->null
 }

 fun meters(aLat:Double,aLng:Double,bLat:Double,bLng:Double):Double{
  val phi=(bLat-aLat)*PI/180;val lambda=(bLng-aLng)*PI/180
  val h=sin(phi/2).pow(2)+cos(aLat*PI/180)*cos(bLat*PI/180)*sin(lambda/2).pow(2)
  return 6371000*2*asin(sqrt(h.coerceIn(0.0,1.0)))
 }
 /**
  * The straight line between two points, a point every 500 m or so (at most 60), without the ends: at least the middle
  * one, so the stretch has an estimated reading that draws it.
  */
 fun line(aLat:Double,aLng:Double,bLat:Double,bLng:Double):List<DoubleArray>{
  val n=(meters(aLat,aLng,bLat,bLng)/500).toInt().coerceIn(2,60)
  return (1 until n).map{i->val f=i.toDouble()/n;doubleArrayOf(aLat+(bLat-aLat)*f,aLng+(bLng-aLng)*f)}
 }
 /**
  * The points of the road between the two readings, without the ends and thinned to at most 200, each with a time spread
  * between the two readings by the distance along it: the estimated readings keep the order of the trip. A road of two
  * points gets its middle one.
  */
 fun timed(path:List<DoubleArray>,fromTime:Long,toTime:Long):List<Pair<DoubleArray,Long>>{
  if(path.size<2||toTime-fromTime<3)return emptyList()
  val inner=if(path.size==2)listOf(doubleArrayOf((path[0][0]+path[1][0])/2,(path[0][1]+path[1][1])/2)) else path.subList(1,path.size-1).let{p->if(p.size<=200)p else p.indices.filter{it%(ceil(p.size/200.0).toInt())==0}.map{p[it]}}
  val all=listOf(path.first())+inner+listOf(path.last())
  val cum=DoubleArray(all.size);for(i in 1 until all.size)cum[i]=cum[i-1]+meters(all[i-1][0],all[i-1][1],all[i][0],all[i][1])
  val total=cum.last().takeIf{it>0}?:return emptyList()
  return (1 until all.size-1).map{i->Pair(all[i],fromTime+((toTime-fromTime)*(cum[i]/total)).toLong().coerceIn(1L,toTime-fromTime-1))}
 }
 /** A reading of a saved route, to draw it: estimated when it is the road of a stretch without signal. */
 class Reading(val lat:Double,val lng:Double,val segment:Int,val time:Long?,val estimated:Boolean=false)
 enum class Link{NONE,SOLID,DASHED}
 /**
  * How two readings in a row are joined on a map. A new stretch of the trip (after a pause) leaves the line open. An
  * estimated road goes dashed. Without readings for more than 90 seconds the two ends are joined dashed too, unless the
  * cut was one left unfilled (more than 3 hours, or a jump no truck could make): while the road is not there yet, or
  * on trips of before, the line still goes on.
  */
 fun link(a:Reading,b:Reading):Link{
  if(a.segment!=b.segment)return Link.NONE
  if(a.estimated||b.estimated)return Link.DASHED
  if(a.time==null||b.time==null||b.time-a.time<=GAP_MS)return Link.SOLID
  return if(kind(a.time,b.time,meters(a.lat,a.lng,b.lat,b.lng))==Kind.UNFILLED)Link.NONE else Link.DASHED
 }
 /** The lines of a route, as the first and last reading of each (by position in the list) and whether it is dashed. */
 fun runs(list:List<Reading>):List<Triple<Int,Int,Boolean>>{
  val out=mutableListOf<Triple<Int,Int,Boolean>>();var start=0;var kind=Link.NONE
  for(i in 1 until list.size){val k=link(list[i-1],list[i])
   if(k!=kind){if(kind!=Link.NONE)out.add(Triple(start,i-1,kind==Link.DASHED));start=i-1;kind=k}
  }
  if(kind!=Link.NONE)out.add(Triple(start,list.size-1,kind==Link.DASHED))
  return out
 }
 /** Google's encoded polyline («Encoded Polyline Algorithm Format»), as latitude and longitude pairs. */
 fun decode(encoded:String):List<DoubleArray>{
  val out=mutableListOf<DoubleArray>();var i=0;var lat=0;var lng=0
  fun next():Int?{var shift=0;var result=0
   while(true){if(i>=encoded.length)return null;val b=encoded[i++].code-63;result=result or ((b and 0x1f) shl shift);shift+=5;if(b<0x20)break}
   return if(result and 1!=0)(result shr 1).inv() else result shr 1}
  while(i<encoded.length){val dLat=next()?:break;val dLng=next()?:break;lat+=dLat;lng+=dLng;out.add(doubleArrayOf(lat/1e5,lng/1e5))}
  return out
 }
}
