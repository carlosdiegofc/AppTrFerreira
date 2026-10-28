package uy.transportesferreira.gps
import android.content.Context
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Handler
import android.os.Looper
import android.provider.Settings
import android.view.Choreographer
import android.view.Gravity
import android.view.MotionEvent
import android.view.View
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import com.google.android.gms.common.ConnectionResult
import com.google.android.gms.common.GoogleApiAvailability
import com.google.android.gms.maps.CameraUpdateFactory
import com.google.android.gms.maps.GoogleMap
import com.google.android.gms.maps.MapView
import com.google.android.gms.maps.model.BitmapDescriptor
import com.google.android.gms.maps.model.BitmapDescriptorFactory
import com.google.android.gms.maps.model.Dash
import com.google.android.gms.maps.model.Gap
import com.google.android.gms.maps.model.LatLng
import com.google.android.gms.maps.model.LatLngBounds
import com.google.android.gms.maps.model.MapStyleOptions
import com.google.android.gms.maps.model.Marker
import com.google.android.gms.maps.model.MarkerOptions
import com.google.android.gms.maps.model.Polyline
import com.google.android.gms.maps.model.PolylineOptions
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.OffsetDateTime
import kotlin.concurrent.thread
import kotlin.math.asin
import kotlin.math.cos
import kotlin.math.max
import kotlin.math.min
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Google's map in the app (decision of 26/10/2026), with the Maps SDK for Android, which has no cost: its streets
 * («Mapa»), its satellite pictures with the roads and names («Satélite») and the traffic of now («Tráfico»), at night
 * with Google's night colors. The choice stays on the phone. It is used when the build has the key (the
 * GOOGLE_MAPS_ANDROID_KEY secret goes into the manifest) and the phone has Google Play services; otherwise TripMap keeps
 * its own map, as before. Marks and routes are the same as in TripMap's map, and labels are drawn as text.
 */
object GoogleMaps {
 private const val KEY="com.google.android.geo.API_KEY"
 private var hasKey:Boolean?=null
 private val BLUE=0xFF1C64F2.toInt();private val RED=0xFFB62F34.toInt();private val GREEN=0xFF0C775A.toInt();private val ORANGE=0xBFE8590C.toInt()

 /** Whether this phone shows Google's map: the key in the build, Google Play services that work, and a screen with a lifecycle. */
 fun usable(c:Context):Boolean{
  if(c !is LifecycleOwner)return false
  val key=hasKey?:runCatching{@Suppress("DEPRECATION") c.packageManager.getApplicationInfo(c.packageName,PackageManager.GET_META_DATA).metaData?.getString(KEY).orEmpty().isNotBlank()}.getOrDefault(false).also{hasKey=it}
  return key&&GoogleApiAvailability.getInstance().isGooglePlayServicesAvailable(c)==ConnectionResult.SUCCESS
 }

 fun live(c:Context,destLat:Double,destLng:Double):TripMap.Live=LiveMap(c,if(destLat.isFinite()&&destLng.isFinite()&&FleetStats.validPosition(destLat,destLng))LatLng(destLat,destLng) else null)
 fun view(c:Context,points:JSONArray):TripMap.Shown=RouteMap(c,points)
 fun fleet(c:Context,marks:JSONArray,glideMs:Long):TripMap.Fleet=FleetMap(c,marks,glideMs)

 /** Google's night colors for its streets, as its own samples give them. */
 private const val NIGHT="""[{"elementType":"geometry","stylers":[{"color":"#242f3e"}]},{"elementType":"labels.text.stroke","stylers":[{"color":"#242f3e"}]},{"elementType":"labels.text.fill","stylers":[{"color":"#746855"}]},{"featureType":"administrative.locality","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},{"featureType":"poi","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},{"featureType":"poi.park","elementType":"geometry","stylers":[{"color":"#263c3f"}]},{"featureType":"poi.park","elementType":"labels.text.fill","stylers":[{"color":"#6b9a76"}]},{"featureType":"road","elementType":"geometry","stylers":[{"color":"#38414e"}]},{"featureType":"road","elementType":"geometry.stroke","stylers":[{"color":"#212a37"}]},{"featureType":"road","elementType":"labels.text.fill","stylers":[{"color":"#9ca5b3"}]},{"featureType":"road.highway","elementType":"geometry","stylers":[{"color":"#746855"}]},{"featureType":"road.highway","elementType":"geometry.stroke","stylers":[{"color":"#1f2835"}]},{"featureType":"road.highway","elementType":"labels.text.fill","stylers":[{"color":"#f3d19c"}]},{"featureType":"transit","elementType":"geometry","stylers":[{"color":"#2f3948"}]},{"featureType":"transit.station","elementType":"labels.text.fill","stylers":[{"color":"#d59563"}]},{"featureType":"water","elementType":"geometry","stylers":[{"color":"#17263c"}]},{"featureType":"water","elementType":"labels.text.fill","stylers":[{"color":"#515c6d"}]},{"featureType":"water","elementType":"labels.text.stroke","stylers":[{"color":"#17263c"}]}]"""

