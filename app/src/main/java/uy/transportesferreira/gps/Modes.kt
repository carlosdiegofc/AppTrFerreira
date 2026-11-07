package uy.transportesferreira.gps
import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.time.Instant

/**
 * The driver's modes (decision of 6/11/2026, migration 0015, table trf_driver_modes).
 * - Modo fantasma: until a date (or until it is turned off) the app does nothing: no trips, no GPS, no presence, no fuel
 *   or receipts. The driver or a panel account sets it; the phone reads the panel's on opening.
 * - Modo zafra: the trips that start by themselves (AutoTrip) work only with it on; the driver turns it on.
 * Kept on the phone so it works without signal, and sent to the panel when there is.
 */
object Modes{
 /** «Hasta que lo apague». */
 const val FOREVER=Long.MAX_VALUE
 private fun prefs(c:Context)=c.getSharedPreferences("modes",Context.MODE_PRIVATE)
 fun ghostUntil(c:Context)=prefs(c).getLong("ghost_until",0L)
 fun ghost(c:Context)=System.currentTimeMillis()<ghostUntil(c)
 /** Who turned it on: a ghost mode set from the panel is turned off only from the panel. */
 fun ghostBy(c:Context)=prefs(c).getString("ghost_by","")?:""
 fun zafra(c:Context)=AutoTrip.on(c)
 fun zafraSince(c:Context)=prefs(c).getLong("zafra_since",0L)

 /** Turns the ghost mode on until that time (FOREVER, or 0 to turn it off), and stops whatever the app was looking for. */
 fun setGhost(c:Context,until:Long){
  prefs(c).edit().putLong("ghost_until",until).putString("ghost_by",if(until>0)"chofer" else "").putBoolean("dirty",true).apply()
  if(until>System.currentTimeMillis())AutoTrip.stopLooking(c)
  push(c)
 }
 fun setZafra(c:Context,on:Boolean,driver:String){
  if(on)AutoTrip.turnOn(c,driver) else AutoTrip.turnOff(c)
  prefs(c).edit().putLong("zafra_since",if(on)System.currentTimeMillis() else 0L).putBoolean("dirty",true).apply()
  push(c)
 }

 private fun iso(ms:Long)=when{ms<=0L->JSONObject.NULL;ms==FOREVER->"infinity";else->Instant.ofEpochMilli(ms).toString()}
 private fun ms(v:Any?)=when{v==null||v==JSONObject.NULL->0L;v=="infinity"->FOREVER;else->try{Instant.parse(v.toString().replace(" ","T").let{if(it.endsWith("+00"))it+":00" else it}).toEpochMilli()}catch(_:Exception){try{java.time.OffsetDateTime.parse(v.toString()).toInstant().toEpochMilli()}catch(_:Exception){0L}}}

 /** Sends this phone's modes, in the background; a failure waits for the next time. */
 fun push(c:Context){
  Thread{try{
   val api=Api(c);val user=api.session()?.optJSONObject("user")?:return@Thread
   val row=JSONObject().put("driver_id",user.getString("id")).put("driver_name",AutoTrip.name(c))
    .put("ghost_until",iso(ghostUntil(c))).put("ghost_by",ghostBy(c).ifBlank{null}?:JSONObject.NULL)
    .put("zafra",zafra(c)).put("zafra_since",iso(zafraSince(c))).put("updated_at",Instant.now().toString())
   api.json("/rest/v1/trf_driver_modes?on_conflict=driver_id",row,"resolution=merge-duplicates")
   prefs(c).edit().putBoolean("dirty",false).apply()
  }catch(_:Exception){}}.start()
 }
 /** Reads the ghost mode a panel account may have set; a change made on the phone and not sent yet goes first. */
 fun pull(c:Context,done:()->Unit={}){
  Thread{try{
   if(prefs(c).getBoolean("dirty",false)){push(c);return@Thread}
   val api=Api(c);val user=api.session()?.optJSONObject("user")?:return@Thread
   val rows=JSONArray(api.request("/rest/v1/trf_driver_modes?driver_id=eq.${user.getString("id")}&select=ghost_until,ghost_by"))
   val until=if(rows.length()>0)ms(rows.getJSONObject(0).opt("ghost_until")) else 0L
   val by=if(rows.length()>0&&!rows.getJSONObject(0).isNull("ghost_by"))rows.getJSONObject(0).optString("ghost_by") else ""
   if(until!=ghostUntil(c)||by!=ghostBy(c)){
    prefs(c).edit().putLong("ghost_until",until).putString("ghost_by",by).apply()
    if(until>System.currentTimeMillis())AutoTrip.stopLooking(c)
    done()
   }
  }catch(_:Exception){}}.start()
 }
}
