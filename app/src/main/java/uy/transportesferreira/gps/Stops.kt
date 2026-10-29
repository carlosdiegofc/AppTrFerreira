package uy.transportesferreira.gps
import org.json.JSONObject
import java.time.Duration
import java.time.Instant

/**
 * The stops of a trip with several unloadings (decision of 29/10/2026). A stop is waiting, being unloaded (the driver
 * arrived) or done. An unloading ends when the driver says so, or when the truck moves off: more than 15 km/h for 30
 * seconds in a row, counting from the moment it started to move. Whichever happens first is what stays.
 */
object Stops{
 const val MOVE_KMH=15.0
 const val MOVE_MS=30_000L
 enum class State{WAITING,UNLOADING,DONE}
 fun state(s:JSONObject)=when{s.isNull("arrived_at")||s.optString("arrived_at").isBlank()->State.WAITING;s.isNull("finished_at")||s.optString("finished_at").isBlank()->State.UNLOADING;else->State.DONE}
 /** The stop being unloaded now, if any. */
 fun unloading(stops:List<JSONObject>)=stops.firstOrNull{state(it)==State.UNLOADING}
 /** The next one to arrive at: the first still waiting, in the order of the trip. */
 fun next(stops:List<JSONObject>)=stops.filter{state(it)==State.WAITING}.minByOrNull{it.optInt("position")}
 /** «Molino San José · San José», or whatever of the two there is. */
 fun title(s:JSONObject)=listOf(s.optString("client"),s.optString("place")).filter{it.isNotBlank()}.joinToString(" · ").ifBlank{"Parada ${s.optInt("position")}"}
 /** The name to put on a button: the client, or the place. */
 fun short(s:JSONObject)=s.optString("client").ifBlank{s.optString("place")}.ifBlank{"la parada ${s.optInt("position")}"}
 /** How long the unloading took (or has taken so far), in whole minutes; null while the truck has not arrived. */
 fun minutes(s:JSONObject,now:Long):Long?{
  val from=try{Instant.parse(s.getString("arrived_at")).toEpochMilli()}catch(_:Exception){return null}
  val to=if(s.isNull("finished_at"))now else try{Instant.parse(s.getString("finished_at")).toEpochMilli()}catch(_:Exception){return null}
  return Duration.ofMillis((to-from).coerceAtLeast(0)).toMinutes()
 }
 /**
  * Tells when the truck has moved off: feed it every reading while a stop is being unloaded. It answers with the time the
  * truck started to move once that went on for 30 seconds, and null before. A reading without speed changes nothing.
  */
 class Mover{
  private var since:Long?=null
  fun reset(){since=null}
  fun add(kmh:Double?,time:Long):Long?{
   if(kmh==null)return null
   if(kmh<MOVE_KMH){since=null;return null}
   val from=since?:time.also{since=it}
   return if(time-from>=MOVE_MS)from else null
  }
 }
}
