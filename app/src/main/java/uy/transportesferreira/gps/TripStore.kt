package uy.transportesferreira.gps

import android.content.Context
import android.util.AtomicFile
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.time.LocalDate
import java.util.UUID

class TripStore(private val c:Context) {
    private val prefs=c.getSharedPreferences("trip-v7",Context.MODE_PRIVATE)
    private fun dir(name:String)=File(c.filesDir,name).apply{mkdirs()}
    private fun write(file:File,j:JSONObject){val a=AtomicFile(file);val out=a.startWrite();try{out.write(j.toString().toByteArray());a.finishWrite(out)}catch(e:Exception){a.failWrite(out);throw e}}
    private fun read(file:File):JSONObject?=try{JSONObject(AtomicFile(file).openRead().bufferedReader().use{it.readText()})}catch(_:Exception){null}
    fun current():JSONObject?=synchronized(lock){prefs.getString("current",null)?.let{read(File(dir("trips"),"$it.json"))}}
    fun save(trip:JSONObject)=synchronized(lock){write(File(dir("trips"),"${trip.getString("id")}.json"),trip);Unit}
    fun start(user:JSONObject,name:String,vehicle:String,empty:Boolean,details:JSONObject=JSONObject()):JSONObject=synchronized(lock){
        check(current()?.optBoolean("active")!=true){"Ya hay un viaje activo"}
        val t=JSONObject().put("id",UUID.randomUUID().toString()).put("driver_id",user.getString("id")).put("driver_name",name).put("vehicle",vehicle)
            .put("started_at",Instant.now().toString()).put("ended_at",JSONObject.NULL).put("active",true).put("paused",false)
            .put("load_type",if(empty)"empty" else "loaded").put("distance_meters",0.0).put("segment",0).put("revision",1).put("synced_revision",0)
        save(t)
        write(File(dir("details"),"${t.getString("id")}.json"),JSONObject().put("trip_id",t.getString("id")).put("driver_id",user.getString("id")).put("data",details).put("synced",false))
        check(prefs.edit().putString("current",t.getString("id")).commit());t
    }
    fun update(change:(JSONObject)->Unit):JSONObject?=synchronized(lock){val t=current()?:return@synchronized null;change(t);t.put("revision",t.optInt("revision")+1);save(t);t}
    fun trips()=synchronized(lock){dir("trips").listFiles()?.filter{it.extension=="json"}?.mapNotNull{read(it)}?.sortedBy{it.optString("started_at")} ?: emptyList()}
    fun addPoint(point:JSONObject)=synchronized(lock){write(File(dir("points"),"${point.getString("event_id")}.json"),point);Unit}
    fun points()=synchronized(lock){dir("points").listFiles()?.filter{it.extension=="json"}?.mapNotNull{f->read(f)?.let{Pair(f,it)}}?.sortedBy{it.second.optString("recorded_at")} ?: emptyList()}
    fun receipts()=synchronized(lock){dir("receipts").listFiles()?.filter{it.extension=="json"}?.mapNotNull{f->read(f)?.let{Pair(f,it)}} ?: emptyList()}
    fun receiptCount(id:String)=receipts().count{it.second.optString("trip_id")==id}
    fun pendingCount()=trips().count{it.optInt("revision")>it.optInt("synced_revision")}+points().size+receipts().count{!it.second.optBoolean("synced")}+documents().count{!it.second.optBoolean("synced")}+details().count{!it.second.optBoolean("synced")}
    fun records(folder:String)=synchronized(lock){dir(folder).listFiles()?.filter{it.extension=="json"}?.mapNotNull{f->read(f)?.let{Pair(f,it)}} ?: emptyList()}
    fun documents()=records("documents")
    fun details()=records("details")
    fun markSynced(file:File,j:JSONObject)=synchronized(lock){j.put("synced",true);write(file,j)}
    fun cache(key:String,value:JSONObject)=synchronized(lock){write(File(dir("cache-v8"),"$key.json"),value)}
    fun cache(key:String):JSONObject=synchronized(lock){read(File(dir("cache-v8"),"$key.json"))?:JSONObject()}
    fun saveReceipt(photo:File?,trip:JSONObject?,user:JSONObject,name:String,vehicle:String,fields:JSONObject):JSONObject=synchronized(lock){
        val id=UUID.randomUUID().toString();val uid=user.getString("id");val tid=trip?.getString("id")
        val r=JSONObject().put("id",id).put("trip_id",tid?:JSONObject.NULL).put("driver_id",uid).put("driver_name",name)
            .put("vehicle",InputRules.vehicle(trip?.optString("vehicle")?:vehicle)).put("recorded_at",Instant.now().toString()).put("receipt_date",fields.optString("receipt_date",LocalDate.now().toString()))
            .put("distance_meters",trip?.optDouble("distance_meters",0.0)?:0.0).put("object_path",JSONObject.NULL).put("synced",false)
            .put("station_id",fields.optString("station_id")).put("station_name",fields.optString("station_name")).put("liters",fields.opt("liters")?:JSONObject.NULL).put("total",fields.opt("total")?:JSONObject.NULL)
        if(photo!=null){val dest=File(dir("receipts"),"$id.jpg");photo.copyTo(dest);r.put("local_path",dest.absolutePath).put("object_path","$uid/${tid?:"standalone"}/$id.jpg")}
        write(File(dir("receipts"),"$id.json"),r);r
    }
    fun saveDocument(trip:JSONObject,fields:JSONObject,photo:File?):JSONObject=synchronized(lock){
        val id=UUID.randomUUID().toString();val uid=trip.getString("driver_id");val tid=trip.getString("id")
        val r=JSONObject().put("id",id).put("trip_id",tid).put("driver_id",uid).put("kind",fields.optString("kind","departure"))
            .put("number",fields.optString("number")).put("cargo_type",fields.optString("cargo_type")).put("kg",fields.opt("kg")?:JSONObject.NULL)
            .put("object_path",JSONObject.NULL).put("created_at",Instant.now().toString()).put("synced",false)
        if(photo!=null){val dest=File(dir("documents"),"$id.jpg");photo.copyTo(dest);r.put("local_path",dest.absolutePath).put("object_path","$uid/$tid/$id.jpg")}
        write(File(dir("documents"),"$id.json"),r);r
    }
    fun markTripSynced(id:String,revision:Int)=synchronized(lock){val f=File(dir("trips"),"$id.json");val t=read(f)?:return@synchronized;t.put("synced_revision",revision);write(f,t)}
    fun markReceiptSynced(file:File,r:JSONObject)=synchronized(lock){r.put("synced",true);write(file,r)}
    fun message(value:String){prefs.edit().putString("sync_message",value).apply()}
    fun message()=prefs.getString("sync_message","Esperando sincronización") ?: ""
    companion object{private val lock=Any()}
}
