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
import android.view.ViewGroup
import android.widget.ImageView
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
import com.google.android.gms.maps.model.CameraPosition
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
 private val BLUE=0xFF1C64F2.toInt();private val RED=0xFFB62F34.toInt();private val GREEN=0xFF0C775A.toInt();private val ORANGE=0xBFE8590C.toInt();private val VIOLET=0xFF7A3FD1.toInt()

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
  * a line for notes. Work for the map waits until Google gives it. A floating map (the trip's, decision of 29/10/2026)
  * fills its screen: its buttons are round, on the right, the choice of map opens from its own, and the note floats.
  */
 private open class Frame(val c:Context,val floating:Boolean=false){
  val d=c.resources.displayMetrics.density
  val night=(c.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES
  private val prefs=c.getSharedPreferences("trf_mapa",Context.MODE_PRIVATE)
  private var satellite=prefs.getString("base","map")=="satellite"
  private var traffic=prefs.getBoolean("traffic",false)
  val mapView=MapView(c)
  private val life=Life(c as LifecycleOwner,mapView)
  val bar=LinearLayout(c).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(8),dp(6),dp(8),dp(6))}
  val note=TextView(c).apply{textSize=13f;setTextColor(if(night)0xFFE8ECF5.toInt() else 0xFF172B45.toInt());setPadding(dp(10),0,dp(10),dp(4));visibility=View.GONE}
  val root:ViewGroup=(if(floating)FrameLayout(c) else LinearLayout(c).apply{orientation=LinearLayout.VERTICAL}).apply{setBackgroundColor(if(night)0xFF1D2232.toInt() else Color.WHITE)}
  /** The round buttons of a floating map, one under the other. */
  val tools=LinearLayout(c).apply{orientation=LinearLayout.VERTICAL}
  // A move longer than 3 km (the signal came back after a while), or the phone set to remove animations, is a jump.
  val calm=Settings.Global.getFloat(c.contentResolver,Settings.Global.ANIMATOR_DURATION_SCALE,1f)==0f
  var map:GoogleMap?=null;private set
  private val waiting=mutableListOf<(GoogleMap)->Unit>()
  private val chips=mutableMapOf<String,TextView>()
  var alive=true;private set
  init{
   chip("map","Mapa"){choose(false)};chip("satellite","Satélite"){choose(true)};space();chip("traffic","Tráfico"){traffic=!traffic;prefs.edit().putBoolean("traffic",traffic).apply();map?.let{base(it)};mark()}
   if(floating){
    root.addView(Hold(c).apply{addView(mapView,FrameLayout.LayoutParams(-1,-1))},FrameLayout.LayoutParams(-1,-1))
    bar.background=pill();bar.visibility=View.GONE
    root.addView(bar,FrameLayout.LayoutParams(-2,-2,Gravity.TOP or Gravity.END).apply{topMargin=dp(12);marginEnd=dp(70)})
    root.addView(tools,FrameLayout.LayoutParams(-2,-2,Gravity.TOP or Gravity.END).apply{topMargin=dp(12);marginEnd=dp(12)})
    note.background=pill();note.setPadding(dp(12),dp(7),dp(12),dp(7))
    root.addView(note,FrameLayout.LayoutParams(-2,-2,Gravity.TOP or Gravity.START).apply{topMargin=dp(12);marginStart=dp(84);marginEnd=dp(70)})
   }else{
    root.addView(HorizontalScrollView(c).apply{isHorizontalScrollBarEnabled=false;addView(bar)},LinearLayout.LayoutParams(-1,-2))
    root.addView(note,LinearLayout.LayoutParams(-1,-2))
    root.addView(Hold(c).apply{addView(mapView,FrameLayout.LayoutParams(-1,-1))},LinearLayout.LayoutParams(-1,0,1f))
   }
   mark()
   mapView.getMapAsync{m->if(!alive)return@getMapAsync;map=m
    m.uiSettings.isZoomControlsEnabled=!floating;m.uiSettings.isMapToolbarEnabled=false;m.uiSettings.isTiltGesturesEnabled=false
    base(m);waiting.forEach{it(m)};waiting.clear()}
  }
  fun dp(v:Int)=(v*d).toInt()
  // A map already closed (its screen left) does no more work: Google's map is gone and touching it would close the app.
  fun whenReady(work:(GoogleMap)->Unit){if(!alive)return;val m=map;if(m!=null)work(m) else waiting.add(work)}
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
  private fun pill()=GradientDrawable().apply{cornerRadius=dp(22).toFloat();setColor(if(night)0xF21D2232.toInt() else 0xF7FFFFFF.toInt());setStroke(dp(1),if(night)0xFF3A4358.toInt() else 0xFFCBD3DF.toInt())}
  /** A round button of a floating map; on, it is filled with the app's blue. */
  fun round(icon:Int,desc:String,click:()->Unit)=ImageView(c).apply{
   setImageResource(icon);setPadding(dp(12),dp(12),dp(12),dp(12));contentDescription=desc;isClickable=true;isFocusable=true;elevation=dp(3).toFloat()
   setOnClickListener{click()};light(this,false)
   tools.addView(this,LinearLayout.LayoutParams(dp(48),dp(48)).apply{bottomMargin=dp(10)})
  }
  fun light(v:ImageView,on:Boolean){
   v.background=GradientDrawable().apply{shape=GradientDrawable.OVAL;setColor(if(on)0xFF133396.toInt() else if(night)0xF21D2232.toInt() else 0xF7FFFFFF.toInt());setStroke(dp(1),if(on)0xFF133396.toInt() else if(night)0xFF3A4358.toInt() else 0xFFCBD3DF.toInt())}
   v.imageTintList=android.content.res.ColorStateList.valueOf(if(on)Color.WHITE else if(night)0xFFE8ECF5.toInt() else 0xFF172B45.toInt())
  }
  /** The button that opens the choice of Mapa, Satélite and Tráfico next to it. */
  fun layersButton()=round(R.drawable.ic_layers,"Mapa, satélite y tráfico"){bar.visibility=if(bar.visibility==View.VISIBLE)View.GONE else View.VISIBLE}
  /** The bar on top and the panel below cover part of a floating map: its buttons and Google's camera leave that room. */
  fun place(top:Int,bottom:Int){
   for(v in listOf(tools,bar,note))(v.layoutParams as? FrameLayout.LayoutParams)?.let{it.topMargin=top+dp(12);v.layoutParams=it}
   whenReady{m->m.setPadding(0,top,0,bottom)}
  }
  /** The readings of a saved route that can be drawn, for Gaps.runs. */
  fun readings(points:JSONArray)=(0 until points.length()).mapNotNull{i->val p=points.optJSONObject(i)?:return@mapNotNull null;val lat=p.optDouble("latitude");val lng=p.optDouble("longitude")
   if(!FleetStats.validPosition(lat,lng))null else Gaps.Reading(lat,lng,p.optInt("segment"),runCatching{OffsetDateTime.parse(p.optString("recorded_at")).toInstant().toEpochMilli()}.getOrNull(),p.optBoolean("estimated"))}
  /**
   * The route of another truck, tapped on the map (decision of 29/10/2026): in violet, dashed over its stretches without
   * signal, and the camera over it. Null takes it away. lines keeps what is drawn, to take it away next time.
   */
  fun route(m:GoogleMap,points:JSONArray?,lines:MutableList<Polyline>):Boolean{
   lines.forEach{it.remove()};lines.clear();if(points==null)return false
   val list=readings(points);val at=list.map{LatLng(it.lat,it.lng)}
   Gaps.runs(list).forEach{(from,to,dashed)->lines.add(m.addPolyline(PolylineOptions().addAll(at.subList(from,to+1)).color(VIOLET).width(4*d).zIndex(.8f).apply{if(dashed)pattern(listOf(Dash(8*d),Gap(6*d)))}))}
   if(at.isEmpty())return false
   fit(m,at,40,15f);return true
  }
  /** The mark of a truck or a driver's phone of the fleet, with its label. */
  fun fleetIcon(color:Int,label:String,person:Boolean)=dot(color,if(person)6f else 9f,if(person)2f else 3f,label.ifBlank{null})
  fun metersBetween(a:LatLng,b:LatLng):Double{val r=Math.PI/180;val h=sin((b.latitude-a.latitude)*r/2).let{it*it}+cos(a.latitude*r)*cos(b.latitude*r)*sin((b.longitude-a.longitude)*r/2).let{it*it};return 12_742_000*asin(sqrt(min(1.0,h)))}
  /** Where b is from a, in degrees from north. */
  fun bearingOf(a:LatLng,b:LatLng):Float{val r=Math.PI/180;val y=sin((b.longitude-a.longitude)*r)*cos(b.latitude*r);val x=cos(a.latitude*r)*sin(b.latitude*r)-sin(a.latitude*r)*cos(b.latitude*r)*cos((b.longitude-a.longitude)*r);return ((Math.toDegrees(kotlin.math.atan2(y,x))+360)%360).toFloat()}
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

 /**
  * The map of the trip in progress (decision of 29/10/2026): it fills the screen and turns with the truck, an arrow, like a
  * navigator; the recorded route by segments, the road to the destination, and for an owner who drives, the other trucks.
  */
 private class LiveMap(c:Context,val dest:LatLng?):Frame(c,true),TripMap.Live{
  override val view:View get()=root
  private var line:Polyline?=null;private val path=mutableListOf<LatLng>();private var seg=Double.NaN;private var lastT=0.0;private var last:LatLng?=null
  private var truck:Marker?=null;private var follow=true;private var first=true
  // The map turns with the truck, which points where it goes; from the last place at least 12 m away, so it does not spin when stopped.
  private var headingUp=true;private var heading=0f;private var headFrom:LatLng?=null
  private var road:Polyline?=null;private var roadAt=0L
  private val placed=mutableListOf<LatLng>()
  private val others=mutableMapOf<String,Pair<Marker,String>>();private var tap:((String)->Unit)?=null;private val routeLines=mutableListOf<Polyline>()
  private val main=Handler(Looper.getMainLooper())
  private lateinit var turn:ImageView;private lateinit var center:ImageView
  init{
   turn=round(R.drawable.ic_navigation,"El mapa gira con el camión"){
    headingUp=!headingUp;light(turn,headingUp)
    if(follow)camera(true) else if(!headingUp)whenReady{m->m.animateCamera(CameraUpdateFactory.newCameraPosition(CameraPosition.Builder(m.cameraPosition).bearing(0f).build()))}
   }
   light(turn,true)
   layersButton()
   center=round(R.drawable.ic_gps,"Seguir el camión"){setFollow(true);camera(true)}
   round(R.drawable.ic_expand,"Ver todo el viaje"){whenReady{m->setFollow(false);fit(m,placed+listOfNotNull(last,dest),40,16f)}}
   setFollow(true)
   whenReady{m->
    m.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(-32.2,-56.0),6f))
    m.uiSettings.isCompassEnabled=true
    m.setOnCameraMoveStartedListener{why->if(why==GoogleMap.OnCameraMoveStartedListener.REASON_GESTURE)setFollow(false)}
    m.setOnMarkerClickListener{mk->val k=mk.tag as? String;if(k!=null){tap?.invoke(k);true}else false}
    dest?.let{marker(m,it,dot(Color.WHITE,9f,3f,"Destino",RED),"Destino",2f)}
   }
  }
  private fun setFollow(v:Boolean){follow=v;if(::center.isInitialized)light(center,v)}
  override fun pad(top:Int,bottom:Int)=place(top,bottom)
  override fun push(points:List<DoubleArray>){if(points.isEmpty())return;whenReady{m->add(m,points)}}
  private fun add(m:GoogleMap,points:List<DoubleArray>){
   points.forEach{p->
    val at=LatLng(p[0],p[1])
    // A new segment, or a gap of more than 90 seconds, starts a new line, like the route of each trip. After a stretch
    // without signal a dashed line joins the two ends, as on the trip's route until its road is there (Gaps.link).
    if(line==null||p[2]!=seg||p[3]-lastT>90_000){
     val before=last
     if(line!=null&&before!=null&&Gaps.link(Gaps.Reading(before.latitude,before.longitude,seg.toInt(),lastT.toLong()),Gaps.Reading(p[0],p[1],p[2].toInt(),p[3].toLong()))==Gaps.Link.DASHED)
      m.addPolyline(PolylineOptions().addAll(listOf(before,at)).color(BLUE).width(6*d).pattern(listOf(Dash(8*d),Gap(6*d))).zIndex(1f))
     line?.points=path.toList();path.clear();if(p[2]!=seg)headFrom=null;seg=p[2];line=m.addPolyline(PolylineOptions().color(BLUE).width(6*d).zIndex(1f))}
    lastT=p[3];path.add(at);last=at;placed.add(at)
    val from=headFrom;if(from==null)headFrom=at else if(metersBetween(from,at)>=12){heading=bearingOf(from,at);headFrom=at}
   }
   line?.points=path.toList()
   val at=last?:return
   val t=truck;if(t==null)truck=m.addMarker(MarkerOptions().position(at).icon(arrow()).anchor(.5f,.55f).flat(true).rotation(heading).zIndex(3f)) else{t.position=at;t.rotation=heading}
   camera(!first)
   roadTo()
  }
  /** Over the truck, turned to where it goes or with the north up, once it follows the truck. */
  private fun camera(animate:Boolean){
   if(!follow)return;val at=last?:return
   whenReady{m->
    val pos=CameraPosition.Builder().target(at).zoom(if(first)16.5f else max(m.cameraPosition.zoom,14f)).bearing(if(headingUp)heading else 0f).tilt(0f).build()
    first=false
    if(animate&&!calm)m.animateCamera(CameraUpdateFactory.newCameraPosition(pos),700,null) else m.moveCamera(CameraUpdateFactory.newCameraPosition(pos))
   }
  }
  /** The truck: a blue arrow with a white edge, flat on the map, pointing where it goes. */
  private fun arrow():BitmapDescriptor{
   val s=kotlin.math.ceil(36*d).toInt();val bmp=Bitmap.createBitmap(s,s,Bitmap.Config.ARGB_8888);val cv=Canvas(bmp)
   val path=android.graphics.Path().apply{moveTo(s/2f,3*d);lineTo(s-5*d,s-4*d);lineTo(s/2f,s*.72f);lineTo(5*d,s-4*d);close()}
   val p=Paint(Paint.ANTI_ALIAS_FLAG).apply{style=Paint.Style.FILL;color=BLUE};cv.drawPath(path,p)
   p.style=Paint.Style.STROKE;p.strokeWidth=2.5f*d;p.strokeJoin=Paint.Join.ROUND;p.color=Color.WHITE;cv.drawPath(path,p)
   return BitmapDescriptorFactory.fromBitmap(bmp)
  }
  override fun onTruck(tap:(String)->Unit){this.tap=tap}
  /** The other trucks of the fleet and the phones of active drivers, moved in place; their labels say the speed. */
  override fun setFleet(marks:JSONArray){whenReady{m->
   val seen=mutableSetOf<String>()
   for(i in 0 until marks.length()){
    val o=marks.optJSONObject(i)?:continue;val key=o.optString("key");val at=LatLng(o.optDouble("lat"),o.optDouble("lng"))
    if(!FleetStats.validPosition(at.latitude,at.longitude))continue
    seen.add(key)
    val person=o.optBoolean("person");val color=runCatching{Color.parseColor(o.optString("color"))}.getOrDefault(BLUE);val label=o.optString("label");val look="$color|$label|$person"
    val k=others[key]
    if(k==null){val mk=marker(m,at,fleetIcon(color,label,person),null,if(person)1f else 2f)?:continue;mk.tag=key;others[key]=Pair(mk,look);continue}
    k.first.position=at
    if(k.second!=look){val ic=fleetIcon(color,label,person);k.first.setIcon(ic.first);k.first.setAnchor(ic.second,.5f);others[key]=Pair(k.first,look)}
   }
   others.keys.filter{it !in seen}.forEach{others.remove(it)?.first?.remove()}
  }}
  override fun showRoute(points:JSONArray?){whenReady{m->if(route(m,points,routeLines))setFollow(false)}}
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
  override fun destroy(){main.removeCallbacksAndMessages(null);others.clear();super.destroy()}
 }

 /** The route of a finished or ongoing trip: its segments, where the GPS started and where it was last. */
 private class RouteMap(c:Context,points:JSONArray):Frame(c),TripMap.Shown{
  override val view:View get()=root
  init{
   val list=readings(points)
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
  private var gliding=false
  private val frame=Choreographer.FrameCallback{step()}
  // A truck tapped shows its route (decision of 29/10/2026).
  private var tap:((String)->Unit)?=null;private val routeLines=mutableListOf<Polyline>()
  init{
   whenReady{m->
    m.moveCamera(CameraUpdateFactory.newLatLngZoom(LatLng(-30.9,-57.3),8f))
    m.setOnMarkerClickListener{mk->val k=mk.tag as? String;if(k!=null){tap?.invoke(k);true}else false}
    draw(m,marks)
    val pts=(0 until marks.length()).mapNotNull{i->marks.optJSONObject(i)?.let{LatLng(it.optDouble("lat"),it.optDouble("lng"))}}
    if(pts.size>1)fit(m,pts,40,12f) else if(pts.size==1)m.moveCamera(CameraUpdateFactory.newLatLngZoom(pts[0],11f))
   }
  }
  /** New positions every few seconds: the marks move and the map keeps the view the owner chose. */
  override fun setMarks(marks:JSONArray){whenReady{m->draw(m,marks)}}
  override fun onTruck(tap:(String)->Unit){this.tap=tap}
  override fun showRoute(points:JSONArray?){whenReady{m->route(m,points,routeLines)}}
  private fun draw(m:GoogleMap,marks:JSONArray){
   val seen=mutableSetOf<String>()
   for(i in 0 until marks.length()){
    val o=marks.optJSONObject(i)?:continue;val key=o.optString("key");val at=LatLng(o.optDouble("lat"),o.optDouble("lng"))
    if(!FleetStats.validPosition(at.latitude,at.longitude))continue
    seen.add(key)
    val person=o.optBoolean("person");val color=runCatching{Color.parseColor(o.optString("color"))}.getOrDefault(BLUE);val label=o.optString("label")
    val look="$color|$label|$person"
    val k=known[key]
    if(k==null){val mk=marker(m,at,fleetIcon(color,label,person),null,if(person)1f else 2f)?:continue;mk.tag=key;known[key]=Known(mk,at,at,look);continue}
    if(k.look!=look){val ic=fleetIcon(color,label,person);k.marker.setIcon(ic.first);k.marker.setAnchor(ic.second,0.5f);k.look=look}
    moveTo(k,at)
   }
   known.keys.filter{it !in seen}.forEach{known.remove(it)?.marker?.remove()}
  }
  // From where the truck is drawn, even halfway through the previous glide, to its new position.
  private fun moveTo(k:Known,p:LatLng){
   if(k.to==p)return;k.to=p
   if(calm||metersBetween(k.at,p)>3000){k.from=null;k.at=p;k.marker.position=p;return}
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
  override fun destroy(){Choreographer.getInstance().removeFrameCallback(frame);gliding=false;known.clear();super.destroy()}
 }
}
