package uy.transportesferreira.gps

import kotlin.math.*

/** GPS distance estimate: reject stale, inaccurate and impossible jumps; reset on pause/restart. */
class DistanceTracker {
    data class Fix(val lat:Double,val lng:Double,val accuracy:Double,val time:Long)
    private var anchor:Fix?=null
    fun reset(){anchor=null}
    fun add(f:Fix,now:Long):Double {
        if(!f.lat.isFinite()||!f.lng.isFinite()||abs(f.lat)>90||abs(f.lng)>180||f.accuracy !in 0.0..50.0||now-f.time !in -2000..30000)return 0.0
        val a=anchor
        if(a==null){anchor=f;return 0.0}
        val seconds=(f.time-a.time)/1000.0
        if(seconds<=0)return 0.0
        if(seconds>90){anchor=f;return 0.0}
        val phi=(f.lat-a.lat)*PI/180;val lambda=(f.lng-a.lng)*PI/180
        val h=sin(phi/2).pow(2)+cos(a.lat*PI/180)*cos(f.lat*PI/180)*sin(lambda/2).pow(2)
        val meters=6371000*2*asin(sqrt(h.coerceIn(0.0,1.0)))
        if(meters/seconds>45){anchor=null;return 0.0}
        if(meters<max(5.0,max(a.accuracy,f.accuracy)))return 0.0
        anchor=f
        return meters
    }
}
