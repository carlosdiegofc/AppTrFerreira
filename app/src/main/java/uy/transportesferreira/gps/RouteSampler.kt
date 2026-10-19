package uy.transportesferreira.gps

import kotlin.math.*

/**
 * Which readings the saved route keeps. The live position goes out with every reading (every 2 s); the route keeps one
 * every few seconds while the truck moves and one every 30 s while it is stopped, so the database and the driver's
 * data plan do not grow with the faster readings. A new segment (after a pause) always starts with a point.
 */
class RouteSampler(private val minSeconds:Double=5.0,private val minMeters:Double=20.0,private val idleSeconds:Double=30.0) {
    private var lat=0.0;private var lng=0.0;private var time=0L;private var segment=-1;private var started=false
    fun reset(){started=false}
    fun keep(lat:Double,lng:Double,time:Long,segment:Int):Boolean {
        val seconds=(time-this.time)/1000.0
        val ok=!started||segment!=this.segment||seconds>=idleSeconds||(seconds>=minSeconds&&meters(this.lat,this.lng,lat,lng)>=minMeters)
        if(ok){this.lat=lat;this.lng=lng;this.time=time;this.segment=segment;started=true}
        return ok
    }
    private fun meters(aLat:Double,aLng:Double,bLat:Double,bLng:Double):Double {
        val phi=(bLat-aLat)*PI/180;val lambda=(bLng-aLng)*PI/180
        val h=sin(phi/2).pow(2)+cos(aLat*PI/180)*cos(bLat*PI/180)*sin(lambda/2).pow(2)
        return 6371000*2*asin(sqrt(h.coerceIn(0.0,1.0)))
    }
}
