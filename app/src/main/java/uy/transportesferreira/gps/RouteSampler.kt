package uy.transportesferreira.gps

import kotlin.math.*

/**
 * Which readings the saved route keeps. The live position goes out with every reading (every 2 s); the route keeps one
 * every few seconds while the truck moves and one every 30 s while it is stopped, so the database and the driver's
 * data plan do not grow with the faster readings. A new segment (after a pause) always starts with a point.
 * It also keeps the reading where the truck turns, so the line on the map turns the corner instead of cutting across the
 * block, and the reading where it stops. During a stop it keeps only good readings next to that place, so neither the
 * jitter of a parked phone's GPS nor the driver walking around with the phone draws a star (decision of 19/10/2026).
 */
class RouteSampler(
    private val minSeconds:Double=5.0,private val minMeters:Double=20.0,private val idleSeconds:Double=30.0,
    /** A turn: the heading changed this much since the last kept reading, at least this far from it and this fast. */
    private val turnDegrees:Double=25.0,private val turnMeters:Double=8.0,private val turnKmh:Double=5.0,
    /** A stop starts below stillKmh and ends faster than leaveKmh or farther than stopMeters from where the truck stopped. */
    private val stillKmh:Double=3.0,private val leaveKmh:Double=8.0,private val stopMeters:Double=50.0,
    /** During a stop, the readings kept need a fix this good and to be this close to where the truck stopped. */
    private val stillAccuracy:Double=15.0,private val stillMeters:Double=12.0,
) {
    private var lat=0.0;private var lng=0.0;private var time=0L;private var segment=-1;private var started=false
    /** Heading of the last kept reading, when the truck was fast enough for the GPS heading to mean something. */
    private var heading:Double?=null
    /** Where the truck stopped, while it is stopped. */
    private var stopped=false;private var stopLat=0.0;private var stopLng=0.0
    fun reset(){started=false;heading=null;stopped=false}
    /** During a stop, whether a reading is left out: a poor fix, or away from where the truck stopped. */
    fun jitter(lat:Double,lng:Double,accuracy:Double?):Boolean=stopped&&((accuracy?:0.0)>stillAccuracy||meters(stopLat,stopLng,lat,lng)>stillMeters)
    fun keep(lat:Double,lng:Double,time:Long,segment:Int,speedKmh:Double?=null,accuracy:Double?=null,heading:Double?=null):Boolean {
        val poor=(accuracy?:0.0)>stillAccuracy
        // A trip (or a stretch after a pause) usually starts with the truck parked: that is where the stop is.
        if(!started||segment!=this.segment){stopped=speedKmh!=null&&speedKmh<stillKmh&&!poor;stopLat=lat;stopLng=lng;take(lat,lng,time,segment,speedKmh,heading);return true}
        val seconds=(time-this.time)/1000.0
        // A reading without speed changes nothing about the stop.
        var arrived=false
        if(speedKmh!=null){
            if(stopped&&(speedKmh>=leaveKmh||meters(stopLat,stopLng,lat,lng)>stopMeters))stopped=false
            else if(!stopped&&speedKmh<stillKmh&&!poor){stopped=true;stopLat=lat;stopLng=lng;arrived=true}
        }
        val ok=when{
            arrived->true
            stopped->seconds>=idleSeconds&&!jitter(lat,lng,accuracy)
            // A poor fix of a truck that is not moving: GPS jitter.
            speedKmh!=null&&speedKmh<stillKmh&&poor->false
            else->seconds>=idleSeconds||turned(lat,lng,speedKmh,heading)||(seconds>=minSeconds&&meters(this.lat,this.lng,lat,lng)>=minMeters)
        }
        if(ok)take(lat,lng,time,segment,speedKmh,heading)
        return ok
    }
    private fun take(lat:Double,lng:Double,time:Long,segment:Int,speedKmh:Double?,heading:Double?){
        this.lat=lat;this.lng=lng;this.time=time;this.segment=segment;started=true
        this.heading=if(heading!=null&&speedKmh!=null&&speedKmh>=turnKmh)heading else null
    }
    private fun turned(lat:Double,lng:Double,speedKmh:Double?,heading:Double?):Boolean{
        val before=this.heading
        if(before==null||heading==null||speedKmh==null||speedKmh<turnKmh)return false
        val change=abs(((heading-before)%360+540)%360-180)
        return change>=turnDegrees&&meters(this.lat,this.lng,lat,lng)>=turnMeters
    }
    private fun meters(aLat:Double,aLng:Double,bLat:Double,bLng:Double):Double {
        val phi=(bLat-aLat)*PI/180;val lambda=(bLng-aLng)*PI/180
        val h=sin(phi/2).pow(2)+cos(aLat*PI/180)*cos(bLat*PI/180)*sin(lambda/2).pow(2)
        return 6371000*2*asin(sqrt(h.coerceIn(0.0,1.0)))
    }
}
