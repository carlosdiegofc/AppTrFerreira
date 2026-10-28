package uy.transportesferreira.gps
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest

/**
 * The road between the two ends of a stretch without signal (Gaps), from Google's Routes API (decision of 28/10/2026),
 * with the same key of the build as the map. The key only works for this app: Google checks the package name and the
 * fingerprint of the app's signature, which go with the request. Only the two places go to Google, nothing of the
 * driver or the trip.
 */
object Roads{
 class Road(val meters:Double,val path:List<DoubleArray>)
 private const val KEY="com.google.android.geo.API_KEY"
 /** Google's answer: its road between the two places, or null when it has none. Throws when Google could not be asked. */
 fun between(c:Context,aLat:Double,aLng:Double,bLat:Double,bLng:Double):Road?{
  if(Api.sample!=null)throw java.io.IOException("Vista de muestra: sin red")
  val key=key(c)?:throw IllegalStateException("La compilación no tiene la llave de Google")
  val body=JSONObject().put("origin",place(aLat,aLng)).put("destination",place(bLat,bLng)).put("travelMode","DRIVE")
   .put("routingPreference","TRAFFIC_UNAWARE").put("polylineQuality","OVERVIEW")
  val k=URL("https://routes.googleapis.com/directions/v2:computeRoutes").openConnection() as HttpURLConnection
  try{
   k.requestMethod="POST";k.connectTimeout=12000;k.readTimeout=20000;k.doOutput=true
   k.setRequestProperty("Content-Type","application/json");k.setRequestProperty("X-Goog-Api-Key",key)
   // Only the length and the line of the road: the cheapest kind of request.
   k.setRequestProperty("X-Goog-FieldMask","routes.distanceMeters,routes.polyline.encodedPolyline")
   k.setRequestProperty("X-Android-Package",c.packageName);cert(c)?.let{k.setRequestProperty("X-Android-Cert",it)}
   k.outputStream.use{it.write(body.toString().toByteArray())}
   val code=k.responseCode
   val text=(if(code in 200..299)k.inputStream else k.errorStream)?.bufferedReader()?.use{it.readText()}?:""
   if(code !in 200..299)throw ApiError(code,text)
   val r=JSONObject(text).optJSONArray("routes")?.optJSONObject(0)?:return null
   val path=Gaps.decode(r.optJSONObject("polyline")?.optString("encodedPolyline").orEmpty())
   val meters=r.optDouble("distanceMeters",Double.NaN)
   return if(meters.isFinite()&&path.size>=2)Road(meters,path) else null
  }finally{k.disconnect()}
 }
 private fun place(lat:Double,lng:Double)=JSONObject().put("location",JSONObject().put("latLng",JSONObject().put("latitude",lat).put("longitude",lng)))
 @Suppress("DEPRECATION") private fun key(c:Context)=runCatching{c.packageManager.getApplicationInfo(c.packageName,PackageManager.GET_META_DATA).metaData?.getString(KEY)}.getOrNull()?.takeIf{it.isNotBlank()}
 /** The SHA-1 fingerprint of the app's signature, in capitals and without colons, as Google compares it with the key's. */
 @Suppress("DEPRECATION") private fun cert(c:Context):String?=runCatching{
  val signature=if(Build.VERSION.SDK_INT>=28)c.packageManager.getPackageInfo(c.packageName,PackageManager.GET_SIGNING_CERTIFICATES).signingInfo?.apkContentsSigners?.firstOrNull()
   else c.packageManager.getPackageInfo(c.packageName,PackageManager.GET_SIGNATURES).signatures?.firstOrNull()
  signature?.let{s->MessageDigest.getInstance("SHA-1").digest(s.toByteArray()).joinToString(""){"%02X".format(it)}}
 }.getOrNull()
}
