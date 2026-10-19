package uy.transportesferreira.gps

import kotlin.math.*

/**
 * Which readings the saved route keeps. The live position goes out with every reading (every 2 s); the route keeps one
 * every few seconds while the truck moves and one every 30 s while it is stopped, so the database and the driver's
 * data plan do not grow with the faster readings. A new segment (the trip or a stretch after a pause) starts with a point:
 * its first reading that is not GPS jitter.
 * It also keeps where the truck turns: the reading where the heading changed and the one just before it, where the truck
 * went round the corner, so the line on the map turns the corner instead of cutting across the block; and the reading
 * where it stops. During a stop it keeps only good readings next to that place, so neither the jitter of a parked phone's
 * GPS nor the driver walking around with the phone draws a star (decision of 19/10/2026).
 */
class RouteSampler(
    private val minSeconds:Double=5.0,private val minMeters:Double=20.0,private val idleSeconds:Double=30.0,
    /** A turn: the heading changed this much since the last kept reading, at least this far from it and this fast. */
    private val turnDegrees:Double=25.0,private val turnMeters:Double=8.0,private val turnKmh:Double=5.0,
    /**
     * A stop starts below stillKmh and ends faster than leaveKmh or farther than stopMeters from where the truck stopped,
     * counting the reading's own error, so a poor fix does not end it and a reading without speed can.
     */
    private val stillKmh:Double=3.0,private val leaveKmh:Double=8.0,private val stopMeters:Double=50.0,
    /** During a stop, the readings kept need a fix this good and to be this close to where the truck stopped. */
    private val stillAccuracy:Double=15.0,private val stillMeters:Double=12.0,
) {
    private var lat=0.0;private var lng=0.0;private var time=0L;private var segment=-1;private var started=false
    /** Heading of the last kept reading, when the truck was fast enough for the GPS heading to mean something. */
    private var heading:Double?=null
    /** Where the truck stopped, while it is stopped. */
    private var stopped=false;private var stopLat=0.0;private var stopLng=0.0
    /** The reading before this one was left out only by the time and distance rules, so it can be the corner of a turn. */
    private var held=false
    /**
     * The last reading was left out as GPS jitter: a poor fix of a truck that is not moving, or, during a stop, a poor fix
     * or one away from where the truck stopped. The last reading at a pause or at the end stays out too.
     */
    var jittery=false;private set
    /** The reading just kept comes after a turn: the one before it, where the truck went round the corner, goes in first. */
    var corner=false;private set
    fun reset(){started=false;heading=null;stopped=false;held=false;jittery=false;corner=false}
    /** What the sampler knows, as text kept with the trip: a service the system starts again goes on from there. */
    fun state():String=listOf(if(started)1 else 0,segment,lat,lng,time,heading?:"",if(stopped)1 else 0,stopLat,stopLng,if(jittery)1 else 0).joinToString(";")
    /** Goes on from a state saved by state(); anything it cannot read starts over. */
    fun restore(state:String?){
        reset()
        val f=state?.split(';')?:return
        if(f.size!=10)return
        try{
            segment=f[1].toInt();lat=f[2].toDouble();lng=f[3].toDouble();time=f[4].toLong();heading=f[5].takeIf{it.isNotEmpty()}?.toDouble()
            stopLat=f[7].toDouble();stopLng=f[8].toDouble();stopped=f[6]=="1";jittery=f[9]=="1";started=f[0]=="1"
        }catch(_:NumberFormatException){reset()}
    }
    fun keep(lat:Double,lng:Double,time:Long,segment:Int,speedKmh:Double?=null,accuracy:Double?=null,heading:Double?=null):Boolean {
        val poor=(accuracy?:0.0)>stillAccuracy
        corner=false
        if(!started||segment!=this.segment){
            held=false
            // The first fixes after the GPS starts are often poor: with the truck not moving, the stretch waits for a good one.
            jittery=speedKmh!=null&&speedKmh<stillKmh&&poor
            if(jittery)return false
            // A trip (or a stretch after a pause) usually starts with the truck parked: that is where the stop is.
            stopped=speedKmh!=null&&speedKmh<stillKmh;stopLat=lat;stopLng=lng
            take(lat,lng,time,segment,speedKmh,heading);return true
        }
        val seconds=(time-this.time)/1000.0
        var arrived=false
        if(stopped&&((speedKmh!=null&&speedKmh>=leaveKmh)||meters(stopLat,stopLng,lat,lng)-(accuracy?:0.0)>stopMeters))stopped=false
        else if(!stopped&&speedKmh!=null&&speedKmh<stillKmh&&!poor){stopped=true;stopLat=lat;stopLng=lng;arrived=true}
        jittery=!arrived&&(if(stopped)poor||meters(stopLat,stopLng,lat,lng)>stillMeters else speedKmh!=null&&speedKmh<stillKmh&&poor)
        val turn=!arrived&&!stopped&&!jittery&&turned(lat,lng,speedKmh,heading)
        val ok=when{
            arrived->true
            jittery->false
            stopped->seconds>=idleSeconds
            else->turn||seconds>=idleSeconds||(seconds>=minSeconds&&meters(this.lat,this.lng,lat,lng)>=minMeters)
        }
        corner=ok&&turn&&held
        held=!ok&&!jittery&&!stopped
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
