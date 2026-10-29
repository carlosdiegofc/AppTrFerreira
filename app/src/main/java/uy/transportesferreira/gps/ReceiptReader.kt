package uy.transportesferreira.gps
import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.util.Base64
import com.google.mlkit.vision.common.InputImage
import com.google.mlkit.vision.text.TextRecognition
import com.google.mlkit.vision.text.latin.TextRecognizerOptions
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.io.File
import java.time.LocalDate
import kotlin.concurrent.thread
import kotlin.math.max

/**
 * Reads the photo of a fuel receipt (decision of 29/10/2026). First on the phone, with Google's text reader: no network,
 * and the photo does not leave the phone. When that does not find litres and a total that agree, the photo goes to the
 * function leer-boleta of Supabase, which reads it with Claude. Whatever is read only fills the form: the driver confirms.
 */
object ReceiptReader{
 class Result(val reading:ReceiptText.Reading,val station:String?,val source:Source)
 enum class Source(val label:String){PHONE("el teléfono"),AI("la inteligencia artificial")}

 /** done runs on any thread, with null when nothing could be read. */
 fun read(c:Context,api:Api,photo:File,stations:List<String>,today:LocalDate,done:(Result?)->Unit){
  val recognizer=TextRecognition.getClient(TextRecognizerOptions.DEFAULT_OPTIONS)
  val image=try{InputImage.fromFilePath(c,Uri.fromFile(photo))}catch(_:Exception){return fallback(api,photo,null,stations,done)}
  recognizer.process(image)
   .addOnSuccessListener{t->
    val reading=ReceiptText.parse(t.text,today)
    val phone=Result(reading,ReceiptText.station(t.text,stations),Source.PHONE)
    if(ReceiptText.clear(reading))done(phone) else fallback(api,photo,phone,stations,done)
    recognizer.close()}
   .addOnFailureListener{recognizer.close();fallback(api,photo,null,stations,done)}
 }
 /** The AI reads it; if it cannot (no signal, not enabled yet), what the phone found is still better than nothing. */
 private fun fallback(api:Api,photo:File,phone:Result?,stations:List<String>,done:(Result?)->Unit){
  thread{
   val ai=try{ask(api,photo,stations)}catch(_:Exception){null}
   done(ai?:phone?.takeIf{it.reading.liters!=null||it.reading.total!=null||it.reading.date!=null})
  }
 }
 private fun ask(api:Api,photo:File,stations:List<String>):Result?{
  val opts=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(photo.path,opts)
  var sample=1;while(max(opts.outWidth,opts.outHeight)/sample>1800)sample*=2
  val bmp=BitmapFactory.decodeFile(photo.path,BitmapFactory.Options().apply{inSampleSize=sample})?:return null
  val bytes=ByteArrayOutputStream().also{bmp.compress(Bitmap.CompressFormat.JPEG,82,it);bmp.recycle()}.toByteArray()
  val body=JSONObject().put("image",Base64.encodeToString(bytes,Base64.NO_WRAP)).put("media_type","image/jpeg")
  val answer=JSONObject(api.request("/functions/v1/leer-boleta","POST",body.toString().toByteArray()))
  return parseAnswer(answer,stations)
 }
 /** The function's answer as a reading; a number that is not one, or a day that is not real, is left out. */
 fun parseAnswer(a:JSONObject,stations:List<String>):Result?{
  fun num(k:String)=if(a.isNull(k))null else a.optDouble(k,Double.NaN).takeIf{it.isFinite()&&it>0.0}
  val date=a.optString("date").takeIf{it.isNotBlank()&&it!="null"}?.let{try{LocalDate.parse(it)}catch(_:Exception){null}}
  val reading=ReceiptText.Reading(num("liters"),num("total"),num("price"),date)
  if(reading.liters==null&&reading.total==null&&date==null)return null
  val said=a.optString("station").takeIf{it.isNotBlank()&&it!="null"}
  return Result(reading,said?.let{ReceiptText.station(it,stations)},Source.AI)
 }
}