 /** The map follows its screen: shown, paused, stopped and freed with it, and freed for good when the page changes. */
 private class Life(val owner:LifecycleOwner,val view:MapView):DefaultLifecycleObserver{
  private var created=false;private var started=false;private var resumed=false;private var gone=false
  // Created at once, so Google can be asked for the map; added to the lifecycle, it is brought to where the screen is.
  init{view.onCreate(null);created=true;owner.lifecycle.addObserver(this)}
  override fun onCreate(owner:LifecycleOwner){}
  override fun onStart(owner:LifecycleOwner){if(!gone&&created&&!started){view.onStart();started=true}}
  override fun onResume(owner:LifecycleOwner){if(!gone&&started&&!resumed){view.onResume();resumed=true}}
  override fun onPause(owner:LifecycleOwner){if(!gone&&resumed){view.onPause();resumed=false}}
  override fun onStop(owner:LifecycleOwner){if(!gone&&started){view.onStop();started=false}}
  override fun onDestroy(owner:LifecycleOwner)=end()
  fun end(){if(gone)return;if(resumed)view.onPause();if(started)view.onStop();if(created)view.onDestroy();gone=true;owner.lifecycle.removeObserver(this)}
 }

 /** Moving the map does not scroll the page around it. */
 private class Hold(c:Context):FrameLayout(c){
  override fun dispatchTouchEvent(e:MotionEvent):Boolean{
   if(e.actionMasked==MotionEvent.ACTION_DOWN||e.actionMasked==MotionEvent.ACTION_MOVE)parent?.requestDisallowInterceptTouchEvent(true)
   return super.dispatchTouchEvent(e)
  }
 }

