package uy.transportesferreira.gps

/**
 * The games are for the waits (decision of 21/10/2026): they open with the truck stopped. Without a trip in progress, or
 * with the trip paused, they always open; during a trip, when the latest GPS reading is recent and slow. While a game is
 * open the app asks again every few seconds, and when the truck moves it saves the game and closes it.
 */
object Parked {
    /** Below this speed the truck counts as stopped: a still phone reads a few km/h of noise. */
    const val STOPPED_KMH=5.0
    /** A reading older than this says nothing about now. */
    const val FRESH_MS=120_000L
    /** How often an open game asks again. */
    const val CHECK_MS=5_000L

    enum class State(val allowed:Boolean){NO_TRIP(true),PAUSED(true),STOPPED(true),MOVING(false),NO_SIGNAL(false)}

    /** readingAt and speedKmh are those of the trip's latest GPS reading, null without one or without a speed. */
    fun state(active:Boolean,paused:Boolean,readingAt:Long?,speedKmh:Double?,now:Long):State=when{
        !active->State.NO_TRIP
        paused->State.PAUSED
        readingAt==null||speedKmh==null||speedKmh.isNaN()||now-readingAt>FRESH_MS->State.NO_SIGNAL
        speedKmh>=STOPPED_KMH->State.MOVING
        else->State.STOPPED
    }
}
