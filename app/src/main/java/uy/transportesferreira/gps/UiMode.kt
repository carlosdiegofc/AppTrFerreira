package uy.transportesferreira.gps

/** How a driver uses the app. Simple mode has two screens: start a trip, and the trip in progress. */
object UiMode {
    const val SIMPLE="simple"
    const val NORMAL="normal"
    /** Anything that is not a saved choice means the driver still has to choose. */
    fun parse(saved:String?):String?=when(saved){SIMPLE,NORMAL->saved;else->null}
    /** Screen to open for a signed-in account. Owners keep the fleet panel and are never asked for a mode. */
    fun start(owner:Boolean,mode:String?,tripActive:Boolean):String=when{
        owner->"owner"
        parse(mode)==null->"mode"
        mode==SIMPLE->if(tripActive)"simpletrip" else "simplehome"
        tripActive->"trip"
        else->"home"
    }
}
