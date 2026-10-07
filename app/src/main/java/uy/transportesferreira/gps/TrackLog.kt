package uy.transportesferreira.gps

/** Text format of the local route file used by the live map: one "lat,lng,segment,time" line per fix. */
object TrackLog {
    fun line(lat:Double,lng:Double,segment:Int,time:Long)="$lat,$lng,$segment,$time\n"
    /** Reads only complete lines. Returns the points and how many bytes were consumed, so a half-written last line is read next time. */
    fun parse(bytes:ByteArray):Pair<List<DoubleArray>,Int>{
        val end=bytes.lastIndexOf('\n'.code.toByte())
        if(end<0)return Pair(emptyList(),0)
        val points=String(bytes,0,end,Charsets.UTF_8).lines().mapNotNull{l->
            val p=l.split(',')
            if(p.size!=4)null else try{doubleArrayOf(p[0].toDouble(),p[1].toDouble(),p[2].toDouble(),p[3].toDouble())}catch(_:NumberFormatException){null}
        }
        return Pair(points,end+1)
    }
}