 /**
  * The map with its buttons above: Mapa or Satélite and Tráfico, remembered on the phone, and the ones of each map, plus
  * a line for notes. Work for the map waits until Google gives it.
  */
 private open class Frame(val c:Context){
  val d=c.resources.displayMetrics.density
  val night=(c.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES
  private val prefs=c.getSharedPreferences("trf_mapa",Context.MODE_PRIVATE)
  private var satellite=prefs.getString("base","map")=="satellite"
  private var traffic=prefs.getBoolean("traffic",false)
  val mapView=MapView(c)
  private val life=Life(c as LifecycleOwner,mapView)
  val bar=LinearLayout(c).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(8),dp(6),dp(8),dp(6))}
  val note=TextView(c).apply{textSize=13f;setTextColor(if(night)0xFFE8ECF5.toInt() else 0xFF172B45.toInt());setPadding(dp(10),0,dp(10),dp(4));visibility=View.GONE}
  val root=LinearLayout(c).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(if(night)0xFF1D2232.toInt() else Color.WHITE)}
  var map:GoogleMap?=null;private set
  private val waiting=mutableListOf<(GoogleMap)->Unit>()
  private val chips=mutableMapOf<String,TextView>()
  var alive=true;private set
  init{
   chip("map","Mapa"){choose(false)};chip("satellite","Satélite"){choose(true)};space();chip("traffic","Tráfico"){traffic=!traffic;prefs.edit().putBoolean("traffic",traffic).apply();map?.let{base(it)};mark()}
   root.addView(HorizontalScrollView(c).apply{isHorizontalScrollBarEnabled=false;addView(bar)},LinearLayout.LayoutParams(-1,-2))
   root.addView(note,LinearLayout.LayoutParams(-1,-2))
   root.addView(Hold(c).apply{addView(mapView,FrameLayout.LayoutParams(-1,-1))},LinearLayout.LayoutParams(-1,0,1f))
   mark()
   mapView.getMapAsync{m->if(!alive)return@getMapAsync;map=m
    m.uiSettings.isZoomControlsEnabled=true;m.uiSettings.isMapToolbarEnabled=false;m.uiSettings.isTiltGesturesEnabled=false
    base(m);waiting.forEach{it(m)};waiting.clear()}
  }
  fun dp(v:Int)=(v*d).toInt()
  fun whenReady(work:(GoogleMap)->Unit){val m=map;if(m!=null)work(m) else waiting.add(work)}
  private fun choose(sat:Boolean){satellite=sat;prefs.edit().putString("base",if(sat)"satellite" else "map").apply();map?.let{base(it)};mark()}
  private fun base(m:GoogleMap){
   m.mapType=if(satellite)GoogleMap.MAP_TYPE_HYBRID else GoogleMap.MAP_TYPE_NORMAL
   // At night the streets come with Google's night colors; the pictures stay as they are.
   m.setMapStyle(if(night&&!satellite)MapStyleOptions(NIGHT) else null)
   m.isTrafficEnabled=traffic
  }
  /** A button of the bar; on, it is filled with the app's blue. */
  fun chip(key:String,text:String,click:()->Unit):TextView{
   val v=TextView(c).apply{this.text=text;textSize=14f;typeface=Typeface.DEFAULT_BOLD;setPadding(dp(12),dp(7),dp(12),dp(7));setOnClickListener{click()};isClickable=true}
   bar.addView(v,LinearLayout.LayoutParams(-2,-2).apply{marginEnd=dp(6)});chips[key]=v;paint(v,false);return v
  }
  private fun space(){bar.addView(View(c),LinearLayout.LayoutParams(dp(6),1))}
  private fun paint(v:TextView,on:Boolean){
   v.background=GradientDrawable().apply{cornerRadius=dp(18).toFloat();setColor(if(on)0xFF133396.toInt() else if(night)0xFF262C3D.toInt() else Color.WHITE);setStroke(dp(1),if(on)0xFF133396.toInt() else if(night)0xFF3A4358.toInt() else 0xFFCBD3DF.toInt())}
   v.setTextColor(if(on)Color.WHITE else if(night)0xFFE8ECF5.toInt() else 0xFF172B45.toInt());v.isSelected=on
  }
  fun mark(){chips["map"]?.let{paint(it,!satellite)};chips["satellite"]?.let{paint(it,satellite)};chips["traffic"]?.let{paint(it,traffic)}}
  fun showChip(key:String,on:Boolean){chips[key]?.visibility=if(on)View.VISIBLE else View.GONE}
  fun say(text:String?){note.text=text.orEmpty();note.visibility=if(text.isNullOrEmpty())View.GONE else View.VISIBLE}
  open fun destroy(){if(!alive)return;alive=false;waiting.clear();map?.clear();life.end()}

  /** The camera over these places, with room around them and no closer than maxZoom; a single place is shown at maxZoom. */
  fun fit(m:GoogleMap,places:List<LatLng>,padDp:Int,maxZoom:Float){
   if(places.isEmpty())return
   if(places.size==1){m.moveCamera(CameraUpdateFactory.newLatLngZoom(places[0],maxZoom));return}
   val b=LatLngBounds.builder();places.forEach{b.include(it)}
   val go={runCatching{m.moveCamera(CameraUpdateFactory.newLatLngBounds(b.build(),dp(padDp)))};if(m.cameraPosition.zoom>maxZoom)m.moveCamera(CameraUpdateFactory.zoomTo(maxZoom))}
   // Bounds need the map's size: before it is laid out, they wait for it.
   if(mapView.width>0&&mapView.height>0)go() else m.setOnMapLoadedCallback{if(alive)go()}
  }

  /** A round mark like the app's maps: its color with a white ring, and its label to the right as text on a white tag. */
  fun dot(fill:Int,radiusDp:Float,ringDp:Float,label:String?,ring:Int=Color.WHITE):Pair<BitmapDescriptor,Float>{
   val r=radiusDp*d;val stroke=ringDp*d;val outer=r+stroke/2
   val text=Paint(Paint.ANTI_ALIAS_FLAG).apply{textSize=11*d*c.resources.configuration.fontScale;typeface=Typeface.DEFAULT_BOLD;color=0xFF111C2E.toInt()}
   val fm=text.fontMetrics;val padX=6*d;val padY=2*d;val gap=5*d
   val tagW=if(label.isNullOrEmpty())0f else text.measureText(label)+padX*2
   val tagH=if(label.isNullOrEmpty())0f else fm.descent-fm.ascent+padY*2
   val w=max(1f,outer*2+(if(tagW>0)gap+tagW else 0f));val h=max(1f,max(outer*2,tagH))
   val bmp=Bitmap.createBitmap(kotlin.math.ceil(w).toInt(),kotlin.math.ceil(h).toInt(),Bitmap.Config.ARGB_8888);val cv=Canvas(bmp)
   val cx=outer;val cy=h/2
   val p=Paint(Paint.ANTI_ALIAS_FLAG)
   p.color=ring;cv.drawCircle(cx,cy,outer,p);p.color=fill;cv.drawCircle(cx,cy,r-stroke/2,p)
   if(!label.isNullOrEmpty()){
    val box=RectF(outer*2+gap,cy-tagH/2,outer*2+gap+tagW,cy+tagH/2)
    p.color=Color.WHITE;cv.drawRoundRect(box,6*d,6*d,p)
    p.style=Paint.Style.STROKE;p.strokeWidth=d;p.color=0xFFCBD3DF.toInt();cv.drawRoundRect(box,6*d,6*d,p);p.style=Paint.Style.FILL
    cv.drawText(label,box.left+padX,box.top+padY-fm.ascent,text)
   }
   return Pair(BitmapDescriptorFactory.fromBitmap(bmp),cx/bmp.width)
  }
  fun marker(m:GoogleMap,at:LatLng,icon:Pair<BitmapDescriptor,Float>,title:String?=null,z:Float=1f):Marker?=m.addMarker(MarkerOptions().position(at).icon(icon.first).anchor(icon.second,0.5f).title(title).zIndex(z))
 }

 /** The map of the trip in progress: the recorded route by segments, the truck it follows, and the road to the destination. */
 private class LiveMap(c:Context,val dest:LatLng?):Frame(c),TripMap.Live{
  override val view:View get()=root
  private var line:Polyline?=null;private val path=mutableListOf<LatLng>();private var seg=Double.NaN;private var lastT=0.0;private var last:LatLng?=null
  private var truck:Marker?=null;private var follow=true;private var first=true
  private var road:Polyline?=null;private var roadAt=0L
  private val placed=mutableListOf<LatLng>()
  private val main=Handler(Looper.getMainLooper())
  init{
   chip("center","Seguir el camión"){setFollow(true);last?.let{at->whenReady{m->m.moveCamera(CameraUpdateFactory.newLatLngZoom(at,max(m.cameraPosition.zoom,15f)))}}}
   chip("whole","Ver todo"){whenReady{m->setFollow(false);fit(m,placed+listOfNotNull(last,dest),30,16f)}}
   showChip("center",false)
   whenReady{m->
    m.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(-32.2,-56.0),6f))
    m.setOnCameraMoveStartedListener{why->if(why==GoogleMap.OnCameraMoveStartedListener.REASON_GESTURE)setFollow(false)}
    dest?.let{marker(m,it,dot(Color.WHITE,9f,3f,"Destino",RED),"Destino",2f)}
   }
  }
  private fun setFollow(v:Boolean){follow=v;showChip("center",!v)}
  override fun push(points:List<DoubleArray>){if(points.isEmpty())return;whenReady{m->add(m,points)}}
  private fun add(m:GoogleMap,points:List<DoubleArray>){
   points.forEach{p->
    val at=LatLng(p[0],p[1])
    // A new segment, or a gap of more than 90 seconds, starts a new line, like the route of each trip. After a stretch
    // without signal a dashed line joins the two ends, as on the trip's route until its road is there (Gaps.link).
    if(line==null||p[2]!=seg||p[3]-lastT>90_000){
     val before=last
     if(line!=null&&before!=null&&Gaps.link(Gaps.Reading(before.latitude,before.longitude,seg.toInt(),lastT.toLong()),Gaps.Reading(p[0],p[1],p[2].toInt(),p[3].toLong()))==Gaps.Link.DASHED)
      m.addPolyline(PolylineOptions().addAll(listOf(before,at)).color(BLUE).width(5*d).pattern(listOf(Dash(8*d),Gap(6*d))).zIndex(1f))
     line?.points=path.toList();path.clear();seg=p[2];line=m.addPolyline(PolylineOptions().color(BLUE).width(5*d).zIndex(1f))}
    lastT=p[3];path.add(at);last=at;placed.add(at)
   }
   line?.points=path.toList()
   val at=last?:return
   val t=truck;if(t==null)truck=marker(m,at,dot(BLUE,8f,3f,null),null,3f) else t.position=at
   if(follow){m.moveCamera(CameraUpdateFactory.newLatLngZoom(at,if(first)16f else max(m.cameraPosition.zoom,15f)));first=false}
   roadTo()
  }
  /** The road to the destination and how long it takes, every two minutes at most, from OSRM as TripMap's map does. */
  private fun roadTo(){
   val to=dest?:return;val from=last?:return
   if(System.currentTimeMillis()-roadAt<120_000)return;roadAt=System.currentTimeMillis()
   thread{
    val r=runCatching{
     val u=URL("https://router.project-osrm.org/route/v1/driving/${from.longitude},${from.latitude};${to.longitude},${to.latitude}?overview=full&geometries=geojson")
     val k=u.openConnection() as HttpURLConnection;k.connectTimeout=10_000;k.readTimeout=15_000
     try{JSONObject(k.inputStream.bufferedReader().use{it.readText()}).optJSONArray("routes")?.optJSONObject(0)}finally{k.disconnect()}
    }.getOrNull()
    main.post{
     if(!alive)return@post
     if(r==null){roadAt=System.currentTimeMillis()-90_000;return@post}
     val coords=r.optJSONObject("geometry")?.optJSONArray("coordinates")?:return@post
     val path=(0 until coords.length()).mapNotNull{i->coords.optJSONArray(i)?.let{c->LatLng(c.optDouble(1),c.optDouble(0))}}
     whenReady{m->road?.remove();road=m.addPolyline(PolylineOptions().addAll(path).color(ORANGE).width(5*d).pattern(listOf(Dash(10*d),Gap(8*d))).zIndex(0.5f))}
     val km=r.optDouble("distance")/1000;val min=Math.round(r.optDouble("duration")/60).toInt()
     say("Al destino: ${String.format(java.util.Locale.forLanguageTag("es-UY"),"%.1f",km)} km · aprox. "+(if(min>=60)"${min/60} h ${min%60} min" else "$min min"))
    }
   }
  }
  override fun destroy(){main.removeCallbacksAndMessages(null);super.destroy()}
 }

 /** The route of a finished or ongoing trip: its segments, where the GPS started and where it was last. */
 private class RouteMap(c:Context,points:JSONArray):Frame(c),TripMap.Shown{
  override val view:View get()=root
  init{
   val list=(0 until points.length()).mapNotNull{i->val p=points.optJSONObject(i)?:return@mapNotNull null;val lat=p.optDouble("latitude");val lng=p.optDouble("longitude")
    if(!FleetStats.validPosition(lat,lng))null else Gaps.Reading(lat,lng,p.optInt("segment"),runCatching{OffsetDateTime.parse(p.optString("recorded_at")).toInstant().toEpochMilli()}.getOrNull(),p.optBoolean("estimated"))}
   val at=list.map{LatLng(it.lat,it.lng)}
   whenReady{m->
    m.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(-32.2,-56.0),6f))
    // A pause leaves the line open; a stretch without signal goes dashed, along its estimated road (Gaps.runs).
    Gaps.runs(list).forEach{(from,to,dashed)->m.addPolyline(PolylineOptions().addAll(at.subList(from,to+1)).color(BLUE).width(4*d).apply{if(dashed)pattern(listOf(Dash(8*d),Gap(6*d)))})}
    if(at.isNotEmpty()){marker(m,at.first(),dot(GREEN,7f,2f,null),"Inicio GPS",2f);marker(m,at.last(),dot(RED,7f,2f,null),"Última ubicación",2f);fit(m,at,25,15f)}
   }
  }
 }

 /**
  * The owner's map of the fleet: a mark per truck, colored by state, and a smaller one where the phone of an active
  * driver without a trip is. A truck glides to its new position over glideMs, about the time until the next one.
  */
 private class FleetMap(c:Context,marks:JSONArray,private val glideMs:Long):Frame(c),TripMap.Fleet{
  override val view:View get()=root
  private class Known(var marker:Marker,var at:LatLng,var to:LatLng,var look:String,var from:LatLng?=null,var start:Long=0)
  private val known=mutableMapOf<String,Known>()
  // A move longer than 3 km (the signal came back after a while), or the phone set to remove animations, is a jump.
  private val still=Settings.Global.getFloat(c.contentResolver,Settings.Global.ANIMATOR_DURATION_SCALE,1f)==0f
  private var gliding=false
  private val frame=Choreographer.FrameCallback{step()}
  init{
   whenReady{m->
    m.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(-30.9,-57.3),8f))
    draw(m,marks)
    val pts=(0 until marks.length()).mapNotNull{i->marks.optJSONObject(i)?.let{LatLng(it.optDouble("lat"),it.optDouble("lng"))}}
    if(pts.size>1)fit(m,pts,40,12f) else if(pts.size==1)m.moveCamera(CameraUpdateFactory.newLatLngZoom(pts[0],11f))
   }
  }
  /** New positions every few seconds: the marks move and the map keeps the view the owner chose. */
  override fun setMarks(marks:JSONArray){whenReady{m->draw(m,marks)}}
  private fun draw(m:GoogleMap,marks:JSONArray){
   val seen=mutableSetOf<String>()
   for(i in 0 until marks.length()){
    val o=marks.optJSONObject(i)?:continue;val key=o.optString("key");val at=LatLng(o.optDouble("lat"),o.optDouble("lng"))
    if(!FleetStats.validPosition(at.latitude,at.longitude))continue
    seen.add(key)
    val person=o.optBoolean("person");val color=runCatching{Color.parseColor(o.optString("color"))}.getOrDefault(BLUE);val label=o.optString("label")
    val look="$color|$label|$person"
    val k=known[key]
    if(k==null){val mk=marker(m,at,icon(color,label,person),null,if(person)1f else 2f)?:continue;known[key]=Known(mk,at,at,look);continue}
    if(k.look!=look){val ic=icon(color,label,person);k.marker.setIcon(ic.first);k.marker.setAnchor(ic.second,0.5f);k.look=look}
    moveTo(k,at)
   }
   known.keys.filter{it !in seen}.forEach{known.remove(it)?.marker?.remove()}
  }
  private fun icon(color:Int,label:String,person:Boolean)=dot(color,if(person)6f else 9f,if(person)2f else 3f,label.ifBlank{null})
  // From where the truck is drawn, even halfway through the previous glide, to its new position.
  private fun moveTo(k:Known,p:LatLng){
   if(k.to==p)return;k.to=p
   if(still||meters(k.at,p)>3000){k.from=null;k.at=p;k.marker.position=p;return}
   k.from=k.at;k.start=System.currentTimeMillis()
   if(!gliding){gliding=true;Choreographer.getInstance().postFrameCallback(frame)}
  }
  private fun step(){
   if(!alive){gliding=false;return}
   val now=System.currentTimeMillis();var more=false
   known.values.forEach{k->val a=k.from?:return@forEach;val t=min(1.0,(now-k.start).toDouble()/max(1L,glideMs))
    k.at=LatLng(a.latitude+(k.to.latitude-a.latitude)*t,a.longitude+(k.to.longitude-a.longitude)*t);k.marker.position=k.at
    if(t<1)more=true else k.from=null}
   if(more)Choreographer.getInstance().postFrameCallback(frame) else gliding=false
  }
  private fun meters(a:LatLng,b:LatLng):Double{val r=Math.PI/180;val h=sin((b.latitude-a.latitude)*r/2).let{it*it}+cos(a.latitude*r)*cos(b.latitude*r)*sin((b.longitude-a.longitude)*r/2).let{it*it};return 12_742_000*asin(sqrt(min(1.0,h)))}
  override fun destroy(){Choreographer.getInstance().removeFrameCallback(frame);gliding=false;known.clear();super.destroy()}
 }
}
