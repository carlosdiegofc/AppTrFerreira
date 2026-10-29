package uy.transportesferreira.gps
import android.Manifest
import android.animation.ValueAnimator
import android.annotation.SuppressLint
import android.app.DatePickerDialog
import android.content.Intent
import android.content.pm.PackageManager
import android.content.res.ColorStateList
import android.content.res.Configuration
import android.graphics.*
import android.graphics.drawable.ColorDrawable
import android.graphics.drawable.Drawable
import android.graphics.drawable.GradientDrawable
import android.graphics.drawable.LayerDrawable
import android.graphics.drawable.RippleDrawable
import android.graphics.drawable.StateListDrawable
import android.graphics.drawable.TransitionDrawable
import android.location.Geocoder
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.text.Editable
import android.text.InputType
import android.text.SpannableString
import android.text.TextUtils
import android.text.style.RelativeSizeSpan
import android.text.TextWatcher
import android.view.*
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.animation.PathInterpolator
import android.view.inputmethod.EditorInfo
import android.widget.*
import androidx.activity.OnBackPressedCallback
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.exifinterface.media.ExifInterface
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.text.NumberFormat
import java.time.Duration
import java.time.Instant
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.YearMonth
import java.time.ZoneId
import java.time.format.DateTimeFormatter
import java.util.*
import kotlin.concurrent.thread
import kotlin.math.max
import kotlin.math.min
/** Flota en vivo (owner screen): positions every 5 s, who is on a trip every minute (decision of 18/10/2026). */
private const val LIVE_MS=5000L
private const val FLEET_MS=60000L
/**
 * Preference: whether the driver accepted that the position goes out with the app open and no trip («chofer activo»).
 * One per account (presenceKey), so another driver who signs in on the same phone is asked again.
 */
private const val PRESENCE_POSITION="presence_position"
/** The photo of the room behind the glass, opened once while the app lives (also across a turn of the screen): night or day. */
private var roomPhoto:Pair<Boolean,Bitmap>?=null

class MainActivity:AppCompatActivity(){
 // Palette, the panel's glass (decision of 28/10/2026): light value first, dark value second. The cards are translucent
 // over a room that is already out of focus (Room); what floats over the screen (the bars, the sheets) is nearly solid.
 private val dark by lazy{(resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES}
 private fun tone(light:Long,night:Long)=(if(dark)night else light).toInt()
 /** The logo's blue, for what is filled: the main buttons, the avatar, the + button. */
 private val brand by lazy{tone(0xFF133396,0xFF3457D5)}
 private val blue by lazy{tone(0xFF133396,0xFF92B0FF)}
 private val blueSoft by lazy{tone(0x1C133396,0x2978A0FF)}
 private val roomTone by lazy{tone(0xFFE4D8CA,0xFF1D1A1E)}
 private val glass by lazy{tone(0xA3FFFFFF,0x851E2536)}
 private val glassLine by lazy{tone(0xB8FFFFFF,0x17FFFFFF)}
 private val raised by lazy{tone(0xF0FFFFFF,0xF51B2131)}
 private val float by lazy{tone(0xC7FFFFFF,0xCC121622)}
 private val menuFill by lazy{tone(0xF7FFFFFF,0xFA1A1F2E)}
 private val fieldFill by lazy{tone(0xA8FFFFFF,0x38000000)}
 private val btnFill by lazy{tone(0x9EFFFFFF,0x14FFFFFF)}
 private val surface by lazy{tone(0xFFF7F2EC,0xFF1D2232)}
 /** The chosen tab of the bottom bar. */
 private val railOn by lazy{tone(0xFFFFFFFF,0x2BFFFFFF)}
 private val railInk by lazy{tone(0xFF133396,0xFFFFFFFF)}
 /** Cards: glass, or nearly solid on the screens of a trip and of simple mode, read at a glance (opaque). */
 private val cardBg get()=if(opaque)raised else glass
 private val ink by lazy{tone(0xFF121A2B,0xFFEEF2F8)}
 private val muted by lazy{tone(0xFF515B6C,0xFFA4AEC0)}
 private val faint by lazy{tone(0xFF8A919D,0xFF77829A)}
 private val inkSoft by lazy{tone(0xFF3D4658,0xFFC5CDDB)}
 private val line by lazy{tone(0x1C242C3E,0x17FFFFFF)}
 private val fieldLine by lazy{tone(0x2B242C3E,0x29FFFFFF)}
 private val green by lazy{tone(0xFF13753F,0xFF62D39B)}
 private val greenBg by lazy{tone(0x24178A4C,0x294CC58A)}
 private val amber by lazy{tone(0xFF965400,0xFFF4B862)}
 private val amberBg by lazy{tone(0x2EDE8C14,0x29F2B25C)}
 private val red by lazy{tone(0xFFC4262D,0xFFFF7D82)}
 private val redBg by lazy{tone(0x21E0393E,0x2EF0575C)}
 private val redFill by lazy{tone(0xFFC4262D,0xFFD9363C)}
 private val grey by lazy{tone(0xFF8F9BAD,0xFF6C7A90)}
 private val greyBg by lazy{tone(0x12242C3E,0x12FFFFFF)}
 private val press by lazy{tone(0x1F133396,0x33FFFFFF)}
 private val medium by lazy{Typeface.create("sans-serif-medium",Typeface.NORMAL)}
 private val uy=Locale.forLanguageTag("es-UY")
 private enum class Kind{PRIMARY,DANGER,LINE,SOFT,LINE_DANGER,GO}
 private class Btn(val view:LinearLayout,val label:TextView){fun enable(v:Boolean){view.isEnabled=v;view.alpha=if(v)1f else .5f}}
 private class Tile(val icon:Int,val title:String,val sub:String?,val action:()->Unit)
 private class Shortcut(val icon:Int,val fill:Int,val title:String,val sub:String?,val action:()->Unit)
 private class Fact(val icon:Int,val label:String,val value:String)
 private class FleetItem(val model:String,val plate:String,val driver:String,val state:String,val speed:Double,val meters:Double,val lat:Double,val lng:Double,val at:Long?,val session:JSONObject?)

 private lateinit var shell:LinearLayout
 private lateinit var head:LinearLayout
 private lateinit var root:LinearLayout
 private lateinit var dock:LinearLayout
 // The screens come and go over the room on a stage that stays: going says how the next one comes in (1 forward, from
 // the right; -1 back, from the left; 0 another tab of the bottom bar, in place). leaving counts the ones still going out.
 private var stage:FrameLayout?=null
 private var going=1;private var leaving=0;private var opaque=false;private var again=false
 /** Where the chosen pill of the bottom bar and of each row of options was, so that it slides from there. */
 private var tabAt=-1;private val segAt=HashMap<String,Int>()
 private var topTarget:View?=null
 private lateinit var store:TripStore
 private lateinit var api:Api
 private var screen="";private var name="";private var truck="";private var empty=false
 private var photoJob=0;private var photoBusy=false
 private var photo:File?=null;private var camera:File?=null
 private var distance:TextView?=null;private var speed:TextView?=null;private var limit:TextView?=null;private var status:TextView?=null;private var statusBox:View?=null;private var elapsed:TextView?=null
 private var sync:TextView?=null;private var gps:TextView?=null;private var count:TextView?=null;private var pauseLabel:TextView?=null;private var pauseIcon:ImageView?=null
 private val handler=Handler(Looper.getMainLooper());private val tick=object:Runnable{override fun run(){refresh();handler.postDelayed(this,1000)}}
 private val appVersion:String get()=packageManager.getPackageInfo(packageName,0).versionName?:""
 private val mobile by lazy{MobileData(this)}
 private var tripForm=JSONObject();private var fuelForm=JSONObject();private var docForm=JSONObject();private var draftDocs=JSONArray()
 private var fuelTrip:JSONObject?=null;private var historyTrip:JSONObject?=null;private var docTrip:JSONObject?=null
 private var photoMode="fuel";private var docReturn="prepare";private var historyLimit=50;private var historyQuery="";private var fuelMonth=true
 private var fleetLoadedAt=0L;private var fleetLoading=false
 // Flota en vivo: who is on a trip every minute, the positions every few seconds; these views change in place.
 private var liveLoadedAt=0L;private var liveLoading=false;private var fleetStats:LinearLayout?=null;private var fleetCard:LinearLayout?=null;private var fleetNote:TextView?=null;private var fleetShape=""
 // «Chofer activo»: when the app opens and every 5 minutes while it is open (Presence); the owner sees who has it.
 // presenceAt is on the monotonic clock (a corrected phone clock does not stop the notices); null sends one now.
 private var presenceAt:Long?=null;private var peopleCard:LinearLayout?=null;private var presenceAsked=false
 private var editForm=JSONObject();private var editId:String?=null;private var maintFilter=0;private var maintTruck="";private var papersAt=0L
 private var modePick=UiMode.SIMPLE;private var finishAsk=false;private var tripFilter=0
 // Simple mode asks before starting a trip; startAskAt is when the question came up.
 private var startAsk=false;private var startAskAt=0L
 private var fleetView=false;private var detailFrom="list";private var sheet:android.app.Dialog?=null
 private var perfMonth:YearMonth=YearMonth.now();private var perfDrivers=false;private var perfFailed=false;private var perfLoading:YearMonth?=null
 // Games (decision of 21/10/2026): chess on the phone, against it or between two people, with the truck stopped.
 private var match:ChessMatch?=null;private var board:ChessBoard?=null;private var chessSel=-1;private var chessJob=0;private var thinking=false
 private var chessTop:TextView?=null;private var chessBottom:TextView?=null;private var chessStatus:TextView?=null;private var undoButton:Btn?=null
 private var gamesCheckAt=0L;private var gamesAllowed=true;private var newVsPhone=true;private var newLevel=ChessAi.Level.EASY;private var newSide=0
 // Truco against the phone (decisions of 21 and 22/10/2026): the person is player 0. trucoPick is the card chosen to play.
 private var trucoMatch:Truco.Match?=null;private var trucoUi:TrucoViews?=null;private var trucoPick:Truco.Card?=null;private var trucoJob=0;private var trucoThinking=false
 private val serviceKinds=listOf("Cambio de aceite","Cambio de filtros","Revisión de frenos","Alineación y balanceo","Cubiertas","Revisión general")
 private var activeMap:TripMap.Shown?=null;private var liveMap:TripMap.Live?=null;private var fleetMap:TripMap.Fleet?=null;private var trackOffset=0L
 private val trucks=listOf("Ford Cargo 1722","Mercedes-Benz 1618","Leyland","Mercedes-Benz 1630")
 private fun account()=api.session()?.optJSONObject("user")?.optString("email")?:""
 // Owners see the whole fleet. The company account opens on the fleet panel; an owner who also drives starts like any driver and opens the owner menu from there.
 private fun isOwner()=UiMode.owner(account())
 private fun panelFirst()=UiMode.panelFirst(account())
 private fun ownerDriver()=UiMode.drivingOwner(account())
 private fun uid()=api.session()?.optJSONObject("user")?.optString("id")?:""
 private fun prefs()=getSharedPreferences("gps",MODE_PRIVATE)
 private fun active()=store.current()?.optBoolean("active")==true
 // The mode of use is kept on the phone, one per driver account.
 private fun mode()=UiMode.parse(prefs().getString("mode-${uid()}",null))
 private fun simple()=!panelFirst()&&mode()==UiMode.SIMPLE
 private fun setMode(v:String){prefs().edit().putString("mode-${uid()}",v).apply()}
 // The consent to send the position with the app open, also one per driver account.
 private fun presenceKey()="$PRESENCE_POSITION-${uid()}"

 private val permissions=registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){
  if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED){if(active())try{service()}catch(_:Exception){};homeOrTrip()}
  else AlertDialog.Builder(this).setTitle("Activá la ubicación precisa").setMessage("El cuentakilómetros necesita ubicación precisa. Habilitala en los permisos de la app.").setPositiveButton("Abrir ajustes"){_,_->startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")))}.setNegativeButton("Ahora no",null).show()
 }
 private val notifyPermission=registerForActivityResult(ActivityResultContracts.RequestPermission()){if(screen=="settings")settings()}
 private val take=registerForActivityResult(ActivityResultContracts.TakePicture()){ok->if(ok)camera?.let{preparePhoto(Uri.fromFile(it))}else camera?.delete()}
 private val pick=registerForActivityResult(ActivityResultContracts.GetContent()){uri->if(uri!=null)preparePhoto(uri)}

 override fun onCreate(b:Bundle?){super.onCreate(b);store=TripStore(this);api=Api(this)
  WindowCompat.setDecorFitsSystemWindows(window,false);transparentBars()
  tripForm=JSONObject(b?.getString("tripForm")?:"{}");fuelForm=JSONObject(b?.getString("fuelForm")?:"{}");docForm=JSONObject(b?.getString("docForm")?:"{}");draftDocs=JSONArray(b?.getString("draftDocs")?:"[]")
  fuelTrip=b?.getString("fuelTrip")?.let{JSONObject(it)};docTrip=b?.getString("docTrip")?.let{JSONObject(it)};historyTrip=b?.getString("historyTrip")?.let{JSONObject(it)};photoMode=b?.getString("photoMode")?:"fuel";docReturn=b?.getString("docReturn")?:"prepare"
  camera=b?.getString("camera")?.let{File(it)};photo=b?.getString("photo")?.let{File(it)}?.takeIf{it.exists()};truck=b?.getString("truck")?:prefs().getString("truck","")?:"";empty=b?.getBoolean("empty")?:false
  editForm=JSONObject(b?.getString("editForm")?:"{}");editId=b?.getString("editId");maintTruck=b?.getString("maintTruck")?:"";maintFilter=b?.getInt("maintFilter")?:0
  if(b!=null){fleetView=b.getBoolean("fleetView");tripFilter=b.getInt("tripFilter");historyQuery=b.getString("historyQuery")?:"";historyLimit=b.getInt("historyLimit",50);fuelMonth=b.getBoolean("fuelMonth",true);detailFrom=b.getString("detailFrom")?:"list";perfMonth=b.getString("perfMonth")?.let{try{YearMonth.parse(it)}catch(_:Exception){null}}?:YearMonth.now();perfDrivers=b.getBoolean("perfDrivers")
   b.getString("chessPick")?.split('|')?.let{c->newVsPhone=c.getOrNull(0)!="false";newLevel=ChessAi.Level.entries.firstOrNull{it.name==c.getOrNull(1)}?:ChessAi.Level.EASY;newSide=c.getOrNull(2)?.toIntOrNull()?.coerceIn(0,2)?:0}}
  // A new game's options as they were being picked, or else as they were picked the last time.
  val chessOptions={if(b?.containsKey("chessPick")==true)chessNew() else newChess()}
  onBackPressedDispatcher.addCallback(this,back)
  if(sampleView()){sample(b==null);return}
  // The emulator test of the games (CI) opens them without an account, also after turning the screen: only on a debug
  // build, which never goes to Google Play. Nothing of the games goes out.
  if(api.session()==null&&gamesTest()){intent?.getStringExtra("trf_test_truco")?.takeIf{b==null&&Truco.Match.load(it)!=null}?.let{prefs().edit().putString(trucoKey(),it).apply()}
   when(b?.getString("screen")){"chessnew"->chessOptions();"chess"->chess();"truco"->truco();else->games()};return}
  if(api.session()==null)login() else {name=driverName();when(b?.getString("screen")){"fuel"->fuel();"document"->document();"prepare"->prepare();"newtrip"->newTrip();"maintenance"->maintenance();"maintform"->maintForm();"documents"->documents();"docform"->paperForm();"privacy"->privacy();"mode"->askMode()
   "triphistory"->history("trips",true);"fuelhistory"->history("fuel",true);"tripdetail"->historyTrip?.let{detail(it,true)}?:homeOrTrip();"settings"->settings();"performance"->performance(true);"owner"->ownerDashboard();"games"->games();"chessnew"->chessOptions();"chess"->chess();"truco"->truco();else->homeOrTrip()};Sync.schedule(this);Reminders.schedule(this);refreshCatalog()}
 }
 @Suppress("DEPRECATION") private fun transparentBars(){window.statusBarColor=Color.TRANSPARENT;window.navigationBarColor=Color.TRANSPARENT}
 override fun onSaveInstanceState(b:Bundle){super.onSaveInstanceState(b);b.putString("camera",camera?.path);b.putString("photo",photo?.path);b.putString("screen",screen);b.putString("truck",truck);b.putBoolean("empty",empty);b.putString("tripForm",tripForm.toString());b.putString("fuelForm",fuelForm.toString());b.putString("docForm",docForm.toString());b.putString("draftDocs",draftDocs.toString());b.putString("fuelTrip",fuelTrip?.toString());b.putString("docTrip",docTrip?.toString());b.putString("historyTrip",historyTrip?.toString());b.putString("photoMode",photoMode);b.putString("docReturn",docReturn);b.putString("editForm",editForm.toString());b.putString("editId",editId);b.putString("maintTruck",maintTruck);b.putInt("maintFilter",maintFilter)
  b.putBoolean("fleetView",fleetView);b.putInt("tripFilter",tripFilter);b.putString("historyQuery",historyQuery);b.putInt("historyLimit",historyLimit);b.putBoolean("fuelMonth",fuelMonth);b.putString("detailFrom",detailFrom);b.putString("perfMonth",perfMonth.toString());b.putBoolean("perfDrivers",perfDrivers)
  if(screen=="chessnew")b.putString("chessPick","$newVsPhone|${newLevel.name}|$newSide")}
 override fun onStart(){super.onStart();Presence.opened();presenceAt=null;handler.post(tick)}
 override fun onDestroy(){photoJob++;chessJob++;trucoJob++;sheet?.dismiss();sheet=null;activeMap?.destroy();activeMap=null;liveMap=null;fleetMap=null;super.onDestroy()}
 override fun onStop(){handler.removeCallbacks(tick);Presence.closed();super.onStop()}
 // Screens where back stays inside the app; on the rest the system back gesture leaves it.
 private val innerScreens=setOf("fuel","document","prepare","newtrip","trip","triphistory","fuelhistory","settings","privacy","tripdetail","maintenance","documents","maintform","docform","performance","games","chessnew","chess","truco")
 private val back=object:OnBackPressedCallback(false){override fun handleOnBackPressed(){going=-1;when(screen){
  "fuel"->homeOrTrip()
  "document"->backFromDocument()
  "prepare"->newTrip()
  "newtrip","trip"->home()
  "triphistory","fuelhistory"->if(fleetView||panelFirst())homeOrTrip() else home()
  "settings"->if(panelFirst())ownerDashboard() else home()
  "privacy"->if(api.session()==null)login() else settings()
  "tripdetail"->leaveDetail()
  "maintenance","documents","owner","performance"->homeOrTrip()
  "maintform"->maintenance()
  "docform"->documents()
  "mode"->homeOrTrip()
  "games"->homeOrTrip()
  "chessnew","chess","truco"->games()
  // Only enabled while the question before starting a trip is up: back answers "no".
  "simplehome"->simpleHome()
 };going=1}}
 private fun refreshCatalog(){thread{try{mobile.catalog(true);runOnUiThread{if(screen=="prepare")prepare() else if(screen=="newtrip")newTrip()}}catch(_:Exception){}}}

 // ---------- Building blocks ----------
 private fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
 private fun dpf(n:Float)=n*resources.displayMetrics.density
 private fun bg(color:Int,r:Int=12)=GradientDrawable().apply{setColor(color);cornerRadius=dpf(r.toFloat())}
 private fun outline(color:Int,edge:Int,r:Int=12)=GradientDrawable().apply{setColor(color);cornerRadius=dpf(r.toFloat());setStroke(dp(1),edge)}
 private fun oval(color:Int)=GradientDrawable().apply{shape=GradientDrawable.OVAL;setColor(color)}
 /** The panel's featured blue: the logo's, lighter at the top left. */
 private fun featured()=GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(tone(0xFF2F58D8,0xFF3155D0),tone(0xFF133396,0xFF22409F))).apply{shape=GradientDrawable.OVAL}
 /** A glass card: translucent, with a hairline edge that catches the light. */
 private fun glassy(r:Int=20)=outline(cardBg,glassLine,r)
 /** A field, the panel's: glass, with a blue edge while it is being written in. */
 private fun fieldLook(r:Int=14)=StateListDrawable().apply{addState(intArrayOf(android.R.attr.state_focused),outline(fieldFill,blue,r).apply{setStroke(dp(2),blue)});addState(intArrayOf(),outline(fieldFill,fieldLine,r))}
 /** What is filled in a solid colour glows a little of that colour under it, like the panel's main buttons. */
 private fun glow(v:View,color:Int,height:Float=3f){v.elevation=dpf(height);if(Build.VERSION.SDK_INT>=28){v.outlineSpotShadowColor=color;v.outlineAmbientShadowColor=color}}
 private fun moves()=ValueAnimator.areAnimatorsEnabled()
 private val ease by lazy{PathInterpolator(.2f,0f,0f,1f)}
 /** What is tapped sinks a little under the finger and comes back when let go; the tap itself goes on as always. */
 @SuppressLint("ClickableViewAccessibility")
 private fun sink(v:View,to:Float=.97f){v.setOnTouchListener{x,e->when(e.actionMasked){MotionEvent.ACTION_DOWN->if(moves())x.animate().scaleX(to).scaleY(to).setStartDelay(0).setDuration(90).setInterpolator(DecelerateInterpolator()).start();MotionEvent.ACTION_UP,MotionEvent.ACTION_CANCEL->x.animate().scaleX(1f).scaleY(1f).setStartDelay(0).setDuration(180).setInterpolator(ease).start()};false}}
 /** A short buzz for what matters: starting and finishing a trip, saving. */
 private fun buzz(v:View){v.performHapticFeedback(if(Build.VERSION.SDK_INT>=30)HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY)}
 /** Slides a chosen pill from one slot to another. */
 private fun slide(pill:Slider,from:Int,to:Int){
  if(from==to||from<0||!moves()){pill.at=to.toFloat();return}
  pill.at=from.toFloat();ValueAnimator.ofFloat(from.toFloat(),to.toFloat()).apply{duration=300;interpolator=ease;addUpdateListener{pill.at=it.animatedValue as Float}}.start()
 }
 private fun ripple(content:Drawable?,tint:Int=press):Drawable=RippleDrawable(ColorStateList.valueOf(tint),content,if(content==null)ColorDrawable(Color.WHITE) else null)
 /** Only the touch ripple, rounded. */
 private fun touch(r:Int,tint:Int=press):Drawable=RippleDrawable(ColorStateList.valueOf(tint),null,bg(Color.WHITE,r))
 private fun tinted(res:Int,color:Int,size:Int=20):Drawable=getDrawable(res)!!.mutate().apply{setTint(color);setBounds(0,0,dp(size),dp(size))}
 private fun hex(c:Int)=String.format("#%06X",0xFFFFFF and c)
 private fun iconView(res:Int,color:Int,size:Int=22)=ImageView(this).apply{setImageResource(res);imageTintList=ColorStateList.valueOf(color);importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO;layoutParams=LinearLayout.LayoutParams(dp(size),dp(size))}
 private fun tv(s:CharSequence,size:Float,color:Int=ink,weight:Int=0)=TextView(this).apply{text=s;textSize=size;setTextColor(color);typeface=when(weight){1->medium;2->Typeface.DEFAULT_BOLD;else->Typeface.DEFAULT}}
 private fun text(p:LinearLayout,s:CharSequence,size:Float,color:Int=ink,weight:Int=0,top:Int=0):TextView{val v=tv(s,size,color,weight);p.addView(v,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(top)});return v}
 private fun caption(p:LinearLayout,s:String,top:Int=14)=text(p,s,13.5f,muted,1,top)
 private fun section(s:String)=text(root,s,17f,ink,1,24)
 private fun note(s:String,p:LinearLayout=root,top:Int=12)=text(p,s,13.5f,muted,0,top).apply{setLineSpacing(0f,1.15f)}
 private fun divider(p:LinearLayout,start:Int=0)=p.addView(View(this).apply{setBackgroundColor(line)},LinearLayout.LayoutParams(-1,1).apply{marginStart=dp(start)})
 private fun card(p:LinearLayout=root,pad:Int=0,top:Int=12):LinearLayout{
  val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=glassy();clipToOutline=true;setPadding(dp(pad),dp(pad),dp(pad),dp(pad))}
  p.addView(v,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(top)});return v
 }
 private fun square(res:Int,color:Int,fill:Int,size:Int=40,inner:Int=22)=FrameLayout(this).apply{background=bg(fill,size/3);addView(ImageView(this@MainActivity).apply{setImageResource(res);imageTintList=ColorStateList.valueOf(color)},FrameLayout.LayoutParams(dp(inner),dp(inner),Gravity.CENTER));importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS;layoutParams=LinearLayout.LayoutParams(dp(size),dp(size))}
 private fun pill(s:String,fg:Int,fill:Int)=tv(s,12f,fg,1).apply{background=bg(fill,12);setPadding(dp(10),dp(4),dp(10),dp(5));layoutParams=LinearLayout.LayoutParams(-2,-2)}
 private fun row(p:LinearLayout,icon:Int?,title:String,sub:String?=null,subColor:Int=muted,trailing:View?=null,tint:Int=blue,action:(()->Unit)?=null):TextView?{
  if(p.childCount>0)divider(p,if(icon!=null)56 else 16)
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;minimumHeight=dp(60);setPadding(dp(16),dp(10),dp(12),dp(10))}
  if(icon!=null)r.addView(iconView(icon,tint,22))
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(if(icon!=null)18 else 0),0,dp(8),0)}
  col.addView(tv(title,15.5f,ink,1));val subView=sub?.let{tv(it,13.5f,subColor).apply{setPadding(0,dp(2),0,0)}};if(subView!=null)col.addView(subView)
  r.addView(col,LinearLayout.LayoutParams(0,-2,1f))
  if(trailing!=null)r.addView(trailing)
  if(action!=null){if(trailing==null)r.addView(iconView(R.drawable.ic_chevron,faint,20));r.background=ripple(null);r.isClickable=true;r.isFocusable=true;r.setOnClickListener{action()}}
  p.addView(r,LinearLayout.LayoutParams(-1,-2));return subView
 }
 private fun fact(p:LinearLayout,icon:Int,label:String,value:String,trailing:View?=null){
  if(p.childCount>0)divider(p,56)
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(16),dp(11),dp(14),dp(11))}
  r.addView(iconView(icon,blue,22))
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(18),0,dp(8),0)}
  col.addView(tv(label,13f,muted));col.addView(tv(value,15.5f,ink,1).apply{setPadding(0,dp(2),0,0)})
  r.addView(col,LinearLayout.LayoutParams(0,-2,1f));if(trailing!=null)r.addView(trailing)
  p.addView(r,LinearLayout.LayoutParams(-1,-2))
 }
 /** How a button of a kind looks: its background with the touch ripple, its text colour, and whether it is solid. */
 private fun buttonLook(kind:Kind):Triple<Drawable,Int,Boolean>{
  val solid=kind==Kind.PRIMARY||kind==Kind.DANGER||kind==Kind.GO
  val fg=when(kind){Kind.PRIMARY,Kind.DANGER,Kind.GO->Color.WHITE;Kind.LINE_DANGER->red;Kind.SOFT->blue;else->ink}
  // Pills, the panel's buttons: the quiet ones on glass with a hairline edge.
  val shape=when(kind){Kind.LINE->outline(fillOf(kind),tone(0x24242C3E,0x24FFFFFF),27);Kind.LINE_DANGER->outline(fillOf(kind),tone(0x47C4262D,0x47FF7D82),27);else->bg(fillOf(kind),27)}
  return Triple(ripple(shape,if(solid)0x40FFFFFF else press),fg,solid)
 }
 private fun fillOf(kind:Kind)=when(kind){Kind.PRIMARY->brand;Kind.DANGER->redFill;Kind.GO->0xFF178A4C.toInt();Kind.SOFT->blueSoft;else->btnFill}
 private fun button(p:LinearLayout,s:String,kind:Kind=Kind.PRIMARY,icon:Int?=null,top:Int=12,action:()->Unit):Btn{
  val (look,fg,solid)=buttonLook(kind)
  val v=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER;background=look;isClickable=true;isFocusable=true;contentDescription=s;setPadding(dp(18),0,dp(18),0);if(solid)glow(this,fillOf(kind))}
  if(icon!=null)v.addView(iconView(icon,fg,20).apply{(layoutParams as LinearLayout.LayoutParams).marginEnd=dp(10)})
  val label=tv(s,16f,fg,1).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END};v.addView(label)
  v.setOnClickListener{if(kind==Kind.GO||kind==Kind.DANGER)buzz(it);action()};sink(v);p.addView(v,LinearLayout.LayoutParams(-1,dp(54)).apply{topMargin=dp(top)});return Btn(v,label)
 }
 private fun link(p:LinearLayout,s:String,top:Int=8,color:Int=blue,action:()->Unit)=tv(s,15f,color,1).apply{gravity=Gravity.CENTER;minHeight=dp(48);background=ripple(null);isClickable=true;isFocusable=true;setOnClickListener{action()};p.addView(this,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(top)})}
 /** A field of a form. The phone's autofill stays out: it filled «Otro tipo» with the account's email. The sign-in fields (signField) keep it. */
 private fun input(type:Int,hint:String="")=EditText(this).apply{inputType=type;textSize=16f;setTextColor(ink);setHintTextColor(faint);this.hint=hint;background=fieldLook();setPadding(dp(14),0,dp(14),0);importantForAutofill=View.IMPORTANT_FOR_AUTOFILL_NO}
 private fun field(p:LinearLayout,title:String,type:Int,hint:String=""):EditText{caption(p,title);val e=input(type,hint);p.addView(e,LinearLayout.LayoutParams(-1,dp(52)).apply{topMargin=dp(6)});return e}
 private fun bind(v:EditText,data:JSONObject,key:String){
  v.setText(data.optString(key).takeUnless{it=="null"}?:"")
  v.addTextChangedListener(object:TextWatcher{override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){};override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){data.put(key,s.toString())};override fun afterTextChanged(e:Editable?){}})
 }
 private fun bound(c:LinearLayout,title:String,data:JSONObject,key:String,number:Boolean=false,hint:String=""):EditText{val v=field(c,title,if(number)InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL else InputType.TYPE_CLASS_TEXT,hint);bind(v,data,key);return v}
 private fun spinnerAdapter(items:List<String>)=object:ArrayAdapter<String>(this,android.R.layout.simple_spinner_item,items){
  override fun getView(position:Int,convertView:View?,parent:ViewGroup):View=(super.getView(position,convertView,parent) as TextView).apply{setTextColor(ink);textSize=16f;setPadding(dp(14),0,dp(40),0);maxLines=1;ellipsize=TextUtils.TruncateAt.END}
 }.apply{setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)}
 private fun spinnerBg():Drawable=LayerDrawable(arrayOf(outline(fieldFill,fieldLine,14),getDrawable(R.drawable.ic_expand)!!.mutate().apply{setTint(muted)})).apply{setLayerGravity(1,Gravity.END or Gravity.CENTER_VERTICAL);setLayerInsetEnd(1,dp(12));setLayerSize(1,dp(22),dp(22))}
 private fun select(c:LinearLayout,title:String,data:JSONObject,key:String,values:List<String>,changed:(String)->Unit={}){
  caption(c,title);val options=listOf("Sin seleccionar")+(values+data.optString(key)).distinct().filter{it.isNotBlank()}
  val spinner=Spinner(this).apply{adapter=spinnerAdapter(options);background=spinnerBg();setPopupBackgroundDrawable(bg(menuFill,16))};c.addView(spinner,LinearLayout.LayoutParams(-1,dp(52)).apply{topMargin=dp(6)})
  spinner.setSelection(options.indexOf(data.optString(key)).coerceAtLeast(0));spinner.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,pos:Int,id:Long){val next=if(pos==0)"" else options[pos];val previous=data.optString(key);data.put(key,next);if(previous!=next)changed(next)}}
 }
 private fun radio(p:LinearLayout,title:String,selected:Boolean,action:()->Unit){
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;minimumHeight=dp(56);setPadding(dp(14),dp(8),dp(14),dp(8));background=ripple(if(selected)outline(blueSoft,blue,16) else outline(fieldFill,fieldLine,16));isClickable=true;isFocusable=true;contentDescription=title+if(selected)", elegido" else "";setOnClickListener{action()}}
  r.addView(if(selected)iconView(R.drawable.ic_check_circle,blue,24) else View(this).apply{background=GradientDrawable().apply{shape=GradientDrawable.OVAL;setStroke(dp(2),faint)};layoutParams=LinearLayout.LayoutParams(dp(22),dp(22)).apply{marginStart=dp(1);marginEnd=dp(1)}})
  r.addView(tv(title,15.5f,ink,1).apply{setPadding(dp(14),0,0,0)},LinearLayout.LayoutParams(0,-2,1f))
  p.addView(r,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(10)})
 }
 private fun segmented(p:LinearLayout,options:List<String>,selected:Int,top:Int=12,change:(Int)->Unit){
  // The panel's switch: the chosen option on a light pill, which slides from the one chosen before when the screen is
  // drawn again for the change.
  val key=options.joinToString("|");val from=if(again)segAt[key]?:selected else selected;segAt[key]=selected
  val chosen=Slider(raised,options.size,dpf(4f),if(dark)0 else 0x29000000)
  val box=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;background=LayerDrawable(arrayOf(outline(greyBg,glassLine,24),chosen));clipToOutline=true;setPadding(dp(4),dp(4),dp(4),dp(4))}
  options.forEachIndexed{i,s->val on=i==selected;box.addView(tv(s,14f,if(on)ink else inkSoft,1).apply{gravity=Gravity.CENTER;background=if(on)null else touch(20);isClickable=true;isFocusable=true;contentDescription=s+if(on)", elegido" else "";setOnClickListener{if(!on)change(i)}},LinearLayout.LayoutParams(0,dp(40),1f))}
  p.addView(box,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(top)})
  slide(chosen,from,selected)
 }
 private fun searchBox(p:LinearLayout,hint:String,value:String):EditText{
  val box=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;background=fieldLook(25);setAddStatesFromChildren(true);setPadding(dp(16),0,dp(8),0)}
  box.addView(iconView(R.drawable.ic_search,faint,20))
  val e=EditText(this).apply{inputType=InputType.TYPE_CLASS_TEXT;imeOptions=EditorInfo.IME_ACTION_SEARCH;textSize=15.5f;setTextColor(ink);setHintTextColor(faint);this.hint=hint;background=null;setPadding(dp(10),0,dp(4),0);setText(value);importantForAutofill=View.IMPORTANT_FOR_AUTOFILL_NO}
  box.addView(e,LinearLayout.LayoutParams(0,-1,1f));p.addView(box,LinearLayout.LayoutParams(-1,dp(50)).apply{topMargin=dp(12)});return e
 }
 private fun tileGrid(items:List<Tile>){
  for(i in items.indices step 2){val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};root.addView(r,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(12)})
   for(j in i until minOf(i+2,items.size)){val t=items[j]
    val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=ripple(glassy(22));setPadding(dp(16),dp(16),dp(12),dp(14));isClickable=true;isFocusable=true;contentDescription=t.title+(t.sub?.let{". $it"}?:"");setOnClickListener{t.action()}};sink(v)
    v.addView(square(t.icon,blue,blueSoft,44,24));v.addView(tv(t.title,15.5f,ink,1).apply{setPadding(0,dp(12),0,0)});if(t.sub!=null)v.addView(tv(t.sub,13f,muted).apply{setPadding(0,dp(2),0,0)})
    r.addView(v,LinearLayout.LayoutParams(0,-1,1f).apply{if(j%2==1)marginStart=dp(12)})}}
 }
 private fun menuList(items:List<Shortcut>)=menuRows(card(),items)
 /** Rows with a coloured icon. before runs ahead of each action, for a menu that has to close first. */
 private fun menuRows(c:LinearLayout,items:List<Shortcut>,before:()->Unit={}){
  for(e in items){if(c.childCount>0)divider(c,72)
   val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;minimumHeight=dp(62);setPadding(dp(14),dp(8),dp(12),dp(8));background=ripple(null);isClickable=true;isFocusable=true;contentDescription=e.title+(e.sub?.let{". $it"}?:"");setOnClickListener{before();e.action()}}
   r.addView(square(e.icon,Color.WHITE,e.fill,42,24))
   val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(16),0,dp(8),0)}
   col.addView(tv(e.title,16.5f,ink,1));if(e.sub!=null)col.addView(tv(e.sub,13.5f,muted).apply{setPadding(0,dp(2),0,0)})
   r.addView(col,LinearLayout.LayoutParams(0,-2,1f));r.addView(iconView(R.drawable.ic_chevron,faint,20))
   c.addView(r,LinearLayout.LayoutParams(-1,-2))}
 }
 private fun factsGrid(c:LinearLayout,items:List<Fact>):List<TextView>{
  val values=mutableListOf<TextView>()
  for(i in items.indices step 2){if(i>0)divider(c)
   val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL}
   for(j in i until minOf(i+2,items.size)){if(j%2==1)r.addView(View(this).apply{setBackgroundColor(line)},LinearLayout.LayoutParams(1,-1))
    val f=items[j];val cell=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(14),dp(12),dp(10),dp(12))}
    cell.addView(iconView(f.icon,blue,20));val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(10),0,0,0)}
    col.addView(tv(f.label,12.5f,muted));val v=tv(f.value,15.5f,ink,1).apply{maxLines=2;ellipsize=TextUtils.TruncateAt.END};col.addView(v);values.add(v)
    cell.addView(col,LinearLayout.LayoutParams(0,-2,1f));r.addView(cell,LinearLayout.LayoutParams(0,-1,1f))}
   c.addView(r,LinearLayout.LayoutParams(-1,-2))}
  return values
 }
 private fun kpi(p:LinearLayout,label:String,value:String,index:Int,lines:Int=1){
  val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=glassy();setPadding(dp(16),dp(14),dp(12),dp(14))}
  v.addView(tv(label,13.5f,muted));v.addView(tv(value,22f,ink,2).apply{setPadding(0,dp(4),0,0);maxLines=lines});v.contentDescription="$label: $value"
  // Full height of the row: cards stay the same size when one shows two lines.
  p.addView(v,LinearLayout.LayoutParams(0,-1,1f).apply{if(index>0)marginStart=dp(12)})
 }
 private fun stat(p:LinearLayout,value:String,label:String,color:Int,index:Int){
  val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=glassy();setPadding(dp(14),dp(12),dp(10),dp(12))}
  v.addView(tv(value,24f,ink,2))
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(0,dp(2),0,0)}
  r.addView(View(this).apply{background=oval(color)},LinearLayout.LayoutParams(dp(8),dp(8)));r.addView(tv(label,13f,muted).apply{setPadding(dp(6),0,0,0);maxLines=1})
  v.addView(r);v.contentDescription="$value $label";p.addView(v,LinearLayout.LayoutParams(0,-2,1f).apply{if(index>0)marginStart=dp(10)})
 }
 private fun emptyCard(icon:Int,title:String,sub:String){
  val c=card(pad=24);c.gravity=Gravity.CENTER_HORIZONTAL
  c.addView(square(icon,muted,greyBg,52,28))
  text(c,title,16f,ink,1,12).gravity=Gravity.CENTER;text(c,sub,14f,muted,0,4).gravity=Gravity.CENTER
 }

 // ---------- Page frame: the room, a floating bar on top, scrolling content, optional bottom dock and navigation ----------
 /** Screens read at a glance, on a trip or in simple mode: their cards are nearly solid. */
 private val solidScreens=setOf("trip","simpletrip","simplehome")
 private fun page(key:String,header:Boolean=true){
  // The map of the screen going out goes blank before it closes, so that it does not show black while it leaves.
  activeMap?.view?.visibility=View.INVISIBLE
  activeMap?.destroy();activeMap=null;liveMap=null;fleetMap=null
  // The same screen drawn again (a choice, new data) stays where it was, without moving; another one comes in.
  again=key==screen&&stage!=null;val move=going;going=1
  val keep=if(again)(root.parent as? ScrollView)?.scrollY?:0 else 0
  val before=if(stage!=null)shell else null
  screen=key;back.isEnabled=key in innerScreens;fleetStats=null;fleetCard=null;fleetNote=null;peopleCard=null;opaque=key in solidScreens
  distance=null;speed=null;limit=null;status=null;statusBox=null;elapsed=null;sync=null;gps=null;count=null;pauseLabel=null;pauseIcon=null
  // Leaving the board drops the phone's move on its way.
  board=null;chessTop=null;chessBottom=null;chessStatus=null;undoButton=null;if(key!="chess"){chessJob++;thinking=false}
  trucoUi=null;if(key!="truco"){trucoJob++;trucoThinking=false}
  shell=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
  head=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;visibility=if(header)View.VISIBLE else View.GONE}
  shell.addView(head,LinearLayout.LayoutParams(-1,-2));topTarget=head
  // The content fades out at the edges where it scrolls under the bar and the dock.
  val scroll=ScrollView(this).apply{isFillViewport=true;isVerticalScrollBarEnabled=false;overScrollMode=View.OVER_SCROLL_NEVER;isVerticalFadingEdgeEnabled=true;setFadingEdgeLength(dp(14))}
  root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),dp(6),dp(14),dp(24))}
  scroll.addView(root);shell.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
  dock=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),dp(8),dp(14),dp(12));visibility=View.GONE}
  shell.addView(dock,LinearLayout.LayoutParams(-1,-2))
  // Touches wait while a screen goes out, so that they do not land on it.
  val st=stage?:object:FrameLayout(this){override fun onInterceptTouchEvent(e:MotionEvent)=leaving>0||super.onInterceptTouchEvent(e)}.also{stage=it;it.background=ColorDrawable(roomTone);setContentView(it);showRoom(it)}
  st.addView(shell,FrameLayout.LayoutParams(-1,-1))
  ViewCompat.setOnApplyWindowInsetsListener(shell){v,i->fitBars(v,i);i}
  // Each screen takes the sizes of the system bars the window already has and asks for its own pass.
  ViewCompat.getRootWindowInsets(st)?.let{fitBars(shell,it)};shell.requestApplyInsets()
  WindowCompat.getInsetsController(window,window.decorView).apply{isAppearanceLightStatusBars=!dark;isAppearanceLightNavigationBars=!dark}
  if(keep>0)scroll.addOnLayoutChangeListener(object:View.OnLayoutChangeListener{override fun onLayoutChange(v:View,a:Int,b:Int,c:Int,d:Int,e:Int,f:Int,g:Int,h:Int){v.removeOnLayoutChangeListener(this);(v as ScrollView).scrollTo(0,keep)}})
  if(before!=null)swap(st,before,if(again)null else move)
  // The first screen, when the app opens, fades in.
  else if(moves()){shell.alpha=0f;shell.animate().alpha(1f).setDuration(220).setInterpolator(ease).start();rise()}
 }
 /**
  * The screen going out and the one coming in (decision of 28/10/2026): from the right going forward, from the left
  * going back, in place for a tab of the bottom bar; at once when it is the same screen or the phone has animations off.
  */
 private fun swap(st:FrameLayout,old:View,move:Int?){
  if(move==null||!moves()){st.removeView(old);return}
  leaving++;val far=dpf(32f)
  old.animate().alpha(0f).translationX(-move*far*.6f).setStartDelay(0).setDuration(110).setInterpolator(AccelerateInterpolator()).withEndAction{st.removeView(old);leaving--}.start()
  shell.alpha=0f;shell.translationX=move*far;if(move==0){shell.scaleX=.98f;shell.scaleY=.98f}
  shell.animate().alpha(1f).translationX(0f).scaleX(1f).scaleY(1f).setStartDelay(60).setDuration(if(move==0)220L else 280L).setInterpolator(ease).start()
  if(move!=-1)rise()
 }
 /** The first cards of a screen that comes in rise one after the other; not with a map, which does not fade. */
 private fun rise(){
  val r=root
  r.viewTreeObserver.addOnPreDrawListener(object:ViewTreeObserver.OnPreDrawListener{override fun onPreDraw():Boolean{
   r.viewTreeObserver.removeOnPreDrawListener(this)
   if(r===root&&activeMap==null)for(i in 0 until minOf(r.childCount,7)){val c=r.getChildAt(i);c.alpha=0f;c.translationY=dpf(14f)
    c.animate().alpha(1f).translationY(0f).setStartDelay(80L+i*30L).setDuration(260).setInterpolator(ease).start()}
   return true}})
 }
 /** The photo of the room is opened once, aside; until then the room is its colour, and the photo fades in. */
 private fun showRoom(st:FrameLayout){
  val night=dark;roomPhoto?.takeIf{it.first==night}?.let{st.background=Room(it.second);return}
  thread{val photo=try{BitmapFactory.decodeResource(resources,if(night)R.drawable.fondo_oscuro else R.drawable.fondo_claro,BitmapFactory.Options().apply{inSampleSize=2})}catch(_:Throwable){null}
   if(photo!=null)runOnUiThread{roomPhoto=Pair(night,photo);if(stage===st&&!isDestroyed)st.background=TransitionDrawable(arrayOf(ColorDrawable(roomTone),Room(photo))).apply{isCrossFadeEnabled=true;startTransition(240)}}}
 }
 /** Keeps a screen clear of the status bar, the navigation bar and the keyboard. */
 private fun fitBars(v:View,i:WindowInsetsCompat){val bars=i.getInsets(WindowInsetsCompat.Type.systemBars());val ime=i.getInsets(WindowInsetsCompat.Type.ime())
  topTarget?.let{it.setPadding(it.paddingLeft,bars.top,it.paddingRight,it.paddingBottom)}
  v.setPadding(bars.left,0,bars.right,max(bars.bottom,ime.bottom))}
 private fun barButton(res:Int,desc:String,action:()->Unit)=ImageView(this).apply{setImageResource(res);imageTintList=ColorStateList.valueOf(ink);setPadding(dp(12),dp(12),dp(12),dp(12));background=RippleDrawable(ColorStateList.valueOf(press),null,null);contentDescription=desc;isClickable=true;isFocusable=true;setOnClickListener{action()};layoutParams=LinearLayout.LayoutParams(dp(48),dp(48))}
 private fun plusButton(desc:String,action:()->Unit)=ImageView(this).apply{setImageResource(R.drawable.ic_plus);imageTintList=ColorStateList.valueOf(Color.WHITE);setPadding(dp(9),dp(9),dp(9),dp(9));background=ripple(oval(brand),0x40FFFFFF);glow(this,brand);contentDescription=desc;isClickable=true;isFocusable=true;setOnClickListener{action()};sink(this,.92f);layoutParams=LinearLayout.LayoutParams(dp(40),dp(40)).apply{marginEnd=dp(6)}}
 private fun chip(s:String)=tv(s,13f,inkSoft,1).apply{background=bg(greyBg,14);setPadding(dp(12),dp(5),dp(12),dp(6));layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginEnd=dp(8)}}
 /** The bar on top, the panel's: a pill of glass floating over the room. */
 private fun floating(r:LinearLayout,height:Int){r.background=outline(float,glassLine,height/2);head.addView(r,LinearLayout.LayoutParams(-1,dp(height)).apply{setMargins(dp(10),dp(6),dp(10),dp(4))})}
 private fun bar(title:String,back:(()->Unit)?=null,trailing:View?=null){
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(if(back==null)20 else 4),0,dp(4),0)}
  if(back!=null)r.addView(barButton(R.drawable.ic_back,"Volver"){going=-1;back();going=1})
  r.addView(tv(title,18.5f,ink,1).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END;setPadding(dp(if(back==null)0 else 4),0,dp(8),0)},LinearLayout.LayoutParams(0,-2,1f))
  if(trailing!=null)r.addView(trailing)
  floating(r,56)
 }
 private fun initials(s:String)=s.split(" ").filter{it.isNotBlank()}.take(2).joinToString(""){it.take(1).uppercase()}.ifBlank{"TF"}
 private fun hello(small:String,big:String,trailing:View?=null){
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(8),0,dp(6),0)}
  r.addView(tv(initials(name),15f,Color.WHITE,1).apply{gravity=Gravity.CENTER;background=featured();importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO},LinearLayout.LayoutParams(dp(46),dp(46)))
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(12),0,dp(8),0)}
  col.addView(tv(small,13.5f,muted));col.addView(tv(big,19f,ink,2).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END})
  r.addView(col,LinearLayout.LayoutParams(0,-2,1f));if(trailing!=null)r.addView(trailing)
  floating(r,62)
 }
 /** The bottom bar: a pill of glass with the chosen tab on a lighter pill, which slides there from the tab left. */
 private fun navBar(active:String){
  val items=listOf(if(panelFirst())Triple("owner",R.drawable.ic_map,"Flota") else Triple("home",R.drawable.ic_home,"Inicio"),Triple("trips",R.drawable.ic_route,"Viajes"),Triple("fuel",R.drawable.ic_fuel,"Combustible"),Triple("more",R.drawable.ic_more,"Más"))
  val at=items.indexOfFirst{it.first==active};val chosen=Slider(railOn,items.size,dpf(6f),if(dark)0 else 0x24000000)
  val nav=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;background=LayerDrawable(arrayOf(outline(float,glassLine,34),chosen));setPadding(dp(6),dp(6),dp(6),dp(6))}
  for((i,item) in items.withIndex()){val (key,res,label)=item;val on=i==at;val color=if(on)railInk else muted
   val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;background=touch(28);isClickable=true;isFocusable=true;isSelected=on;contentDescription=label;setOnClickListener{if(!on){going=0;go(key);going=1}}}
   v.addView(iconView(res,color,22));v.addView(tv(label,11.5f,color,if(on)1 else 0).apply{gravity=Gravity.CENTER;maxLines=1;setPadding(0,dp(2),0,0)})
   nav.addView(v,LinearLayout.LayoutParams(0,dp(56),1f))}
  shell.addView(nav,LinearLayout.LayoutParams(-1,-2).apply{setMargins(dp(12),dp(2),dp(12),dp(10))})
  slide(chosen,if(tabAt>=0&&!again)tabAt else at,at);tabAt=at
 }
 private fun go(key:String){when(key){"home"->home();"owner"->ownerDashboard();"trips"->openHistory("trips",panelFirst());"fuel"->openHistory("fuel",panelFirst());else->settings()}}

 // ---------- Login ----------
 private fun login(){
  page("login",header=false);root.setPadding(dp(14),0,dp(14),dp(24))
  // Whoever signs in next starts on their own lists, sends their notice at once and is asked for their own consent.
  fleetView=false;detailFrom="list";presenceAt=null;presenceAsked=false
  val top=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};root.addView(top,LinearLayout.LayoutParams(-1,-2));topTarget=top
  // The truck at dusk in a frame of glass, with the logo over its sky; the form on a card of glass, the panel's.
  val hero=FrameLayout(this).apply{background=outline(0xFF0B1630.toInt(),glassLine,28);clipToOutline=true}
  hero.addView(ImageView(this).apply{setImageResource(R.drawable.login_scene);scaleType=ImageView.ScaleType.CENTER_CROP;importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO},FrameLayout.LayoutParams(-1,-1))
  hero.addView(ImageView(this).apply{setImageResource(R.drawable.tr_ferreira_logo);adjustViewBounds=true;contentDescription="TR Ferreira"},FrameLayout.LayoutParams(dp(220),-2,Gravity.CENTER_HORIZONTAL).apply{topMargin=dp(26)})
  top.addView(hero,LinearLayout.LayoutParams(-1,dp(270)).apply{topMargin=dp(8)})
  val form=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=outline(float,glassLine,28);setPadding(dp(20),dp(22),dp(20),dp(14))}
  root.addView(form,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(12)})
  text(form,"Tu viaje empieza acá.",25f,ink,2).letterSpacing=-.01f
  text(form,"Ingresá con tu cuenta de chofer.",15.5f,muted,0,4)
  val email=signField(form,R.drawable.ic_mail,"Correo electrónico",InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,18);email.setText(prefs().getString("email",""))
  val pass=signField(form,R.drawable.ic_lock,"Contraseña",InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,10)
  val msg=text(form,"",14f,red,0,10)
  lateinit var submit:Btn
  submit=button(form,"Ingresar",top=6){val e=email.text.toString().trim().lowercase();val p=pass.text.toString();if(e.isBlank()||p.isBlank()){msg.text="Completá correo y contraseña";return@button};submit.enable(false);msg.setTextColor(muted);msg.text="Ingresando…"
   thread{try{api.login(e,p);name=driverName();runOnUiThread{pass.text.clear();if(panelFirst())ownerDashboard() else askMode();Sync.schedule(this);Reminders.schedule(this);refreshCatalog()}}catch(_:Exception){runOnUiThread{submit.enable(true);msg.setTextColor(red);msg.text="No se pudo ingresar. Revisá tus datos y la conexión."}}}}
  text(form,"Tu sesión queda guardada de forma segura en este teléfono.",13f,muted,0,16).gravity=Gravity.CENTER
  link(form,"Política de privacidad",top=2,color=blue){privacy()}
 }
 /** A field of the sign-in, with its icon; these keep the phone's autofill for the email and the password. */
 private fun signField(p:LinearLayout,icon:Int,hint:String,type:Int,top:Int):EditText{
  val box=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;background=fieldLook(16);setAddStatesFromChildren(true);setPadding(dp(16),0,dp(8),0)}
  box.addView(iconView(icon,muted,20))
  val e=EditText(this).apply{inputType=type;textSize=16f;setTextColor(ink);setHintTextColor(faint);this.hint=hint;background=null;setPadding(dp(12),0,dp(4),0)}
  box.addView(e,LinearLayout.LayoutParams(0,-1,1f));p.addView(box,LinearLayout.LayoutParams(-1,dp(54)).apply{topMargin=dp(top)});return e
 }
 private fun driverName():String{val u=api.session()?.optJSONObject("user")?:return "Chofer";val m=u.optJSONObject("user_metadata");val known=mapOf("immer@trferreira.com" to "Immer Sampayo","luis@trferreira.com" to "Luis Ferreira","hugo@trferreira.com" to "Hugo Silva","transportesferreirauy@gmail.com" to "Transportes Ferreira");return m?.optString("full_name")?.takeIf{it.isNotBlank()}?:m?.optString("name")?.takeIf{it.isNotBlank()}?:known[u.optString("email").lowercase()]?:u.optString("email").substringBefore("@").replaceFirstChar{it.uppercase()}}
 // Without an account (the emulator test of the games) every way out goes to the sign-in.
 private fun homeOrTrip(){if(api.session()==null){login();return};when(UiMode.start(panelFirst(),mode(),active())){"owner"->ownerDashboard();"mode"->askMode();"simpletrip"->simpleTrip();"simplehome"->simpleHome();"trip"->trip();else->home()}}

 // ---------- Mode of use: asked after signing in, kept per driver ----------
 private fun askMode(){modePick=mode()?:UiMode.SIMPLE;modeChoice()}
 private fun modeChoice(){
  page("mode",header=false);back.isEnabled=mode()!=null;root.setPadding(dp(16),0,dp(16),dp(16))
  val top=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL};root.addView(top,LinearLayout.LayoutParams(-1,-2));topTarget=top
  top.addView(ImageView(this).apply{setImageResource(R.drawable.tr_ferreira_logo);adjustViewBounds=true;contentDescription="TR Ferreira"},LinearLayout.LayoutParams(dp(170),-2).apply{topMargin=dp(28)})
  text(root,"Hola, ${name.substringBefore(" ")}",30f,ink,2,30).apply{gravity=Gravity.CENTER;letterSpacing=-.02f}
  text(root,"¿Qué modo querés usar?",17f,muted,0,6).gravity=Gravity.CENTER
  modeCard(R.drawable.ic_truck,0xFF178A4C.toInt(),"Modo sencillo","Solo lo necesario: iniciar y finalizar el viaje. Botones grandes y datos automáticos.",modePick==UiMode.SIMPLE,26){modePick=UiMode.SIMPLE;modeChoice()}
  modeCard(R.drawable.ic_list,brand,"Modo normal","Todas las opciones: combustible, remitos, historial, documentos y mantenimiento.",modePick==UiMode.NORMAL,14){modePick=UiMode.NORMAL;modeChoice()}
  text(root,if(ownerDriver())"Podés cambiar el modo cuando quieras. El menú del dueño está en los dos." else "Podés cambiar el modo cuando quieras.",13.5f,muted,0,18).gravity=Gravity.CENTER
  dock.visibility=View.VISIBLE
  button(dock,"Continuar",top=0){setMode(modePick);homeOrTrip()}
  if(mode()!=null)link(dock,"Cerrar sesión",top=2,color=blue){logout()}
 }
 private fun modeCard(icon:Int,fill:Int,title:String,sub:String,selected:Boolean,top:Int,action:()->Unit){
  val f=FrameLayout(this).apply{background=ripple(if(selected)outline(raised,green,24).apply{setStroke(dp(2),green)} else glassy(24));isClickable=true;isFocusable=true;contentDescription="$title. $sub"+if(selected)". Elegido" else "";setOnClickListener{action()}};sink(f,.98f)
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(16),dp(18),dp(16),dp(18))}
  r.addView(square(icon,Color.WHITE,fill,56,30))
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(16),0,dp(if(selected)24 else 0),0)}
  col.addView(tv(title,20f,ink,2));col.addView(tv(sub,14.5f,inkSoft).apply{setPadding(0,dp(4),0,0);setLineSpacing(0f,1.12f)})
  r.addView(col,LinearLayout.LayoutParams(0,-2,1f));f.addView(r,FrameLayout.LayoutParams(-1,-2))
  if(selected)f.addView(iconView(R.drawable.ic_check_circle,green,26),FrameLayout.LayoutParams(dp(26),dp(26),Gravity.TOP or Gravity.END).apply{setMargins(dp(10),dp(10),dp(10),dp(10))})
  root.addView(f,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(top)})
 }

 // ---------- Simple mode: two screens, big buttons, nothing to fill in ----------
 private fun brandBar(){
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(16),0,dp(8),0)}
  r.addView(ImageView(this).apply{setImageResource(R.drawable.tr_ferreira_logo);adjustViewBounds=true;contentDescription="TR Ferreira"},LinearLayout.LayoutParams(dp(150),-2))
  r.addView(View(this),LinearLayout.LayoutParams(0,1,1f))
  r.addView(if(ownerDriver())menuButton() else chip(name.substringBefore(" ")).apply{(layoutParams as LinearLayout.LayoutParams).marginEnd=dp(4)})
  floating(r,58)
 }
 private fun bigButton(p:LinearLayout,s:String,fill:Int,icon:Int,stacked:Boolean,lp:LinearLayout.LayoutParams,action:()->Unit):LinearLayout{
  // The big buttons keep their place and size; rounder, with the glow of their colour, and a buzz when tapped.
  val v=LinearLayout(this).apply{orientation=if(stacked)LinearLayout.VERTICAL else LinearLayout.HORIZONTAL;gravity=Gravity.CENTER;background=ripple(bg(fill,if(stacked)30 else 26),0x40FFFFFF);glow(this,fill,5f);isClickable=true;isFocusable=true;contentDescription=s;setPadding(dp(16),dp(14),dp(16),dp(14));setOnClickListener{buzz(it);action()}};sink(v,.98f)
  v.addView(iconView(icon,Color.WHITE,if(stacked)76 else 34))
  val label=tv(s,if(stacked)28f else 20f,Color.WHITE,2).apply{gravity=Gravity.CENTER;letterSpacing=.03f;maxLines=1;ellipsize=TextUtils.TruncateAt.END}
  if(stacked){label.setAutoSizeTextTypeUniformWithConfiguration(16,28,1,android.util.TypedValue.COMPLEX_UNIT_SP);v.addView(label,LinearLayout.LayoutParams(-1,dp(44)).apply{topMargin=dp(6)})}
  else v.addView(label,LinearLayout.LayoutParams(-2,-2).apply{marginStart=dp(12)})
  p.addView(v,lp);return v
 }
 private fun bigStat(p:LinearLayout,label:String,value:String,unit:String?,index:Int):TextView{
  val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=glassy();setPadding(dp(16),dp(12),dp(12),dp(12))}
  v.addView(tv(label,14f,muted))
  val figures=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.BOTTOM}
  val big=tv(value,28f,ink,2).apply{maxLines=1};figures.addView(big)
  if(unit!=null)figures.addView(tv(unit,14.5f,muted,1).apply{setPadding(dp(6),0,0,dp(5))})
  v.addView(figures);p.addView(v,LinearLayout.LayoutParams(0,-2,1f).apply{if(index>0)marginStart=dp(12)});return big
 }
 /** Start screen of simple mode. With ask, the question before starting a trip takes the place of the start button. */
 private fun simpleHome(ask:Boolean=false){
  page("simplehome");brandBar();finishAsk=false;startAsk=ask;back.isEnabled=ask
  val (model,plate)=truckParts(truck)
  val tc=card(top=10)
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(18),dp(16),dp(10),dp(16));background=ripple(null);isClickable=true;isFocusable=true;contentDescription="Camión asignado: ${model.ifBlank{"sin elegir"}}. Tocá para cambiarlo";setOnClickListener{pickTruck{simpleHome(startAsk)}}}
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
  col.addView(tv("Camión asignado",13.5f,muted));col.addView(tv(model.ifBlank{"Sin camión elegido"},21f,ink,2).apply{setPadding(0,dp(2),0,0)})
  col.addView(tv(if(plate.isNotBlank())"Matrícula $plate" else if(model.isBlank())"Tocá para elegirlo" else "Tocá para cambiarlo",14.5f,muted).apply{setPadding(0,dp(2),0,0)})
  r.addView(col,LinearLayout.LayoutParams(0,-2,1f))
  r.addView(ImageView(this).apply{setImageResource(R.drawable.truck_side);importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO},LinearLayout.LayoutParams(dp(126),dp(50)))
  tc.addView(r)
  val ready=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;background=outline(tone(0xF2E3F3E9,0xF2142A21),tone(0x40178A4C,0x404CC58A),20);setPadding(dp(16),dp(14),dp(16),dp(14))}
  ready.addView(iconView(R.drawable.ic_check_circle,green,30))
  val rc=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,0,0)}
  rc.addView(tv("Listo para viajar",17f,ink,1));rc.addView(tv("El recorrido, los kilómetros y la hora se registran solos.",14f,inkSoft).apply{setPadding(0,dp(2),0,0)})
  ready.addView(rc,LinearLayout.LayoutParams(0,-2,1f));root.addView(ready,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(12)})
  if(ask)startQuestion(model,plate)
  else bigButton(root,"INICIAR VIAJE",0xFF178A4C.toInt(),R.drawable.ic_play,true,LinearLayout.LayoutParams(-1,0,1f).apply{topMargin=dp(12)}){startAskAt=SystemClock.elapsedRealtime();simpleHome(true)}.minimumHeight=dp(190)
  // The last finished trip confirms that it was saved without the driver doing anything else.
  store.current()?.takeIf{!it.optBoolean("active")&&it.optString("driver_id")==uid()}?.let{t->
   row(card(),R.drawable.ic_check_circle,"Último viaje guardado",listOfNotNull(date(t.optString("started_at")),km(t.optDouble("distance_meters",0.0)),durationText(t.optString("started_at"),t.optString("ended_at"))).joinToString(" · "),tint=green)}
  // Fuel can be loaded in simple mode too (decision of 19/10/2026): here, out of a trip.
  button(root,"Cargar combustible",Kind.LINE,R.drawable.ic_fuel){fuelChoice()}
  button(root,"Juegos",Kind.LINE,R.drawable.ic_chess){games()}
  // The owner who drives gets the owner menu here; changing the mode is inside that menu.
  if(ownerDriver())button(root,"Menú del dueño",Kind.PRIMARY,R.drawable.ic_menu){ownerMenu()} else button(root,"Cambiar de modo",Kind.LINE,R.drawable.ic_list){askMode()}
  sync=note(store.message(),top=12).apply{gravity=Gravity.CENTER}
  if(truck.isBlank())guessTruck()
 }
 /** Truck of the driver's latest trip, for a phone that has none saved yet. */
 private fun knownTruck():String?{
  val rows=try{mobile.history("trips",50)}catch(_:Exception){return null}
  for(i in 0 until rows.length()){val v=rows.getJSONObject(i).optString("vehicle").trim();if(v.isNotBlank()&&v!=InputRules.vehicle(""))return v}
  return null
 }
 private fun guessTruck(){
  knownTruck()?.let{saveTruck(it);simpleHome(startAsk);return}
  thread{try{mobile.history("trips",50,true);val v=knownTruck();runOnUiThread{if(v!=null&&truck.isBlank()&&screen=="simplehome"){saveTruck(v);simpleHome(startAsk)}}}catch(_:Exception){}}
 }
 /** Takes the place of the start button once it is tapped, so that a trip never starts with a single touch. */
 private fun startQuestion(model:String,plate:String){
  val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_VERTICAL;background=outline(raised,green,30).apply{setStroke(dp(2),green)};setPadding(dp(16),dp(18),dp(16),dp(16));minimumHeight=dp(190)}
  text(box,"¿Iniciar el viaje?",24f,ink,2).gravity=Gravity.CENTER
  text(box,listOf(model,plate).filter{it.isNotBlank()}.joinToString(" · ").ifBlank{"Sin camión elegido"},15.5f,inkSoft,0,4).gravity=Gravity.CENTER
  // The question comes up right under the finger that tapped the start button: a double tap must not answer it.
  val settled={SystemClock.elapsedRealtime()-startAskAt>=700}
  bigButton(box,"SÍ, INICIAR",0xFF178A4C.toInt(),R.drawable.ic_play,false,LinearLayout.LayoutParams(-1,dp(76)).apply{topMargin=dp(14)}){if(settled())simpleStart()}
  button(box,"Cancelar",Kind.LINE,top=10){if(settled())simpleHome()}
  root.addView(box,LinearLayout.LayoutParams(-1,0,1f).apply{topMargin=dp(12)})
 }
 /** Starts the trip once the driver has confirmed: remembered truck, loaded trip, no form. Without a known truck it asks once. */
 private fun simpleStart(asked:Boolean=false){
  if(active()){simpleTrip();return}
  if(truck.isBlank()&&!asked){val v=knownTruck();if(v!=null)saveTruck(v) else {pickTruck{simpleStart(true)};return}}
  tripForm=JSONObject();draftDocs=JSONArray();empty=false;beginTrip()
 }
 private fun simpleTrip(){
  val t=store.current()?.takeIf{it.optBoolean("active")}?:return simpleHome()
  finishAsk=false
  val live=driveFrame(t,"simpletrip"){
   val row=LinearLayout(this@MainActivity).apply{orientation=LinearLayout.HORIZONTAL};addView(row,LinearLayout.LayoutParams(-1,dp(78)))
   // During the trip it asks whether the load belongs to the trip or not.
   bigTile(row,"Combustible",brand,R.drawable.ic_fuel,0){fuelChoice()}
   val (pi,pl)=bigTile(row,"Pausar",0xFFB7740B.toInt(),R.drawable.ic_pause,1){togglePause()};pauseIcon=pi;pauseLabel=pl
   dock.setPadding(0,0,0,0);addView(dock,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(10)})
  }
  // For the wait at a plant with the trip going: they open only with the truck stopped.
  button(root,"Juegos",Kind.LINE,R.drawable.ic_chess,top=4){games()}
  if(!(getSystemService(POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName))row(card(),R.drawable.ic_battery,"Evitar cortes del GPS","Permitir que la app siga en segundo plano",tint=amber){batteryExemption()}
  sync=note(store.message(),top=10).apply{gravity=Gravity.CENTER}
  simpleDock();fleetOnTrip(live)
  refresh();try{service()}catch(_:Exception){gps?.text="Revisá el permiso de ubicación para continuar"}
 }
 /** Bottom of the trip screen: the finish button, or the confirmation after tapping it, without leaving the screen. */
 private fun simpleDock(){
  dock.removeAllViews();dock.visibility=View.VISIBLE
  if(finishAsk){
   // The question on a card of its own, over the room.
   val t=store.current();val q=card(dock,pad=16,top=0)
   text(q,"¿Finalizar el viaje?",20f,ink,2).gravity=Gravity.CENTER
   text(q,"${elapsedText(t?.optString("started_at")?:"")} · ${km(t?.optDouble("distance_meters",0.0)?:0.0)}. Todo queda guardado.",14.5f,muted,0,4).gravity=Gravity.CENTER
   bigButton(q,"SÍ, FINALIZAR",0xFFC4262D.toInt(),R.drawable.ic_stop,false,LinearLayout.LayoutParams(-1,dp(76)).apply{topMargin=dp(12)}){
    finishAsk=false;dock.removeAllViews();text(dock,"Guardando el viaje…",17f,ink,1,18).apply{gravity=Gravity.CENTER;setPadding(0,0,0,dp(18))}
    try{service(GpsService.FINISH)}catch(_:Exception){toast("No se pudo finalizar. Reintentá.");simpleDock()}}
   button(q,"Seguir viaje",Kind.LINE,top=10){finishAsk=false;simpleDock()}
  }else{
   bigButton(dock,"FINALIZAR VIAJE",0xFFC4262D.toInt(),R.drawable.ic_stop,false,LinearLayout.LayoutParams(-1,dp(72))){finishAsk=true;simpleDock()}
  }
 }

 // ---------- Driver home ----------
 private fun home(){
  if(simple()){homeOrTrip();return}
  page("home");hello("Hola",name,if(ownerDriver())menuButton().apply{(layoutParams as LinearLayout.LayoutParams).marginEnd=dp(8)} else barButton(R.drawable.ic_sync,"Enviar pendientes y actualizar"){syncNow()})
  val t=store.current();val running=t?.optBoolean("active")==true
  val (model,plate)=truckParts(if(running)t!!.optString("vehicle") else truck)
  val tc=card()
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(18),dp(16),dp(10),dp(16));background=ripple(null);isClickable=true;isFocusable=true;contentDescription="Camión: ${model.ifBlank{"sin elegir"}}. Tocá para cambiarlo";setOnClickListener{if(active())trip() else pickTruck{home()}}}
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
  col.addView(tv("Camión",13.5f,muted));col.addView(tv(model.ifBlank{"Sin camión elegido"},19f,ink,1).apply{setPadding(0,dp(2),0,0)})
  col.addView(tv(if(plate.isNotBlank())"Matrícula $plate" else if(running)"Sin matrícula" else "Tocá para elegirlo",14f,muted).apply{setPadding(0,dp(2),0,dp(10))})
  col.addView(when{running->pill("Viaje en curso",green,greenBg);model.isNotBlank()->pill("Listo para salir",green,greenBg);else->pill("Elegir camión",blue,blueSoft)})
  r.addView(col,LinearLayout.LayoutParams(0,-2,1f))
  r.addView(ImageView(this).apply{setImageResource(R.drawable.truck_side);importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO},LinearLayout.LayoutParams(dp(126),dp(50)))
  tc.addView(r)
  if(running)button(root,"Volver al viaje en curso",Kind.PRIMARY,R.drawable.ic_navigation){trip()}
  alerts()
  menuList(listOfNotNull(
   if(ownerDriver())Shortcut(R.drawable.ic_menu,0xFF2F4A7D.toInt(),"Menú del dueño","Flota, viajes y rendimiento"){ownerMenu()} else null,
   Shortcut(R.drawable.ic_play,0xFF178A4C.toInt(),"Iniciar viaje",if(running)"Ya hay un viaje en curso" else null){if(active()){toast("Ya tenés un viaje en curso");trip()}else{tripForm=JSONObject();draftDocs=JSONArray();empty=false;newTrip()}},
   Shortcut(R.drawable.ic_list,0xFF1663E8.toInt(),"Mis viajes",null){openHistory("trips",false)},
   Shortcut(R.drawable.ic_fuel,0xFFC96A12.toInt(),"Combustible","Cargar una boleta"){fuelChoice()},
   Shortcut(R.drawable.ic_receipt,0xFF7A4FD0.toInt(),"Remitos y fotos",null){if(active())openDocument(store.current(),"trip","arrival") else {toast("Elegí el viaje al que querés agregar el remito");openHistory("trips",false)}},
   Shortcut(R.drawable.ic_doc,0xFF0E8A8A.toInt(),"Documentos",null){documents(true)},
   Shortcut(R.drawable.ic_wrench,0xFF56647B.toInt(),"Mantenimiento",null){maintenance(true)},
   Shortcut(R.drawable.ic_chess,0xFFBE3A6E.toInt(),"Juegos","Para las esperas, con el camión parado"){games()},
   Shortcut(R.drawable.ic_person,0xFF8590A2.toInt(),"Mi cuenta","Modo de uso, GPS y sesión"){settings()}))
  sync=note(store.message(),top=18).apply{gravity=Gravity.CENTER}
  navBar("home")
  refreshPapers()
 }
 private fun truckChoices():List<String>{
  val catalog=mobile.catalog().optJSONArray("equipos");val out=mutableListOf<String>()
  if(catalog!=null)for(i in 0 until catalog.length()){val e=catalog.getJSONObject(i);out.add(e.optString("tipo")+e.optString("matriculaCamion").let{if(it.isBlank())"" else " · $it"})}
  if(out.isEmpty())out.addAll(trucks);if(truck.isNotBlank()&&!out.contains(truck))out.add(truck);return out
 }
 private fun truckParts(v:String):Pair<String,String>{val i=v.indexOf(" · ");return if(i<0)Pair(v.trim(),"") else Pair(v.substring(0,i).trim(),v.substring(i+3).trim())}
 private fun saveTruck(v:String){truck=v;prefs().edit().putString("truck",v).apply()}
 private fun pickTruck(then:()->Unit){val items=truckChoices();pick("¿Con qué camión salís?",items,truck,"Dejar pendiente"){i->saveTruck(if(i<items.size)items[i] else "");then()}}
 private fun truckSelector(c:LinearLayout,title:String){
  caption(c,title);val choices=listOf("Sin seleccionar")+truckChoices()
  val spinner=Spinner(this).apply{adapter=spinnerAdapter(choices);background=spinnerBg();setPopupBackgroundDrawable(bg(menuFill,16))};c.addView(spinner,LinearLayout.LayoutParams(-1,dp(52)).apply{topMargin=dp(6)})
  spinner.setSelection(choices.indexOf(truck).coerceAtLeast(0));spinner.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,pos:Int,id:Long){saveTruck(if(pos>0)choices[pos] else "")}}
 }
 private fun fuelChoice(){if(active())pick("¿Dónde registrar la carga?",listOf("En el viaje en curso","Sin viaje")){i->openFuel(if(i==0)store.current() else null)} else openFuel(null)}
 private fun syncNow(){Sync.schedule(this);toast("Enviando pendientes y actualizando…");thread{try{mobile.catalog(true);runOnUiThread{toast("Datos actualizados")}}catch(_:Exception){runOnUiThread{toast("Sin conexión. Los datos siguen guardados en el teléfono.")}}}}
 private fun locationPermissions()=mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION).apply{if(Build.VERSION.SDK_INT>=33)add(Manifest.permission.POST_NOTIFICATIONS)}
 private fun checkGps(){
  val req=locationPermissions();if(req.any{ContextCompat.checkSelfPermission(this,it)!=PackageManager.PERMISSION_GRANTED}){askLocation(req);return}
  if(!(getSystemService(POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName))batteryExemption()
  else toast("GPS listo: ubicación precisa y batería sin restricciones.")
 }
 /** Google Play requires telling drivers how location is used right before the system prompt. */
 private fun askLocation(req:List<String>){
  if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED){permissions.launch(req.toTypedArray());return}
  AlertDialog.Builder(this).setTitle("Uso de tu ubicación")
   .setMessage("Transportes Ferreira GPS usa tu ubicación precisa mientras hay un viaje en curso, incluso con la app cerrada o la pantalla apagada, para registrar el recorrido y los kilómetros y mostrarle a la administración dónde está el camión.\n\nMientras se registra vas a ver una notificación fija. Al pausar o finalizar el viaje, la app deja de registrar el recorrido.\n\nAdemás, con la app abierta y sin viaje, al abrirla y cada 5 minutos le avisa a la administración dónde estás. Con la app cerrada no se envía nada, y podés desactivarlo en Mi cuenta. Los datos quedan en el sistema de Transportes Ferreira y no se usan para publicidad.")
   .setPositiveButton("Aceptar"){_,_->prefs().edit().putBoolean(presenceKey(),true).apply();permissions.launch(req.toTypedArray())}
   .setNegativeButton("Ahora no"){_,_->toast("Sin permiso de ubicación no se registra el recorrido del viaje.")}.show()
 }

 // ---------- New trip ----------
 private fun newTrip(){
  page("newtrip");bar("Nuevo viaje",back={home()})
  val (model,plate)=truckParts(truck)
  row(card(),R.drawable.ic_truck,model.ifBlank{"Elegí el camión"},if(plate.isNotBlank())"Matrícula $plate" else "Opcional · podés dejarlo pendiente",trailing=tv("Cambiar",14.5f,blue,1)){pickTruck{newTrip()}}
  val cargos=catalogNames("tiposCarga")
  choiceCard(R.drawable.ic_truck,"Con carga",if(cargos.isEmpty())"Granos, caña, arroz…" else cargos.take(4).joinToString(", ")+if(cargos.size>4)"…" else "",!empty){empty=false;newTrip()}
  choiceCard(R.drawable.ic_truck_outline,"Sin carga","Retorno vacío",empty){empty=true;newTrip()}
  dock.visibility=View.VISIBLE
  button(dock,"Continuar",top=0){prepare()}
  link(dock,"¿Apurado? Salir ahora y completar después",top=2){beginTrip()}
 }
 private fun choiceCard(icon:Int,title:String,sub:String,selected:Boolean,action:()->Unit){
  val f=FrameLayout(this).apply{background=ripple(if(selected)outline(raised,blue,24).apply{setStroke(dp(2),blue)} else glassy(24));isClickable=true;isFocusable=true;contentDescription="$title. $sub"+if(selected)". Elegido" else "";setOnClickListener{action()}};sink(f,.98f)
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL;setPadding(dp(20),dp(24),dp(20),dp(22))}
  col.addView(iconView(icon,blue,64))
  col.addView(tv(title,19f,ink,1).apply{gravity=Gravity.CENTER;setPadding(0,dp(10),0,0)})
  col.addView(tv(sub,14.5f,muted).apply{gravity=Gravity.CENTER;setPadding(0,dp(4),0,0)})
  f.addView(col,FrameLayout.LayoutParams(-1,-2))
  if(selected)f.addView(iconView(R.drawable.ic_check_circle,blue,26),FrameLayout.LayoutParams(dp(26),dp(26),Gravity.TOP or Gravity.END).apply{setMargins(dp(12),dp(12),dp(12),dp(12))})
  root.addView(f,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(12)})
 }
 private fun prepare(){
  page("prepare");bar("Datos del viaje",back={newTrip()})
  val c=card()
  row(c,R.drawable.ic_pin,"Origen","Tu ubicación (GPS)",trailing=pill("Automático",blue,blueSoft))
  val dest=tripForm.optString("destino")
  row(c,R.drawable.ic_flag,"Destino",dest.ifBlank{"Buscar lugar"},if(dest.isBlank())faint else ink){editDestination()}
  val client=tripForm.optString("cliente")
  row(c,R.drawable.ic_business,"Cliente / Empresa",client.ifBlank{"Elegir cliente"},if(client.isBlank())faint else ink){choose("Cliente / Empresa",catalogNames("clientes"),tripForm,"cliente"){tripForm.put("tipoCarga","")}}
  if(!empty){val cargo=tripForm.optString("tipoCarga");val kg=tripForm.optString("kg").takeUnless{it=="null"}?:""
   row(c,R.drawable.ic_box,"Tipo de carga",cargo.ifBlank{"Elegir carga"},if(cargo.isBlank())faint else ink){choose("Tipo de carga",cargoNames(tripForm.optString("cliente")),tripForm,"tipoCarga")}
   row(c,R.drawable.ic_weight,"Peso estimado (kg)",if(kg.isBlank())"Ingresar peso" else "$kg kg",if(kg.isBlank())faint else ink){askNumber("Peso estimado (kg)",tripForm,"kg"){prepare()}}}
  val n=draftDocs.length()
  row(c,R.drawable.ic_receipt,"Remitos de salida",if(n==0)"Foto o número" else "$n agregado${if(n==1)"" else "s"} · tocá para sumar otro",if(n==0)faint else ink){openDocument(null,"prepare","departure")}
  if(n>0){val dc=card();for(i in 0 until n){val d=draftDocs.getJSONObject(i);val title="${if(d.optString("kind")=="arrival")"Llegada" else "Salida"} · ${d.optString("number").ifBlank{"Sin número"}}"
   row(dc,R.drawable.ic_receipt,title,if(d.optString("draft_photo").isNotBlank())"Con foto" else "Sin foto",trailing=iconView(R.drawable.ic_close,muted,20)){AlertDialog.Builder(this).setTitle("¿Quitar este remito?").setMessage(title).setNegativeButton("Conservar",null).setPositiveButton("Quitar"){_,_->draftDocs.remove(i);prepare()}.show()}}}
  note("Todos los datos son opcionales. Podés completarlos durante el viaje o al llegar.",top=14)
  dock.visibility=View.VISIBLE;button(dock,"Iniciar viaje",Kind.GO,R.drawable.ic_play,top=0){begin()}
 }
 private fun choose(title:String,values:List<String>,data:JSONObject,key:String,changed:()->Unit={}){
  val current=data.optString(key);val items=values.filter{it.isNotBlank()}.distinct().toMutableList()
  if(current.isNotBlank()&&!items.contains(current))items.add(0,current)
  if(items.isEmpty()){toast("No hay opciones cargadas. Actualizá desde Mi cuenta.");return}
  pick(title,items,current,if(current.isNotBlank())"Quitar selección" else null){i->val next=if(i<items.size)items[i] else "";if(next!=current){data.put(key,next);changed()};rerender()}
 }
 private fun rerender(){when(screen){"prepare"->prepare();"newtrip"->newTrip();"fuel"->fuel();"document"->document()}}
 private fun askNumber(title:String,data:JSONObject,key:String,done:()->Unit){
  val e=input(InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL,"0").apply{setText(data.optString(key).takeUnless{it=="null"}?:"")}
  val box=FrameLayout(this).apply{setPadding(dp(20),dp(8),dp(20),0);addView(e,FrameLayout.LayoutParams(-1,dp(52)))}
  AlertDialog.Builder(this).setTitle(title).setView(box).setNegativeButton("Cancelar",null).setPositiveButton("Guardar"){_,_->data.put(key,e.text.toString().trim());done()}.show()
 }
 private fun editDestination(){
  val e=input(InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_CAP_WORDS,"Ciudad, planta o chacra").apply{setText(tripForm.optString("destino"))}
  val box=FrameLayout(this).apply{setPadding(dp(20),dp(8),dp(20),0);addView(e,FrameLayout.LayoutParams(-1,dp(52)))}
  fun keep(){tripForm.put("destino",e.text.toString().trim());tripForm.remove("destination_lat");tripForm.remove("destination_lng")}
  AlertDialog.Builder(this).setTitle("Destino").setMessage("Escribí el lugar. Podés buscarlo en el mapa o guardarlo como está.").setView(box)
   .setNegativeButton("Cancelar",null).setNeutralButton("Guardar así"){_,_->keep();prepare()}.setPositiveButton("Buscar"){_,_->keep();prepare();searchDestination()}.show()
 }
 private fun requestStart(){
  val req=locationPermissions()
  if(req.any{ContextCompat.checkSelfPermission(this,it)!=PackageManager.PERMISSION_GRANTED})askLocation(req) else service()
 }
 private fun beginTrip(){
  val u=api.session()?.optJSONObject("user")?:return login()
  try{store.start(u,name,InputRules.vehicle(truck),empty,JSONObject().put("kg",""),draftDocs);draftDocs=JSONArray();trip();Sync.schedule(this);requestStart()}catch(_:Exception){toast("No se pudo guardar el viaje en el teléfono. Revisá el espacio disponible.");homeOrTrip()}
 }
 private fun begin(){
  val u=api.session()?.optJSONObject("user")?:return login()
  try{store.start(u,name,InputRules.vehicle(truck),empty,JSONObject(tripForm.toString()).put("kg",InputRules.optionalNumber(tripForm.optString("kg"))?:"").apply{if(empty){put("tipoCarga","");put("kg","")}},draftDocs)
   draftDocs=JSONArray();trip();Sync.schedule(this);requestStart()
  }catch(_:Exception){toast("No se pudo guardar el viaje en el teléfono. Revisá el espacio disponible.");homeOrTrip()}
 }
 private fun service(action:String?=null){
  if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED){ContextCompat.startForegroundService(this,Intent(this,GpsService::class.java).apply{this.action=action});return}
  // A trip can exist without GPS permission. Business fields never block starting or ending it.
  when(action){GpsService.PAUSE->store.update{it.put("paused",true)};GpsService.RESUME->store.update{it.put("paused",false).put("segment",it.optInt("segment")+1)};GpsService.FINISH->store.update{it.put("active",false).put("paused",false).put("ended_at",Instant.now().toString())}}
  Sync.schedule(this)
 }

 // ---------- Trip in progress ----------
 private fun trip(){
  if(simple()){simpleTrip();return}
  val t=store.current()?:return home()
  val live=driveFrame(t,"trip"){
   // Pausar and Finalizar side by side, both in sight (decision of 29/10/2026).
   val row=LinearLayout(this@MainActivity).apply{orientation=LinearLayout.HORIZONTAL};addView(row,LinearLayout.LayoutParams(-1,dp(60)))
   pausePill(row);finishPill(row)
  }
  val details=store.details().firstOrNull{it.second.optString("trip_id")==t.getString("id")}?.second?.optJSONObject("data")
  // The sheet: what the panel does not show.
  val trio=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};root.addView(trio,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(4)})
  actionBox(trio,R.drawable.ic_fuel,"Combustible",0){openFuel(store.current())}
  actionBox(trio,R.drawable.ic_receipt,"Remito",1){openDocument(store.current(),"trip","arrival")}
  actionBox(trio,R.drawable.ic_flag,"Finalizar",2){askFinish()}
  val (model,_)=truckParts(t.optString("vehicle"))
  val kg=details?.optString("kg")?.takeIf{it.isNotBlank()&&it!="null"}?.let{"$it kg"}
  val cargo=if(t.optString("load_type")=="empty")"Retorno vacío" else listOfNotNull(details?.optString("tipoCarga")?.ifBlank{null},kg).joinToString(" · ").ifBlank{"Con carga"}
  val start=instant(t.optString("started_at"))?.atZone(ZoneId.systemDefault())?.format(DateTimeFormatter.ofPattern("HH:mm"))?:"—"
  factsGrid(card(),listOf(Fact(R.drawable.ic_flag,"Destino",details?.optString("destino")?.ifBlank{null}?:"Sin destino"),Fact(R.drawable.ic_box,"Carga",cargo),Fact(R.drawable.ic_truck,"Camión",model.ifBlank{"Sin asignar"}),Fact(R.drawable.ic_clock,"Salida",start)))
  count=note("",top=12)
  if(!(getSystemService(POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName))row(card(),R.drawable.ic_battery,"Evitar cortes del GPS","Permitir que la app siga en segundo plano",tint=amber){batteryExemption()}
  if(ownerDriver())row(card(),R.drawable.ic_truck,"Flota en vivo","Todos los camiones, sus viajes y los choferes"){ownerDashboard()}
  row(card(),R.drawable.ic_chess,"Juegos","Para la espera, con el camión parado"){games()}
  sync=note(store.message(),top=12)
  link(root,"Revisar ubicación GPS",top=4){requestStart()}
  fleetOnTrip(live)
  refresh();try{service()}catch(_:Exception){gps?.text="Revisá el permiso de ubicación para continuar"}
 }
 // ---------- The trip in progress on the whole screen (decision of 29/10/2026) ----------
 private var gauge:Gauge?=null;private var sheetBox:ScrollView?=null;private var sheetOpen=false;private var sheetMove:ValueAnimator?=null
 /**
  * The frame of the trip screens: the map fills it and turns with the truck; on top, the trip's state with its truck and
  * the speed limit; below, the kilometres, the speed on its arc and the time, then the screen's own buttons (actions),
  * and a sheet that slides up from there with the rest: it holds root, where the screen adds its cards as before.
  */
 private fun driveFrame(t:JSONObject,key:String,actions:LinearLayout.()->Unit):TripMap.Live{
  page(key,header=false);gauge=null;sheetMove?.cancel()
  val scroll=root.parent as ScrollView;scroll.removeView(root);shell.removeView(scroll);shell.removeView(dock)
  val canvas=FrameLayout(this);shell.addView(canvas,1,LinearLayout.LayoutParams(-1,0,1f))
  val details=store.details().firstOrNull{it.second.optString("trip_id")==t.getString("id")}?.second?.optJSONObject("data")
  trackOffset=0L
  val live=TripMap.live(this,details?.optDouble("destination_lat",Double.NaN)?:Double.NaN,details?.optDouble("destination_lng",Double.NaN)?:Double.NaN)
  liveMap=live;activeMap=live;canvas.addView(live.view,FrameLayout.LayoutParams(-1,-1))
  // On top: the trip's state and its truck, and under them the speed limit for trucks.
  val top=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(10),0,dp(10),0)}
  canvas.addView(top,FrameLayout.LayoutParams(-1,-2,Gravity.TOP))
  val bar=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(if(key=="trip")4 else 18),0,dp(18),0);background=outline(raised,glassLine,30);elevation=dpf(4f)}
  if(key=="trip")bar.addView(barButton(R.drawable.ic_back,"Volver"){going=-1;home();going=1})
  val dot=View(this);bar.addView(dot,LinearLayout.LayoutParams(dp(10),dp(10)).apply{marginStart=dp(if(key=="trip")2 else 0);marginEnd=dp(12)});statusBox=dot
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
  status=tv("Viaje en curso",16.5f,ink,2).apply{maxLines=1};col.addView(status)
  val (model,plate)=truckParts(t.optString("vehicle"))
  col.addView(tv(listOf(model,plate).filter{it.isNotBlank()}.joinToString(" · ").ifBlank{"Sin camión asignado"},13.5f,muted).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END})
  bar.addView(col,LinearLayout.LayoutParams(0,-2,1f))
  top.addView(bar,LinearLayout.LayoutParams(-1,dp(62)).apply{topMargin=dp(6)})
  val sign=SpannableString("90\nkm/h").apply{setSpan(RelativeSizeSpan(.45f),3,7,0)}
  limit=tv(sign,24f,ink,2).apply{gravity=Gravity.CENTER;includeFontPadding=false;setLineSpacing(0f,.85f);contentDescription="Máximo para camiones: 90 kilómetros por hora";elevation=dpf(3f)}
  top.addView(limit,LinearLayout.LayoutParams(dp(64),dp(64)).apply{topMargin=dp(10);marginStart=dp(4)})
  topTarget=top;stage?.let{st->ViewCompat.getRootWindowInsets(st)?.let{fitBars(shell,it)}}
  // Below: the panel, with a handle that opens the sheet.
  val r=dpf(28f)
  val panel=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=GradientDrawable().apply{setColor(raised);cornerRadii=floatArrayOf(r,r,r,r,0f,0f,0f,0f);setStroke(dp(1),glassLine)};elevation=dpf(10f);isClickable=true}
  canvas.addView(panel,FrameLayout.LayoutParams(-1,-2,Gravity.BOTTOM))
  val grip=FrameLayout(this).apply{contentDescription="Más opciones del viaje";isClickable=true;isFocusable=true;setOnClickListener{sheet(!sheetOpen)}}
  grip.addView(View(this).apply{background=bg(grey,3)},FrameLayout.LayoutParams(dp(44),dp(5),Gravity.CENTER))
  panel.addView(grip,LinearLayout.LayoutParams(-1,dp(26)))
  val stats=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(18),0,dp(18),0);isClickable=true}
  distance=figure(stats,R.drawable.ic_route,"Km recorridos",km(t.optDouble("distance_meters",0.0)),Gravity.START)
  val dial=FrameLayout(this)
  gauge=Gauge(this,tone(0x24133396,0x29FFFFFF),blue,red,90.0,moves()).also{dial.addView(it,FrameLayout.LayoutParams(-1,-1))}
  val inside=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL}
  speed=tv("—",36f,ink,2).apply{gravity=Gravity.CENTER;fontFeatureSettings="tnum";includeFontPadding=false};inside.addView(speed)
  inside.addView(tv("km/h",13.5f,muted,1).apply{gravity=Gravity.CENTER})
  dial.addView(inside,FrameLayout.LayoutParams(-2,-2,Gravity.CENTER))
  stats.addView(dial,LinearLayout.LayoutParams(dp(128),dp(118)))
  elapsed=figure(stats,R.drawable.ic_clock,"Tiempo en viaje",elapsedText(t.optString("started_at")),Gravity.END)
  panel.addView(stats,LinearLayout.LayoutParams(-1,-2))
  gps=tv("",12.5f,muted).apply{gravity=Gravity.CENTER;maxLines=2;setPadding(dp(16),dp(2),dp(16),dp(4))};panel.addView(gps,LinearLayout.LayoutParams(-1,-2))
  val act=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),dp(4),dp(14),dp(12))};panel.addView(act,LinearLayout.LayoutParams(-1,-2));act.actions()
  val box=ScrollView(this).apply{isVerticalScrollBarEnabled=false;overScrollMode=View.OVER_SCROLL_NEVER}
  root.setPadding(dp(14),0,dp(14),dp(18));box.addView(root);panel.addView(box,LinearLayout.LayoutParams(-1,0));sheetBox=box;sheetOpen=false
  swipe(grip);swipe(stats)
  // The map leaves the room the bar and the closed panel cover, so the truck stays in sight.
  val room=View.OnLayoutChangeListener{_,_,_,_,_,_,_,_,_->live.pad(top.bottom,panel.height-box.height)}
  top.addOnLayoutChangeListener(room);panel.addOnLayoutChangeListener(room)
  return live
 }
 /** A figure of the panel: its icon, what it is and the value, to one side of the speed. */
 private fun figure(p:LinearLayout,icon:Int,label:String,value:String,side:Int):TextView{
  val c=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=side}
  c.addView(iconView(icon,blue,22))
  c.addView(tv(label,12.5f,muted).apply{gravity=side;setPadding(0,dp(4),0,0)},LinearLayout.LayoutParams(-1,-2))
  val v=tv(value,22f,ink,2).apply{gravity=side;fontFeatureSettings="tnum";maxLines=1;setAutoSizeTextTypeUniformWithConfiguration(13,22,1,android.util.TypedValue.COMPLEX_UNIT_SP)}
  c.addView(v,LinearLayout.LayoutParams(-1,dp(32)))
  p.addView(c,LinearLayout.LayoutParams(0,-2,1f));return v
 }
 /** Opens or closes the sheet of the trip: up to a bit more than half the screen, or what it has if less. */
 private fun sheet(open:Boolean){
  val box=sheetBox?:return;sheetOpen=open;sheetMove?.cancel()
  val screenH=(box.parent?.parent as? View)?.height?:resources.displayMetrics.heightPixels
  root.measure(View.MeasureSpec.makeMeasureSpec(max(1,box.width),View.MeasureSpec.EXACTLY),View.MeasureSpec.makeMeasureSpec(0,View.MeasureSpec.UNSPECIFIED))
  val to=if(open)min(root.measuredHeight,(screenH*.58f).toInt()) else 0
  val from=box.layoutParams.height;if(open)box.scrollTo(0,0)
  if(!moves()){box.layoutParams=box.layoutParams.apply{height=to};return}
  sheetMove=ValueAnimator.ofInt(from,to).apply{duration=260;interpolator=ease;addUpdateListener{box.layoutParams=box.layoutParams.apply{height=it.animatedValue as Int}}}.also{it.start()}
 }
 /** Up opens the sheet, down closes it; a short touch is still a tap. */
 private fun swipe(v:View){var y0=0f
  v.setOnTouchListener{_,e->when(e.actionMasked){
   MotionEvent.ACTION_DOWN->{y0=e.rawY;false}
   MotionEvent.ACTION_UP->{val dy=e.rawY-y0;if(dy< -dp(24)){sheet(true);true}else if(dy>dp(24)){sheet(false);true}else false}
   else->false}}
 }
 /** The pause of the trip, as the panel's button: a pill with its round icon. */
 private fun pausePill(p:LinearLayout){
  val v=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER;background=ripple(outline(raised,blue,30));isClickable=true;isFocusable=true;contentDescription="Pausar viaje";setOnClickListener{buzz(this);togglePause()}};sink(v)
  val circle=FrameLayout(this).apply{background=oval(blue)}
  val icon=ImageView(this).apply{setImageResource(R.drawable.ic_pause);imageTintList=ColorStateList.valueOf(Color.WHITE)};circle.addView(icon,FrameLayout.LayoutParams(dp(18),dp(18),Gravity.CENTER))
  v.addView(circle,LinearLayout.LayoutParams(dp(36),dp(36)))
  val label=tv("Pausar viaje",15f,ink,1).apply{setPadding(dp(8),0,0,0);maxLines=1;ellipsize=TextUtils.TruncateAt.END};v.addView(label,LinearLayout.LayoutParams(0,-2,1f))
  p.addView(v,LinearLayout.LayoutParams(0,-1,1f));pauseIcon=icon;pauseLabel=label
 }
 /** The finish button of the trip, next to the pause: a red pill that asks to confirm. */
 private fun finishPill(p:LinearLayout){
  val v=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER;background=ripple(bg(0xFFC4262D.toInt(),30),0x40FFFFFF);isClickable=true;isFocusable=true;contentDescription="Finalizar viaje";setOnClickListener{buzz(this);askFinish()}};sink(v)
  v.addView(iconView(R.drawable.ic_flag,Color.WHITE,22))
  v.addView(tv("Finalizar",15f,Color.WHITE,2).apply{setPadding(dp(8),0,0,0);maxLines=1})
  p.addView(v,LinearLayout.LayoutParams(0,-1,1f).apply{marginStart=dp(10)})
 }
 private fun togglePause(){try{service(if(store.current()?.optBoolean("paused")==true)GpsService.RESUME else GpsService.PAUSE)}catch(_:Exception){toast("Revisá el permiso de ubicación")}}
 /** A big button of simple mode in a row: its icon over its name. */
 private fun bigTile(p:LinearLayout,label:String,fill:Int,icon:Int,index:Int,action:()->Unit):Pair<ImageView,TextView>{
  val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;background=ripple(bg(fill,24),0x40FFFFFF);glow(this,fill,4f);isClickable=true;isFocusable=true;contentDescription=label;setOnClickListener{buzz(this);action()}};sink(v,.95f)
  val image=iconView(icon,Color.WHITE,30);val caption=tv(label,17f,Color.WHITE,2).apply{gravity=Gravity.CENTER;maxLines=1;setPadding(0,dp(4),0,0)}
  v.addView(image);v.addView(caption)
  p.addView(v,LinearLayout.LayoutParams(0,-1,1f).apply{if(index>0)marginStart=dp(10)});return Pair(image,caption)
 }
 /**
  * An owner who drives sees the fleet on the trip's map (decision of 29/10/2026): the trucks on a trip and the phones of
  * active drivers, with their speed, read like Flota en vivo; a truck tapped shows its route, tapped again it goes away.
  */
 private fun fleetOnTrip(live:TripMap.Live){
  if(!isOwner())return
  routeKey=null;live.onTruck{k->truckRoute(k){live.showRoute(it)}}
  live.setFleet(tripFleet());fleetLoadedAt=0L
 }
 /** The fleet on the trip's map: the other trucks on a trip, and the active drivers without one. */
 private fun tripFleet():JSONArray{val f=mobile.fleet();val own=store.current()?.optString("id");return fleetMarks(fleetItems(f).filter{it.session!=null&&it.session.optString("id")!=own},f)}
 private var routeKey:String?=null
 /** The route of a truck on a trip tapped on a map of the fleet; tapped again, it goes away. */
 private fun truckRoute(key:String,show:(JSONArray?)->Unit){
  if(key==routeKey){routeKey=null;show(null);return}
  val id=key.removePrefix("trip:");if(id==key)return
  val active=mobile.fleet().optJSONArray("active")?:return
  val s=(0 until active.length()).map{active.getJSONObject(it)}.firstOrNull{it.optString("id")==id}?:return
  routeKey=key;toast("Buscando el recorrido…")
  thread{val points=try{mobile.route(JSONObject(s.toString()),true)}catch(_:Exception){null}
   runOnUiThread{if(routeKey!=key)return@runOnUiThread
    if(points==null||points.length()==0){routeKey=null;toast(if(points==null)"No se pudo leer el recorrido. Revisá la conexión." else "Ese viaje todavía no tiene recorrido.")} else show(points)}}
 }
 /** A trip that ended without receipts asks once whether fuel was loaded in it (decision of 28/10/2026). */
 private fun askReceipt(t:JSONObject){
  val id=t.optString("id");val asked="asked-receipt-"
  if(id.isBlank()||store.receiptCount(id)>0||!Reminders.on(this,Reminders.RECEIPT,uid())||prefs().getBoolean(asked,false))return
  prefs().edit().putBoolean(asked,true).apply()
  sheet("¿Cargaste combustible en este viaje?","No tiene boletas cargadas. Si cargaste, sumala ahora que la tenés a mano."){list,d->
   button(list,"Cargar la boleta",Kind.PRIMARY,R.drawable.ic_fuel,top=0){d.dismiss();openFuel(t)}
   button(list,"No cargué combustible",Kind.LINE,top=10){d.dismiss()}}
 }
 private fun askFinish(){AlertDialog.Builder(this).setTitle("¿Finalizar este viaje?").setMessage("Se guardarán el recorrido, las boletas y los remitos.").setNegativeButton("Seguir viaje",null).setPositiveButton("Finalizar"){_,_->try{service(GpsService.FINISH)}catch(_:Exception){toast("No se pudo finalizar. Reintentá.")}}.show()}
 private fun actionBox(p:LinearLayout,icon:Int,label:String,index:Int,action:()->Unit):Pair<ImageView,TextView>{
  val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;background=ripple(glassy(20));isClickable=true;isFocusable=true;contentDescription=label;setOnClickListener{action()}};sink(v,.95f)
  val image=iconView(icon,blue,24);val caption=tv(label,13.5f,blue,1).apply{gravity=Gravity.CENTER;setPadding(0,dp(6),0,0)};v.addView(image);v.addView(caption)
  p.addView(v,LinearLayout.LayoutParams(0,dp(76),1f).apply{if(index>0)marginStart=dp(10)});return Pair(image,caption)
 }
 // Opens the system page where the driver lifts battery limits; asking for the exemption directly is restricted on Google Play.
 private fun batteryExemption(){
  val appPage=Build.VERSION.SDK_INT>=31
  AlertDialog.Builder(this).setTitle("Evitar cortes del GPS")
   .setMessage(if(appPage)"Para que el GPS no se corte durante el viaje, en la pantalla que se abre tocá «Batería» (o «Uso de batería de la app») y elegí «Sin restricciones»." else "Para que el GPS no se corte durante el viaje, en la lista que se abre elegí «Todas las apps», buscá «Transportes Ferreira GPS» y marcá «No optimizar».")
   .setPositiveButton("Abrir ajustes"){_,_->try{startActivity(if(appPage)Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")) else Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))}catch(_:Exception){toast("Abrí Ajustes › Apps › Transportes Ferreira GPS › Batería y elegí «Sin restricciones»")}}
   .setNegativeButton("Ahora no",null).show()
 }
 /** A figure that changes rolls to the new value instead of jumping; no value is a dash. */
 private fun roll(t:TextView,to:Double){
  val from=t.tag as? Double;t.tag=to
  fun show(v:Double){t.text=if(v.isNaN())"—" else String.format(uy,"%.0f",v)}
  if(from==null||from.isNaN()||to.isNaN()||Math.round(from)==Math.round(to)||!moves()){show(to);return}
  ValueAnimator.ofFloat(from.toFloat(),to.toFloat()).apply{duration=500;interpolator=DecelerateInterpolator();addUpdateListener{if(t.tag==to)show((it.animatedValue as Float).toDouble())}}.start()
 }
 private fun refresh(){if(!::store.isInitialized)return;sync?.text=store.message();presence()
  // Flota en vivo, and the trip's map of an owner who drives: who is on a trip every minute, the positions every few seconds.
  val fleetOn=screen=="owner"||((screen=="trip"||screen=="simpletrip")&&isOwner())
  if(fleetOn&&!fleetLoading){val now=System.currentTimeMillis();if(now-fleetLoadedAt>FLEET_MS)loadFleet() else if(!liveLoading&&now-liveLoadedAt>LIVE_MS)loadLive()}
  if(screen=="games"||screen=="chessnew"||screen=="chess"||screen=="truco")gamesCheck()
  if(screen!="trip"&&screen!="simpletrip")return;val t=store.current()?:return
  if(!t.optBoolean("active")){home();toast("Viaje finalizado. Los datos pendientes se enviarán con conexión.");askReceipt(t);return}
  val paused=t.optBoolean("paused")
  status?.text=if(paused)"Viaje pausado" else "Viaje en curso";statusBox?.background=bg(if(paused)0xFFB7740B.toInt() else 0xFF178A4C.toInt(),if(screen=="trip")24 else 22)
  elapsed?.text=elapsedText(t.optString("started_at"))
  distance?.text=km(t.optDouble("distance_meters",0.0))
  pauseLabel?.text=if(screen=="simpletrip")(if(paused)"Reanudar" else "Pausar") else if(paused)"Reanudar viaje" else "Pausar viaje";pauseIcon?.setImageResource(if(paused)R.drawable.ic_play else R.drawable.ic_pause);(pauseLabel?.parent as? View)?.contentDescription=pauseLabel?.text
  val recent=instant(t.optJSONObject("last_point")?.optString("recorded_at"))?.let{System.currentTimeMillis()-it.toEpochMilli()<30000}?:false
  val v=if(paused)0.0 else if(recent)t.optDouble("speed_kmh",0.0) else Double.NaN
  speed?.let{roll(it,v)};gauge?.set(v)
  val over=!v.isNaN()&&v>90;speed?.setTextColor(if(over)red else ink)
  limit?.background=GradientDrawable().apply{shape=GradientDrawable.OVAL;setColor(if(over)red else raised);setStroke(dp(4),red)};limit?.setTextColor(if(over)Color.WHITE else ink)
  val warn=store.warning();gps?.text=if(paused)"El GPS y los kilómetros están pausados" else if(warn.isNotBlank())"⚠ $warn" else if(recent)"GPS actualizado" else "Esperando señal GPS precisa…";gps?.setTextColor(if(warn.isNotBlank()&&!paused)amber else muted)
  val n=store.receiptCount(t.getString("id"));count?.text=if(n==0)"Sin boletas en este viaje" else "$n boleta${if(n==1)"" else "s"} en este viaje"
  liveMap?.let{map->val (points,end)=store.track(t.getString("id"),trackOffset);trackOffset=end;map.push(points)}
 }

 // ---------- Fuel receipt ----------
 private fun openFuel(t:JSONObject?){photoJob++;photoBusy=false;fuelTrip=t;fuelForm=JSONObject().put("receipt_date",LocalDate.now().toString());photo=null;photoMode="fuel";fuel()}
 private fun fuel(){
  page("fuel");photoMode="fuel";bar("Cargar combustible",back={homeOrTrip()})
  root.addView(pill(fuelTrip?.let{"En este viaje · ${truckParts(it.optString("vehicle")).first}"}?:"Sin viaje",blue,blueSoft).apply{(layoutParams as LinearLayout.LayoutParams).topMargin=dp(14)})
  val pc=card(pad=16);text(pc,"Foto de la boleta",16.5f,ink,1);note("Sacá una foto o elegí una guardada. También podés guardar sin foto.",pc,4);photoControls(pc)
  val c=card(pad=16)
  if(fuelTrip==null)truckSelector(c,"Camión · opcional")
  caption(c,"Fecha");val day=fuelForm.optString("receipt_date",LocalDate.now().toString())
  c.addView(tv(try{LocalDate.parse(day).format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))}catch(_:Exception){day},16f,ink).apply{gravity=Gravity.CENTER_VERTICAL;background=ripple(outline(fieldFill,fieldLine,14));setPadding(dp(14),0,dp(14),0);setCompoundDrawablesRelative(null,null,tinted(R.drawable.ic_calendar,muted),null);isClickable=true;isFocusable=true;contentDescription="Fecha de la boleta: $day";setOnClickListener{
   val date=try{LocalDate.parse(fuelForm.optString("receipt_date"))}catch(_:Exception){LocalDate.now()};DatePickerDialog(this@MainActivity,{_,y,m,d->fuelForm.put("receipt_date",LocalDate.of(y,m+1,d).toString());fuel()},date.year,date.monthValue-1,date.dayOfMonth).show()}},LinearLayout.LayoutParams(-1,dp(52)).apply{topMargin=dp(6)})
  val stations=mobile.catalog().optJSONArray("estaciones")?:JSONArray();val names=(0 until stations.length()).map{stations.getJSONObject(it).optString("nombre")}
  if(names.isEmpty())bound(c,"Estación de servicio",fuelForm,"station_name",hint="Nombre de la estación") else {select(c,"Estación de servicio",fuelForm,"station_name",names){fuel()};bound(c,"Otra estación · si no está en la lista",fuelForm,"station_name")}
  val two=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};c.addView(two,LinearLayout.LayoutParams(-1,-2))
  val left=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};val right=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
  two.addView(left,LinearLayout.LayoutParams(0,-2,1f));two.addView(right,LinearLayout.LayoutParams(0,-2,1f).apply{marginStart=dp(12)})
  bound(left,"Litros",fuelForm,"liters",true,"0");bound(right,"Total (UYU)",fuelForm,"total",true,"0")
  // A full tank starts the truck's estimated tank in the panel again from full.
  caption(c,"¿Llenaste el tanque?");val full=fuelForm.optBoolean("full_tank")
  radio(c,"No, cargué una parte",!full){fuelForm.put("full_tank",false);fuel()}
  radio(c,"Sí, lo llené",full){fuelForm.put("full_tank",true);fuel()}
  note("Si lo llenaste, el panel vuelve a calcular desde lleno cuánto gasoil le queda al camión.",c,8)
  dock.visibility=View.VISIBLE
  button(dock,"Guardar combustible",top=0){
   if(photoBusy){toast("Esperá a que termine de prepararse la foto");return@button}
   if(fuelForm.optString("station_name").isBlank()){toast("Indicá la estación de servicio para guardar el combustible");return@button}
   try{val fields=JSONObject(fuelForm.toString());for(key in listOf("liters","total")){val raw=fields.optString(key);val n=raw.replace(',','.').toDoubleOrNull();if(raw.isNotBlank()&&(n==null||!n.isFinite()||n<0)){toast("Revisá litros e importe");return@button};fields.put(key,n?:JSONObject.NULL)}
    for(i in 0 until stations.length()){val station=stations.getJSONObject(i);if(station.optString("nombre")==fields.optString("station_name"))fields.put("station_id",station.optString("id"))}
    store.saveReceipt(photo,fuelTrip,api.session()!!.getJSONObject("user"),name,truck,fields);photo=null;Sync.schedule(this);toast("Combustible guardado");homeOrTrip()
   }catch(_:Exception){toast("No se pudo guardar. Revisá el espacio del teléfono.")}
  }
  note("Se envía al panel cuando haya conexión.",dock,6).gravity=Gravity.CENTER
 }

 // ---------- Remito ----------
 private fun openDocument(t:JSONObject?,target:String,kind:String){photoJob++;photoBusy=false;docTrip=t;docReturn=target;docForm=JSONObject().put("kind",kind);photo=null;document()}
 private fun document(){
  page("document");photoMode="document";bar("Agregar remito",back={backFromDocument()})
  val arrival=docForm.optString("kind")=="arrival"
  val c=card(pad=16);text(c,"¿De dónde es?",16.5f,ink,1)
  radio(c,"Salida de chacra / planta",!arrival){docForm.put("kind","departure");document()}
  radio(c,"Llegada a destino",arrival){docForm.put("kind","arrival");document()}
  bound(c,"Número de remito · opcional",docForm,"number",hint="Ej. 004512")
  val pc=card(pad=16);text(pc,"Foto del remito",16.5f,ink,1);photoControls(pc)
  val dc=card(pad=16);text(dc,"Datos de la carga",16.5f,ink,1);note("Completá lo que tengas; todo es opcional.",dc,4)
  select(dc,"Tipo de carga",docForm,"cargo_type",catalogNames("tiposCarga"));bound(dc,"Kilogramos",docForm,"kg",true,"0")
  dock.visibility=View.VISIBLE
  button(dock,"Guardar remito",top=0){
   if(photoBusy){toast("Esperá a que termine de prepararse la foto");return@button}
   try{val d=JSONObject(docForm.toString());val raw=d.optString("kg");val n=raw.replace(',','.').toDoubleOrNull();if(raw.isNotBlank()&&(n==null||!n.isFinite()||n<0)){toast("Revisá los kilogramos");return@button};d.put("kg",n?:JSONObject.NULL)
    if(docTrip==null){photo?.let{d.put("draft_photo",it.path)};draftDocs.put(d)}else{store.saveDocument(docTrip!!,d,photo);Sync.schedule(this)}
    photo=null;toast("Remito agregado. Podés agregar otro.");backFromDocument()
   }catch(_:Exception){toast("No se pudo guardar el remito")}
  }
 }
 private fun backFromDocument(){when(docReturn){"prepare"->prepare();"tripdetail"->historyTrip?.let{detail(it,true)};else->trip()}}
 private fun photoControls(c:LinearLayout){
  val two=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};c.addView(two,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(12)})
  two.addView(photoButton(R.drawable.ic_camera,if(photo==null)"Sacar foto" else "Sacar otra"){takePhoto()},LinearLayout.LayoutParams(0,dp(72),1f))
  two.addView(photoButton(R.drawable.ic_image,"Galería"){pick.launch("image/*")},LinearLayout.LayoutParams(0,dp(72),1f).apply{marginStart=dp(10)})
  photo?.takeIf{it.exists()}?.let{f->
   val frame=FrameLayout(this).apply{background=bg(0xFF263041.toInt(),16);clipToOutline=true}
   frame.addView(ImageView(this).apply{setImageURI(Uri.fromFile(f));scaleType=ImageView.ScaleType.CENTER_CROP;contentDescription="Vista previa del comprobante"},FrameLayout.LayoutParams(-1,-1))
   frame.addView(ImageView(this).apply{setImageResource(R.drawable.ic_close);imageTintList=ColorStateList.valueOf(0xFF111C2E.toInt());background=oval(0xEEFFFFFF.toInt());setPadding(dp(7),dp(7),dp(7),dp(7));contentDescription="Quitar foto";isClickable=true;isFocusable=true;setOnClickListener{removePhoto()}},FrameLayout.LayoutParams(dp(36),dp(36),Gravity.TOP or Gravity.END).apply{setMargins(dp(8),dp(8),dp(8),dp(8))})
   frame.addView(tv("Foto adjunta",12f,Color.WHITE,1).apply{background=bg(0xF2178A4C.toInt(),12);setPadding(dp(9),dp(4),dp(9),dp(5))},FrameLayout.LayoutParams(-2,-2,Gravity.BOTTOM or Gravity.START).apply{setMargins(dp(10),dp(10),dp(10),dp(10))})
   c.addView(frame,LinearLayout.LayoutParams(-1,dp(170)).apply{topMargin=dp(12)})
  }
 }
 private fun photoButton(icon:Int,label:String,action:()->Unit)=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;background=ripple(outline(btnFill,fieldLine,18));isClickable=true;isFocusable=true;contentDescription=label;setOnClickListener{action()};sink(this,.96f)
  addView(iconView(icon,blue,24));addView(tv(label,13.5f,ink,1).apply{gravity=Gravity.CENTER;setPadding(0,dp(5),0,0)})}
 private fun takePhoto(){try{camera=File(File(filesDir,"camera").apply{mkdirs()},"${UUID.randomUUID()}.jpg");take.launch(FileProvider.getUriForFile(this,"$packageName.files",camera!!))}catch(_:Exception){toast("No hay cámara disponible. Elegí una imagen de la galería.")}}
 private fun removePhoto(){photoJob++;photoBusy=false;photo?.delete();photo=null;if(screen=="document")document() else fuel()}
 private fun cargoNames(client:String):List<String>{
  val entries=mobile.catalog().optJSONArray("clientesDetalle")?:JSONArray()
  for(i in 0 until entries.length()){val e=entries.getJSONObject(i);if(e.optString("nombre").equals(client,true)){val a=e.optJSONArray("cargas")?:JSONArray();if(a.length()>0)return (0 until a.length()).map{a.optString(it)}}}
  return catalogNames("tiposCarga")
 }
 private fun catalogNames(key:String):List<String>{val a=mobile.catalog().optJSONArray(key)?:JSONArray();return (0 until a.length()).map{a.optString(it)}}
 private fun searchDestination(){
  val q=tripForm.optString("destino");if(q.isBlank()){toast("Escribí un lugar para buscar. También podés iniciar sin destino.");return};toast("Buscando destino…")
  thread{try{@Suppress("DEPRECATION") val found=Geocoder(this,uy).getFromLocationName(q,5)?:emptyList();runOnUiThread{if(screen!="prepare")return@runOnUiThread;if(found.isEmpty()){toast("No se encontraron resultados. Podés conservar el nombre escrito.");return@runOnUiThread};pick("Elegí un destino",found.map{it.getAddressLine(0)?:it.featureName?:q}){i->val a=found[i];tripForm.put("destino",a.getAddressLine(0)?:q).put("destination_lat",a.latitude).put("destination_lng",a.longitude);prepare()}}}catch(_:Exception){runOnUiThread{toast("Búsqueda no disponible. Podés iniciar con el destino escrito o sin destino.")}}}
 }

 // ---------- History ----------
 /** Opens a list of one driver or of the whole fleet; search and filters start clean when that changes. */
 private fun openHistory(kind:String,fleet:Boolean){if(fleetView!=fleet){historyQuery="";tripFilter=0;historyLimit=50};fleetView=fleet;history(kind,true)}
 private fun history(kind:String,refresh:Boolean=false){
  val fleet=fleetView||panelFirst();val key=if(kind=="trips")"triphistory" else "fuelhistory";page(key)
  // An owner who also drives opens the fleet lists from the owner menu: a back arrow replaces the driver tabs.
  val hub=fleet&&!panelFirst()
  val title=if(kind=="trips")(if(fleet)"Viajes de la flota" else "Mis viajes") else (if(fleet)"Combustible de la flota" else "Mi combustible")
  bar(title,back=if(hub){{homeOrTrip()}} else null,trailing=if(kind=="fuel"&&!fleet)plusButton("Cargar combustible"){fuelChoice()} else barButton(R.drawable.ic_sync,"Actualizar"){history(kind,true)})
  val rows=mobile.history(kind,historyLimit,false,fleet)
  if(kind=="trips")tripList(rows,fleet) else fuelList(rows,fleet)
  if(rows.length()>=historyLimit)button(root,"Cargar más",Kind.LINE){historyLimit+=50;history(kind,true)}
  if(!hub)navBar(kind)
  if(refresh)thread{try{var limit=historyLimit;var loaded=mobile.history(kind,limit,true,fleet)
    // "Este mes" adds up the whole month: keep loading while the oldest receipt loaded is still from this month.
    while(kind=="fuel"&&fuelMonth&&loaded.length()>=limit&&limit<2000&&loaded.optJSONObject(loaded.length()-1)?.let{r->zoned(r.optString("recorded_at"))?.let{YearMonth.from(it)}}==YearMonth.now()){limit+=50;loaded=mobile.history(kind,limit,true,fleet)}
    runOnUiThread{historyLimit=maxOf(historyLimit,limit);if(screen==key)history(kind)}}catch(_:Exception){runOnUiThread{if(screen==key)toast("Sin conexión. Mostrando los registros guardados en este teléfono.")}}}
 }
 private fun tripList(rows:JSONArray,fleet:Boolean){
  val info=mobile.tripInfo(fleet)
  segmented(root,listOf("Todos","Activos","Finalizados"),tripFilter){tripFilter=it;history("trips")}
  val search=searchBox(root,"Buscar por camión, destino o carga",historyQuery)
  val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};root.addView(box,LinearLayout.LayoutParams(-1,-2))
  fun render(){box.removeAllViews();val q=historyQuery.trim().lowercase(uy);var c:LinearLayout?=null
   for(i in 0 until rows.length()){val r=rows.getJSONObject(i);val d=info.optJSONObject(r.optString("id"))?:JSONObject()
    val haystack=listOf(r.optString("vehicle"),r.optString("driver_name"),d.optString("destino"),d.optString("cliente"),d.optString("tipoCarga"),date(r.optString("started_at"))).joinToString(" ").lowercase(uy)
    if(q.isNotEmpty()&&!haystack.contains(q))continue
    if((tripFilter==1&&!r.optBoolean("active"))||(tripFilter==2&&r.optBoolean("active")))continue
    if(c==null)c=card(box);tripRow(c,r,d,fleet)}
   if(c==null){val prev=root;root=box;emptyCard(R.drawable.ic_route,if(q.isNotEmpty())"Sin resultados" else if(tripFilter==1)"No hay viajes en curso" else if(tripFilter==2)"Todavía no hay viajes finalizados" else "Todavía no hay viajes",if(q.isNotEmpty())"No hay viajes que coincidan con «${historyQuery.trim()}»." else if(tripFilter==1)"Los viajes iniciados aparecen acá hasta que se finalizan." else "Los viajes aparecen acá cuando se inician.");root=prev}
  }
  render()
  search.addTextChangedListener(object:TextWatcher{override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){};override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){};override fun afterTextChanged(e:Editable?){historyQuery=e?.toString()?:"";render()}})
 }
 private fun tripRow(c:LinearLayout,r:JSONObject,d:JSONObject,fleet:Boolean){
  if(c.childCount>0)divider(c,16)
  val z=zoned(r.optString("started_at"))
  val v=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(12),dp(12),dp(12),dp(12));background=ripple(null);isClickable=true;isFocusable=true;setOnClickListener{detailFrom="list";detail(r,true)}}
  val badge=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;background=bg(greyBg,14)}
  badge.addView(tv(z?.format(DateTimeFormatter.ofPattern("dd"))?:"--",19f,ink,2).apply{gravity=Gravity.CENTER})
  badge.addView(tv(z?.format(DateTimeFormatter.ofPattern("MMM",uy))?.replace(".","")?.uppercase(uy)?:"",11f,muted,1).apply{gravity=Gravity.CENTER})
  v.addView(badge,LinearLayout.LayoutParams(dp(50),dp(56)))
  val model=truckParts(r.optString("vehicle")).first;val dest=d.optString("destino")
  val title=if(dest.isNotBlank())dest else model.ifBlank{"Viaje sin camión"}
  val kg=d.optString("kg").takeIf{it.isNotBlank()&&it!="null"}?.let{"$it kg"}
  val cargo=if(r.optString("load_type")=="empty")"Retorno vacío" else listOfNotNull(d.optString("tipoCarga").ifBlank{null},kg).joinToString(" · ").ifBlank{"Con carga"}
  val sub=listOfNotNull(if(fleet)r.optString("driver_name").substringBefore(" ").ifBlank{null} else null,km(r.optDouble("distance_meters",0.0)),cargo,z?.format(DateTimeFormatter.ofPattern("HH:mm"))).joinToString(" · ")
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,dp(8),0)}
  col.addView(tv(title,15.5f,ink,1).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END})
  col.addView(tv(sub,13f,muted).apply{maxLines=2;setPadding(0,dp(3),0,0)})
  if(dest.isNotBlank()&&model.isNotBlank())col.addView(tv(model,12.5f,faint).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END;setPadding(0,dp(2),0,0)})
  v.addView(col,LinearLayout.LayoutParams(0,-2,1f))
  val running=r.optBoolean("active")
  v.addView(when{running&&r.optBoolean("paused")->pill("Pausado",amber,amberBg);running->pill("En curso",blue,blueSoft);else->pill("Finalizado",green,greenBg)})
  v.contentDescription="$title. $sub";c.addView(v,LinearLayout.LayoutParams(-1,-2))
 }
 private fun fuelList(rows:JSONArray,fleet:Boolean){
  segmented(root,listOf("Este mes","Todos"),if(fuelMonth)0 else 1){fuelMonth=it==0;history("fuel",fuelMonth)}
  val now=YearMonth.now();val list=(0 until rows.length()).map{rows.getJSONObject(it)}.filter{!fuelMonth||fuelDay(it)?.let{d->YearMonth.from(d)}==now}
  // Pesos and dollars are never added together: each currency is totalled on its own line, pesos first.
  var litres=0.0;val spent=TreeMap<String,Double>(compareBy<String>{it!="UYU"}.thenBy{it})
  list.forEach{r->val d=panelData(r);amount(d,"litros",r,"liters")?.let{litres+=it};amount(d,"monto",r,"total")?.let{val cur=currency(d);spent[cur]=(spent[cur]?:0.0)+it}}
  val k=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};root.addView(k,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(12)})
  kpi(k,"Total litros",litre(litres),0);kpi(k,"Total gastado",spent.entries.joinToString("\n"){cash(it.key,it.value)}.ifEmpty{cash("UYU",0.0)},1,maxOf(1,spent.size))
  if(list.isEmpty()){emptyCard(R.drawable.ic_fuel,if(fuelMonth)"Sin cargas este mes" else "Todavía no hay cargas",if(fleet)"Las cargas de la flota aparecen acá cuando se registran." else "Tocá + para registrar una carga de combustible.");return}
  val c=card();list.forEach{fuelRow(c,it,fleet)}
 }
 private fun fuelRow(c:LinearLayout,r:JSONObject,fleet:Boolean){
  if(c.childCount>0)divider(c,68)
  val d=panelData(r)
  val station=d.optString("estacionNombre").takeIf{it.isNotBlank()&&it!="null"}?:r.optString("station_name").ifBlank{"Estación por completar"}
  val day=fuelDay(r)?.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
  val who=if(fleet)r.optString("driver_name").substringBefore(" ").ifBlank{null} else null
  // The office's correction wins over what was declared, as for the rest of the receipt.
  val full=(d.opt("tanque_lleno") as? Boolean)?:r.optBoolean("full_tank",false)
  val v=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(14),dp(12),dp(14),dp(12))}
  v.addView(square(R.drawable.ic_fuel,green,greenBg))
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,dp(8),0)}
  col.addView(tv(station,15f,ink,1).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END})
  col.addView(tv(listOfNotNull(day,who,if(r.isNull("trip_id"))"Sin viaje" else "En viaje",if(full)"Tanque lleno" else null).joinToString(" · "),13f,muted).apply{setPadding(0,dp(3),0,0)})
  v.addView(col,LinearLayout.LayoutParams(0,-2,1f))
  val right=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.END}
  val lt=amount(d,"litros",r,"liters");val paid=amount(d,"monto",r,"total");val cur=currency(d)
  right.addView(tv(lt?.let{litre(it)}?:"— L",15f,ink,1).apply{gravity=Gravity.END})
  right.addView(tv(paid?.let{cash(cur,it)}?:"Sin monto",13f,muted).apply{gravity=Gravity.END;setPadding(0,dp(3),0,0)})
  v.addView(right);v.contentDescription="$station, ${day?:""}"
  if(!r.isNull("object_path")){v.background=ripple(null);v.isClickable=true;v.isFocusable=true;v.contentDescription="$station, ${day?:""}. Ver boleta";v.setOnClickListener{showPhoto(r,"trf-fuel-receipts")}}
  c.addView(v,LinearLayout.LayoutParams(-1,-2))
 }
 private fun currency(d:JSONObject)=d.optString("moneda").takeIf{it.isNotBlank()&&it!="null"}?:"UYU"
 private fun cash(cur:String,v:Double)=(when(cur){"UYU"->"$ ";"USD"->"US$ ";else->"$cur "})+money(v)
 /** The office's corrections on a fuel receipt; older rows keep them as JSON text, like the month summary reads them. */
 private fun panelData(r:JSONObject):JSONObject=r.optJSONObject("panel_data")?:try{JSONObject(r.optString("panel_data"))}catch(_:Exception){JSONObject()}
 /** The office's value when it has one, else the phone's; numbers typed the Uruguayan way ("30.000", "1.234,5") count, as in Rendimiento. */
 private fun amount(a:JSONObject,k:String,b:JSONObject,l:String):Double?=(if(a.isNull(k))null else FleetStats.number(a.opt(k)))?:(if(b.isNull(l))null else FleetStats.number(b.opt(l)))
 /** The day a receipt counts on, the same rule as Rendimiento and the panel (FleetStats.fuelDay). */
 private fun fuelDay(r:JSONObject):LocalDate?=FleetStats.fuelDay(panelData(r).optString("fecha").takeIf{it!="null"},r.optString("receipt_date"),r.optString("recorded_at"),java.time.ZoneId.systemDefault())

 // ---------- Trip detail ----------
 private fun detail(t:JSONObject,refresh:Boolean=false){
  historyTrip=t;page("tripdetail");bar("Detalle del viaje",back={leaveDetail()})
  val bundle=mobile.detail(t);val d=bundle.optJSONObject("data")?:JSONObject();val docs=bundle.optJSONArray("documents")?:JSONArray()
  val running=t.optBoolean("active");val (model,plate)=truckParts(t.optString("vehicle"))
  val (label,fg,fill)=when{running&&t.optBoolean("paused")->Triple("Viaje pausado",amber,amberBg);running->Triple("Viaje en curso",blue,blueSoft);else->Triple("Viaje finalizado",green,greenBg)}
  val banner=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;background=outline(fill,glassLine,24);setPadding(dp(16),0,dp(16),0)}
  banner.addView(iconView(if(running)R.drawable.ic_navigation else R.drawable.ic_check_circle,fg,20));banner.addView(tv(label,15.5f,fg,1).apply{setPadding(dp(10),0,0,0)},LinearLayout.LayoutParams(0,-2,1f))
  if(plate.isNotBlank())banner.addView(tv(plate,13f,fg))
  root.addView(banner,LinearLayout.LayoutParams(-1,dp(48)).apply{topMargin=dp(12)})
  fun coord(lat:String,lng:String)=if(t.has(lat)&&!t.isNull(lat))"${String.format(Locale.US,"%.5f",t.optDouble(lat))}, ${String.format(Locale.US,"%.5f",t.optDouble(lng))}" else null
  val tl=card(pad=16)
  stop(tl,"Origen",d.optString("origen").ifBlank{null}?:coord("origin_lat","origin_lng")?:"Sin lectura GPS",date(t.optString("started_at")),true)
  stop(tl,"Destino",d.optString("destino").ifBlank{null}?:"Sin destino previsto",if(running)"En curso" else t.optString("ended_at").takeIf{it.isNotBlank()&&it!="null"}?.let{date(it)}?:"",false)
  val f=card()
  fact(f,R.drawable.ic_truck,"Camión",listOf(model,plate).filter{it.isNotBlank()}.joinToString(" · ").ifBlank{"Sin camión asignado"})
  if(t.optString("driver_id").let{it.isNotBlank()&&it!=uid()})fact(f,R.drawable.ic_person,"Chofer",t.optString("driver_name").ifBlank{"Sin nombre"})
  fact(f,R.drawable.ic_box,"Tipo de carga",d.optString("tipoCarga").ifBlank{if(t.optString("load_type")=="empty")"Retorno vacío" else "Pendiente"})
  if(t.optString("load_type")!="empty")fact(f,R.drawable.ic_weight,"Peso transportado",d.optString("kg").takeIf{it.isNotBlank()&&it!="null"}?.let{"$it kg"}?:"Pendiente")
  fact(f,R.drawable.ic_business,"Cliente",d.optString("cliente").ifBlank{"Pendiente"})
  fact(f,R.drawable.ic_route,"Distancia recorrida",d.optString("km").takeIf{it.isNotBlank()&&it!="null"}?.let{"$it km"}?:km(t.optDouble("distance_meters",0.0)))
  // What the distance counted while the GPS had no signal, and the cuts left for the panel to check.
  mobile.gaps(t).takeIf{it.isNotEmpty()}?.let{g->val open=g.count{it.optString("method")==Gaps.Method.UNFILLED.db};val filled=g.size-open
   fact(f,R.drawable.ic_gps,"Sin señal GPS",listOfNotNull(if(filled>0)"${km(g.sumOf{it.optDouble("meters",0.0)})} estimados en $filled ${if(filled==1)"tramo" else "tramos"}" else null,if(open>0)"$open sin completar, para revisar" else null).joinToString(" · "))}
  if(!running)durationText(t.optString("started_at"),t.optString("ended_at"))?.let{fact(f,R.drawable.ic_clock,"Tiempo de viaje",it)}
  coord("arrival_lat","arrival_lng")?.let{fact(f,R.drawable.ic_pin,"Última ubicación / llegada",it)}
  if(d.optString("remito").isNotBlank())fact(f,R.drawable.ic_receipt,"Remitos cargados en el panel",d.optString("remito"))
  section("Remitos (${docs.length()})")
  if(docs.length()>0){val rc=card();for(i in 0 until docs.length()){val r=docs.getJSONObject(i)
   val photoLink=if(!r.isNull("object_path"))tv("Ver foto",14.5f,blue,1).apply{setPadding(dp(8),dp(10),dp(4),dp(10));isClickable=true;isFocusable=true;setOnClickListener{showPhoto(r,"trf-trip-documents")}} else null
   val kg=r.optString("kg").takeUnless{it=="null"||it.isBlank()}?.let{"$it kg"}
   row(rc,R.drawable.ic_receipt,"${if(r.optString("kind")=="arrival")"Llegada" else "Salida"} · ${r.optString("number").ifBlank{"Sin número"}}",listOfNotNull(r.optString("cargo_type").ifBlank{null},kg).joinToString(" · ").ifBlank{"Sin datos de carga"},trailing=photoLink)}}
  else note("Este viaje todavía no tiene remitos.",top=8)
  if(t.optString("driver_id").ifBlank{uid()}==uid())button(root,"Agregar remito",Kind.LINE,R.drawable.ic_plus){openDocument(t,"tripdetail","arrival")}
  section("Recorrido")
  val points=mobile.route(t)
  if(points.length()>0){val mc=card();val map=TripMap.view(this,points);activeMap=map;mc.addView(map.view,LinearLayout.LayoutParams(-1,dp(300)));button(root,"Ver mapa en pantalla completa",Kind.LINE,R.drawable.ic_map){fullMap(points)};note("Las líneas unen las lecturas GPS. Lo punteado es un tramo sin señal, estimado; las pausas quedan abiertas.")}
  else note("Sin recorrido disponible. Actualizá para consultar el GPS guardado.",top=8)
  link(root,"Actualizar desde el panel",top=10){detail(t,true)}
  if(refresh)thread{try{mobile.detail(t,true);mobile.route(t,true);runOnUiThread{if(screen=="tripdetail"&&historyTrip?.optString("id")==t.optString("id"))detail(t)}}catch(_:Exception){runOnUiThread{if(screen=="tripdetail")toast("No se pudo actualizar. Se mantienen los datos guardados.")}}}
 }
 /** A trip opened from the live fleet goes back to it; any other goes back to its list. */
 private fun leaveDetail(){if(detailFrom=="fleet")ownerDashboard() else history("trips")}
 private fun stop(p:LinearLayout,label:String,place:String,time:String,first:Boolean){
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL}
  val rail=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL}
  rail.addView(View(this).apply{background=GradientDrawable().apply{shape=GradientDrawable.OVAL;setColor(if(first)raised else green);setStroke(dp(3),green)}},LinearLayout.LayoutParams(dp(16),dp(16)).apply{topMargin=dp(3)})
  if(first)rail.addView(View(this).apply{setBackgroundColor(tone(0xFFB9DEC8,0xFF2A5A40))},LinearLayout.LayoutParams(dp(2),0,1f).apply{topMargin=dp(2)})
  r.addView(rail,LinearLayout.LayoutParams(dp(18),-1))
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,dp(8),if(first)dp(16) else 0)}
  col.addView(tv(label,13f,muted));col.addView(tv(place,16f,ink,1).apply{setPadding(0,dp(2),0,0)})
  if(time.isNotBlank())col.addView(tv(time,13f,muted).apply{setPadding(0,dp(2),0,0)})
  r.addView(col,LinearLayout.LayoutParams(0,-2,1f))
  p.addView(r,LinearLayout.LayoutParams(-1,-2))
 }
 private var fullFleetMap:TripMap.Fleet?=null
 /** Flota en vivo on the whole screen: the trucks move as on its own map, with their speed, and show their route when tapped. */
 private fun fullFleet(){
  val dialog=android.app.Dialog(this,if(dark)android.R.style.Theme_Material_NoActionBar else android.R.style.Theme_Material_Light_NoActionBar)
  val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(12),dp(12),dp(12),dp(12));setBackgroundColor(surface)}
  button(layout,"Cerrar mapa",Kind.LINE,R.drawable.ic_close,top=0){dialog.dismiss()}
  val f=mobile.fleet();val map=TripMap.fleet(this,fleetMarks(fleetItems(f),f),LIVE_MS);fullFleetMap=map
  routeKey=null;map.onTruck{k->truckRoute(k){map.showRoute(it)}}
  layout.addView(map.view,LinearLayout.LayoutParams(-1,0,1f).apply{topMargin=dp(12)});dialog.setContentView(layout)
  dialog.setOnDismissListener{map.destroy();fullFleetMap=null;routeKey=null}
  dialog.show();dialog.window?.setLayout(-1,-1)
  ViewCompat.setOnApplyWindowInsetsListener(layout){v,i->val insets=i.getInsets(WindowInsetsCompat.Type.systemBars());v.setPadding(insets.left+dp(12),insets.top+dp(12),insets.right+dp(12),insets.bottom+dp(12));i}
 }
 private fun fullMap(points:JSONArray){
  val dialog=android.app.Dialog(this,android.R.style.Theme_Material_Light_NoActionBar)
  val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(12),dp(12),dp(12),dp(12));setBackgroundColor(surface)}
  button(layout,"Cerrar mapa",Kind.LINE,R.drawable.ic_close,top=0){dialog.dismiss()}
  val map=TripMap.view(this,points);layout.addView(map.view,LinearLayout.LayoutParams(-1,0,1f).apply{topMargin=dp(12)});dialog.setContentView(layout)
  dialog.setOnDismissListener{map.destroy()};dialog.show();dialog.window?.setLayout(-1,-1)
  ViewCompat.setOnApplyWindowInsetsListener(layout){v,i->val insets=i.getInsets(WindowInsetsCompat.Type.systemBars());v.setPadding(insets.left+dp(12),insets.top+dp(12),insets.right+dp(12),insets.bottom+dp(12));i}
 }

 // ---------- Sample view: every screen with made-up data, for the screenshots of the emulator (CI) ----------
 /**
  * Only on a debug build, which never goes to Google Play, started with trf_sample («driver» or «owner») and the screen
  * to show in trf_sample_screen. The account and the data are made up; nothing is read from or sent to the server
  * (Api.sample). The screenshots of every screen, in light and in dark, are taken by .github/scripts/capturas_app.py.
  */
 private fun sampleView()=(applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0&&intent?.getStringExtra("trf_sample")!=null
 private fun sample(first:Boolean){
  val owner=intent.getStringExtra("trf_sample")=="owner"
  Api.sample=JSONObject().put("user",JSONObject().put("id",if(owner)"muestra-duenio" else "muestra-chofer").put("email",if(owner)"luis@trferreira.com" else "chofer@ejemplo.com")
   .put("user_metadata",JSONObject().put("full_name",if(owner)"Luis Ferreira" else "Martín Pereira")))
  name=driverName();if(first)sampleData()
  val see=intent.getStringExtra("trf_sample_screen")?:"home"
  setMode(if(see.startsWith("simple"))UiMode.SIMPLE else UiMode.NORMAL)
  if(see in setOf("trip","tripsheet","tripfinish","simpletrip","simplefinish")&&!active())sampleTrip()
  val t=mobile.history("trips").optJSONObject(0)
  when(see){
   "mode"->askMode();"newtrip"->newTrip();"pick"->{newTrip();pickTruck{newTrip()}};"prepare"->{tripForm=JSONObject().put("destino","Puerto de Montevideo").put("cliente","Cooperativa del Este").put("tipoCarga","Arroz").put("kg","28500");prepare()}
   "fuel"->openFuel(null);"document"->openDocument(t,"tripdetail","arrival");"triphistory"->history("trips");"fuelhistory"->history("fuel");"tripdetail"->t?.let{detail(it)}?:home()
   "documents"->documents();"maintenance"->maintenance();"settings"->settings();"games"->games();"privacy"->privacy()
   "simplehome"->simpleHome();"simpleask"->{startAskAt=SystemClock.elapsedRealtime();simpleHome(true)};"simpletrip"->simpleTrip();"simplefinish"->{simpleTrip();finishAsk=true;simpleDock()}
   "trip"->trip();"tripsheet"->{trip();stage?.postDelayed({sheet(true)},300)};"tripfinish"->{trip();askFinish()};"receipt"->{home();t?.let{askReceipt(it)}};"ownermenu"->{home();ownerMenu()};"owner"->ownerDashboard();"fleetfull"->{ownerDashboard();fullFleet()};"performance"->performance()
   else->home()}
  // The screens of a trip change every second and the emulator's reader of screens never finds them still: the script
  // knows the screen is up from this line of the log.
  stage?.post{android.util.Log.i("TRF-muestra","lista ${intent.getStringExtra("trf_sample_tag")?:see}.")}
 }
 /** Trips, receipts, papers, services, the fleet and the month of a small company, around today. */
 private fun sampleData(){
  val u=uid();val now=Instant.now();val today=LocalDate.now()
  fun hours(h:Long)=now.minus(Duration.ofMinutes(h*60)).toString()
  val trucks=listOf("Ford Cargo 1722" to "ATP 2231","Mercedes-Benz 1618" to "ATR 4410","Volvo FH 460" to "ATN 9032","Scania R450" to "ATS 1187")
  val label={i:Int->"${trucks[i].first} · ${trucks[i].second}"}
  store.cache("catalog-$u",JSONObject().put("equipos",JSONArray(trucks.map{JSONObject().put("tipo",it.first).put("matriculaCamion",it.second)}))
   .put("tiposCarga",JSONArray(listOf("Arroz","Soja","Granos","Caña de azúcar","Fertilizante"))).put("clientes",JSONArray(listOf("Cooperativa del Este","Molino San José","Agroservicios del Norte")))
   .put("estaciones",JSONArray(listOf(JSONObject().put("id","e1").put("nombre","ANCAP Ruta 8 km 120"),JSONObject().put("id","e2").put("nombre","Petrobras Treinta y Tres")))))
  saveTruck(label(0))
  // The driver's trips: hours ago it started, hours it lasted, kilometres, destination, client, cargo and kilos (empty without).
  val trips=JSONArray();val info=JSONObject()
  listOf(listOf(6L,5L,286.4,"Molino San José, Treinta y Tres","Molino San José","Arroz","28500"),listOf(27L,4L,212.0,"Puerto de Montevideo","Cooperativa del Este","Soja","30100"),
   listOf(50L,3L,198.3,"Vergara","","",""),listOf(74L,4L,154.8,"Silos de José Pedro Varela","Agroservicios del Norte","Granos","27000"),listOf(122L,5L,241.6,"Puerto de Montevideo","Molino San José","Arroz","29800"))
   .forEachIndexed{i,v->val id="muestra-viaje-$i";val start=v[0] as Long;val empty=(v[5] as String).isBlank()
    trips.put(JSONObject().put("id",id).put("driver_id",u).put("driver_name",name).put("vehicle",label(0)).put("started_at",hours(start)).put("ended_at",hours(start-(v[1] as Long)))
     .put("active",false).put("paused",false).put("load_type",if(empty)"empty" else "loaded").put("distance_meters",(v[2] as Double)*1000).put("origin_lat",-32.944).put("origin_lng",-53.939).put("arrival_lat",-33.233).put("arrival_lng",-54.383))
    info.put(id,JSONObject().put("destino",v[3]).put("cliente",v[4]).put("tipoCarga",v[5]).put("kg",v[6]))}
  store.cache("trips-$u",JSONObject().put("rows",trips).put("fetched_at",now.toEpochMilli()))
  store.cache("tripinfo-$u",JSONObject().put("data",info))
  store.cache("detail-$u-muestra-viaje-0",JSONObject().put("data",JSONObject(info.getJSONObject("muestra-viaje-0").toString()).put("origen","Vergara, Treinta y Tres"))
   .put("documents",JSONArray(listOf(JSONObject().put("id","r1").put("kind","departure").put("number","004512").put("cargo_type","Arroz").put("kg",28500),JSONObject().put("id","r2").put("kind","arrival").put("number","004513").put("cargo_type","Arroz").put("kg",28380)))))
  // A reading a minute, and a stretch without signal whose road the app estimated (Gaps): drawn dashed.
  store.cache("route-$u-muestra-viaje-0",JSONObject().put("points",JSONArray((0..12).map{i->JSONObject().put("latitude",-32.944-i*0.0242).put("longitude",-53.939-i*0.037+(if(i%3==1)0.006 else 0.0)).put("recorded_at",now.minus(Duration.ofMinutes(360L-i)).toString()).put("segment",0).put("estimated",i in 6..7)}))
   .put("gaps",JSONArray().put(JSONObject().put("id","muestra-tramo").put("meters",8400.0).put("method",Gaps.Method.ROUTE.db))))
  // Fuel receipts of the last days, some in a trip.
  val fuel=JSONArray()
  listOf(listOf(1L,"ANCAP Ruta 8 km 120",180.0,11358.0,true,"muestra-viaje-0"),listOf(2L,"Petrobras Treinta y Tres",150.0,9465.0,false,"muestra-viaje-1"),listOf(4L,"ANCAP Ruta 8 km 120",200.0,12620.0,true,""),listOf(6L,"Petrobras Treinta y Tres",95.5,6026.0,false,"muestra-viaje-4"))
   .forEachIndexed{i,v->val day=today.minusDays(v[0] as Long)
    fuel.put(JSONObject().put("id","muestra-boleta-$i").put("driver_id",u).put("driver_name",name).put("vehicle",label(0)).put("station_name",v[1]).put("receipt_date",day.toString()).put("recorded_at",day.atTime(10,30).atZone(ZoneId.systemDefault()).toInstant().toString())
     .put("liters",v[2]).put("total",v[3]).put("full_tank",v[4]).put("trip_id",(v[5] as String).ifBlank{null}?:JSONObject.NULL).put("object_path",JSONObject.NULL))}
  store.cache("fuel-$u",JSONObject().put("rows",fuel).put("fetched_at",now.toEpochMilli()))
  // Papers: one to renew soon, one expired, the rest in order. Services: one coming, one done, one planned.
  store.cache("documents-$u",JSONObject().put("rows",JSONArray(listOf(
   JSONObject().put("id","p1").put("scope","driver").put("driver_id",u).put("driver_name",name).put("kind","Licencia de conducir").put("expires_on",today.plusDays(18).toString()),
   JSONObject().put("id","p2").put("scope","driver").put("driver_id",u).put("driver_name",name).put("kind","Carné de salud").put("expires_on",today.plusDays(210).toString()),
   JSONObject().put("id","p3").put("scope","vehicle").put("vehicle",label(0)).put("kind","SOA / Seguro").put("expires_on",today.minusDays(3).toString()),
   JSONObject().put("id","p4").put("scope","vehicle").put("vehicle",label(0)).put("kind","Habilitación MTOP").put("expires_on",today.plusDays(95).toString())))).put("fetched_at",now.toEpochMilli()))
  store.cache("maintenance-$u",JSONObject().put("rows",JSONArray(listOf(
   JSONObject().put("id","s1").put("vehicle",label(0)).put("kind","Cambio de aceite").put("due_on",today.plusDays(6).toString()).put("due_km",412500).put("interval_km",10000).put("created_by",u),
   JSONObject().put("id","s2").put("vehicle",label(0)).put("kind","Revisión de frenos").put("done_on",today.minusDays(12).toString()).put("odometer_km",401380).put("created_by",u),
   JSONObject().put("id","s3").put("vehicle",label(0)).put("kind","Cubiertas").put("due_on",today.plusDays(40).toString()).put("created_by",u)))).put("fetched_at",now.toEpochMilli()))
  // The fleet: two trucks on a trip, one moving and one stopped; the other two without a trip.
  store.cache("fleet-$u",JSONObject().put("fetched_at",now.toEpochMilli()).put("live_at",now.toEpochMilli())
   .put("active",JSONArray(listOf(
    JSONObject().put("id","muestra-flota-1").put("driver_id","muestra-d1").put("driver_name","Diego Rodríguez").put("vehicle",label(2)).put("started_at",hours(2)).put("paused",false).put("load_type","loaded").put("distance_meters",142300.0)
     .put("last",JSONObject().put("latitude",-33.512).put("longitude",-55.103).put("speed_kmh",82.0).put("recorded_at",now.minusSeconds(20).toString())),
    JSONObject().put("id","muestra-flota-2").put("driver_id","muestra-d2").put("driver_name","Sofía Martínez").put("vehicle",label(3)).put("started_at",hours(1)).put("paused",false).put("load_type","loaded").put("distance_meters",38400.0)
     .put("last",JSONObject().put("latitude",-32.371).put("longitude",-54.168).put("speed_kmh",0.0).put("recorded_at",now.minusSeconds(60).toString())))))
   .put("recent",JSONArray(listOf(JSONObject().put("driver_name","Martín Pereira").put("vehicle",label(0)).put("ended_at",hours(1)).put("arrival_lat",-33.233).put("arrival_lng",-54.383),
    JSONObject().put("driver_name","Luis Ferreira").put("vehicle",label(1)).put("ended_at",hours(26)).put("arrival_lat",-34.905).put("arrival_lng",-56.191)))))
  store.cache("presence-$u",JSONObject().put("rows",JSONArray(listOf(
   JSONObject().put("driver_id","muestra-d1").put("driver_name","Diego Rodríguez").put("app_version","0.22.0").put("seen_at",now.minusSeconds(60).toString()),
   JSONObject().put("driver_id","muestra-d3").put("driver_name","Martín Pereira").put("app_version","0.22.0").put("seen_at",now.minusSeconds(240).toString()).put("latitude",-33.233).put("longitude",-54.383).put("located_at",now.minusSeconds(240).toString()),
   JSONObject().put("driver_id","muestra-d2").put("driver_name","Sofía Martínez").put("app_version","0.21.0").put("seen_at",hours(3))))))
  // The month by truck and by driver: trips, GPS km, with and without cargo, billable km, kilos, billed, unbilled, litres and fuel.
  fun row(n:String,v:List<Number>)=JSONObject().put("name",n).put("trips",v[0]).put("gps_km",v[1]).put("loaded_km",v[2]).put("empty_km",v[3]).put("billable_km",v[4]).put("kg",v[5]).put("billed_uyu",v[6]).put("billed_usd",0).put("unbilled",v[7]).put("liters",v[8]).put("fuel_uyu",v[9]).put("fuel_usd",0)
  val month=listOf(listOf(14,3420.0,2180.0,1240.0,2050.0,382000.0,486000.0,1,1160.0,73200.0),listOf(11,2890.0,1920.0,970.0,1800.0,301000.0,402500.0,0,980.0,61900.0),listOf(8,1960.0,1210.0,750.0,1150.0,198000.0,255000.0,2,690.0,43500.0))
  val total=(0 until 10).map{k->month.sumOf{it[k].toDouble()}}
  fun summary(names:List<String>)=JSONObject().put("rows",JSONArray(names.indices.map{row(names[it],month[it])})).put("total",row("Toda la flota",total.mapIndexed{k,v->if(k==0||k==7)v.toInt() else v}))
  store.cache("performance-$u-${YearMonth.now()}",JSONObject().put("trucks",summary(listOf(label(0),label(2),label(3)))).put("drivers",summary(listOf("Martín Pereira","Diego Rodríguez","Sofía Martínez"))).put("fetched_at",now.toEpochMilli()))
 }
 /** A trip in progress for an hour and a half, going at 78 km/h, with the route so far for the map. */
 private fun sampleTrip(){
  val now=Instant.now();val t=store.start(Api.sample!!.getJSONObject("user"),name,"Ford Cargo 1722 · ATP 2231",false,JSONObject().put("destino","Puerto de Montevideo").put("cliente","Cooperativa del Este").put("tipoCarga","Arroz").put("kg","28500"))
  store.update(false){it.put("started_at",now.minusSeconds(83*60L).toString()).put("distance_meters",86400.0).put("speed_kmh",78.0).put("last_point",JSONObject().put("recorded_at",now.toString()).put("latitude",-33.62).put("longitude",-55.31))}
  for(i in 0..20)store.appendTrack(t.getString("id"),-33.233-i*0.019,-54.383-i*0.044,0,now.toEpochMilli()-(20-i)*240_000L)
 }

 // ---------- Games: for the waits, with the truck stopped (decision of 21/10/2026). Nothing of them leaves the phone ----------
 private fun gamesTest()=(applicationInfo.flags and android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE)!=0&&intent?.getBooleanExtra("trf_test_games",false)==true
 private fun chessKey()="chess-${uid()}"
 private fun savedMatch()=ChessMatch.load(prefs().getString(chessKey(),null))
 private fun saveMatch(m:ChessMatch)=prefs().edit().putString(chessKey(),m.save()).apply()
 /** Whether the truck is stopped: from the trip in progress and its latest GPS reading. */
 private fun parkedState():Parked.State{val t=store.current();val p=t?.optJSONObject("last_point")
  return Parked.state(t?.optBoolean("active")==true,t?.optBoolean("paused")==true,instant(p?.optString("recorded_at"))?.toEpochMilli(),p?.takeUnless{it.isNull("speed_kmh")}?.optDouble("speed_kmh"),System.currentTimeMillis())}
 private fun parkedText(s:Parked.State)=if(s==Parked.State.MOVING)"El camión está en movimiento. Los juegos son para cuando está parado." else "El GPS no muestra el camión parado. Para jugar durante el viaje, pausalo."
 /** Every few seconds on a game screen: when the truck moves, the game (saved after every move) closes. */
 private fun gamesCheck(){
  val now=SystemClock.elapsedRealtime();if(now-gamesCheckAt<Parked.CHECK_MS)return;gamesCheckAt=now
  val s=parkedState()
  if(screen=="games"){if(s.allowed!=gamesAllowed)games();return}
  if(s.allowed)return
  val playing=screen=="chess"||screen=="truco";match?.takeIf{screen=="chess"}?.let{saveMatch(it)};trucoMatch?.takeIf{screen=="truco"}?.let{saveTruco(it)}
  homeOrTrip();toast(if(playing)"La partida quedó guardada. Seguila con el camión parado." else parkedText(s))
 }
 private fun games(){
  page("games");bar("Juegos",back={homeOrTrip()})
  val s=parkedState();gamesAllowed=s.allowed;gamesCheckAt=SystemClock.elapsedRealtime()
  if(!s.allowed){
   val w=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;background=outline(amberBg,glassLine,20);setPadding(dp(16),dp(14),dp(16),dp(14))}
   w.addView(iconView(R.drawable.ic_warning,amber,26))
   val wc=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,0,0)}
   wc.addView(tv("Primero, el camión parado",16f,ink,1));wc.addView(tv(parkedText(s),14f,inkSoft).apply{setPadding(0,dp(2),0,0)})
   w.addView(wc,LinearLayout.LayoutParams(0,-2,1f));root.addView(w,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(14)})
  }
  val saved=savedMatch()?.takeIf{it.playing};val cards=savedTruco()?.takeIf{it.winner<0}
  menuList(listOf(Shortcut(R.drawable.ic_chess,0xFFBE3A6E.toInt(),"Ajedrez",if(saved!=null)"Seguí tu partida · jugada ${saved.game.position.fullmove}" else "Contra el teléfono o entre dos"){openChess()},
   Shortcut(R.drawable.ic_cards,0xFF178A6A.toInt(),"Truco",if(cards!=null)"Seguí tu partida · ${cards.score[0]} a ${cards.score[1]}" else "Contra el teléfono, con flor y a 30"){openTruco()}))
  note("Para las esperas: los juegos se abren sin viaje, con el viaje pausado o con el camión detenido. Si el camión arranca, la partida se guarda y se cierra. Las partidas quedan solo en este teléfono.",top=14)
 }
 private fun openChess(){val s=parkedState();if(!s.allowed){toast(parkedText(s));return};if(savedMatch()?.playing==true)chess() else newChess()}
 /** A new game, with the options chosen the last time. */
 private fun newChess(){
  val p=prefs().getString("chess-setup-${uid()}",null)?.split('|')
  newVsPhone=p?.getOrNull(0)!="two";newLevel=ChessAi.Level.entries.firstOrNull{it.name==p?.getOrNull(1)}?:ChessAi.Level.EASY;newSide=p?.getOrNull(2)?.toIntOrNull()?.coerceIn(0,2)?:0
  chessNew()
 }
 private fun chessNew(){
  val s=parkedState();if(!s.allowed){toast(parkedText(s));games();return}
  page("chessnew");bar("Partida nueva",back={games()});gamesCheckAt=SystemClock.elapsedRealtime()
  caption(root,"Rival",top=16)
  radio(root,"Contra el teléfono",newVsPhone){newVsPhone=true;chessNew()}
  radio(root,"Entre dos, en este teléfono",!newVsPhone){newVsPhone=false;chessNew()}
  if(newVsPhone){
   caption(root,"Nivel",top=22);segmented(root,listOf("Fácil","Medio","Difícil"),newLevel.ordinal,top=8){newLevel=ChessAi.Level.entries[it];chessNew()}
   note(when(newLevel){ChessAi.Level.EASY->"Fácil: a veces se distrae y deja piezas sin cuidar.";ChessAi.Level.MEDIUM->"Medio: cuida sus piezas y aprovecha las que dejás sueltas.";ChessAi.Level.HARD->"Difícil: piensa unos segundos cada jugada."},top=8)
   caption(root,"Tus piezas",top=22);segmented(root,listOf("Blancas","Negras","Al azar"),newSide,top=8){newSide=it;chessNew()}
  }else note("Se juega pasando el teléfono. Con el botón de girar, cada uno ve el tablero desde su lado.",top=14)
  dock.visibility=View.VISIBLE
  button(dock,"Empezar",Kind.PRIMARY,R.drawable.ic_play,top=0){startChess()}
 }
 private fun startChess(){
  prefs().edit().putString("chess-setup-${uid()}","${if(newVsPhone)"phone" else "two"}|${newLevel.name}|$newSide").apply()
  val white=!newVsPhone||when(newSide){0->true;1->false;else->kotlin.random.Random.nextBoolean()}
  saveMatch(ChessMatch(newVsPhone,newLevel,white,Chess.Game()));chessSel=-1;chess()
 }
 private fun levelName(l:ChessAi.Level)=when(l){ChessAi.Level.EASY->"fácil";ChessAi.Level.MEDIUM->"medio";ChessAi.Level.HARD->"difícil"}
 // The black dot gets a light edge in dark mode, or it disappears into the background.
 private fun sideDot(white:Boolean)=GradientDrawable().apply{shape=GradientDrawable.OVAL;setColor(if(white)Color.WHITE else 0xFF2B303A.toInt());setStroke(dp(1),if(dark&&!white)muted else 0xFF1B1F27.toInt());setSize(dp(14),dp(14))}
 private fun chess(){
  val s=parkedState();if(!s.allowed){toast(parkedText(s));homeOrTrip();return}
  val m=savedMatch()?:return newChess()
  page("chess");chessJob++;thinking=false;match=m;gamesCheckAt=SystemClock.elapsedRealtime()
  bar("Ajedrez",back={games()},trailing=barButton(R.drawable.ic_flip,"Girar el tablero"){m.flipped=!m.flipped;saveMatch(m);chessViews()})
  fun player(p:LinearLayout,top:Int)=tv("",15f,ink,1).apply{gravity=Gravity.CENTER_VERTICAL;compoundDrawablePadding=dp(9);minHeight=dp(34);p.addView(this,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(top)})}
  val b=ChessBoard(this,dark);board=b;b.onSquare={tapSquare(it)}
  // The board as big as the screen leaves for it, so nothing has to scroll: upright, between the names and above the
  // buttons; turned, at the left of the names and the buttons.
  val w=resources.displayMetrics.widthPixels;val h=resources.displayMetrics.heightPixels
  if(resources.configuration.orientation==Configuration.ORIENTATION_LANDSCAPE){
   val size=minOf(h-dp(170),w/2).coerceAtLeast(dp(200))
   val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};root.addView(r,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(10)})
   r.addView(b,LinearLayout.LayoutParams(size,size))
   val side=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(18),0,0,0)};r.addView(side,LinearLayout.LayoutParams(0,-2,1f))
   chessTop=player(side,0);chessStatus=text(side,"",17f,ink,1,14);chessBottom=player(side,14)
   undoButton=button(side,"Deshacer",Kind.LINE,R.drawable.ic_undo,top=18){undoChess()}
   button(side,"Partida nueva",Kind.LINE,R.drawable.ic_plus,top=10){askNewChess()}
  }else{
   val size=minOf(w-dp(28),h-dp(350)).coerceAtLeast(dp(200))
   chessTop=player(root,8)
   root.addView(b,LinearLayout.LayoutParams(size,size).apply{gravity=Gravity.CENTER_HORIZONTAL;topMargin=dp(4)})
   chessBottom=player(root,4)
   chessStatus=text(root,"",17f,ink,1,10).apply{gravity=Gravity.CENTER}
   dock.visibility=View.VISIBLE
   val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};dock.addView(r,LinearLayout.LayoutParams(-1,-2))
   undoButton=button(r,"Deshacer",Kind.LINE,R.drawable.ic_undo,top=0){undoChess()}.also{it.view.layoutParams=LinearLayout.LayoutParams(0,dp(54),1f)}
   button(r,"Partida nueva",Kind.LINE,R.drawable.ic_plus,top=0){askNewChess()}.view.layoutParams=LinearLayout.LayoutParams(0,dp(54),1f).apply{marginStart=dp(10)}
  }
  chessViews();phoneTurn()
 }
 /** The board, the players and the line under them, after a move, an undo or a turn of the board. */
 private fun chessViews(){
  val m=match?:return;val b=board?:return;val g=m.game;val p=g.position
  b.position=p;b.lastMove=g.lastMove;b.flipped=m.flipped;b.selected=chessSel
  b.targets=if(chessSel>=0)p.legal.filter{it.from==chessSel}.map{it.to}.toSet() else emptySet()
  fun who(white:Boolean)=if(m.vsPhone)(if(white==m.humanWhite)"Vos" else "Teléfono · nivel ${levelName(m.level)}") else if(white)"Blancas" else "Negras"
  // Each name goes on its side of the board; the one who moves, in dark.
  for((v,white) in listOf(chessTop to m.flipped,chessBottom to !m.flipped))v?.apply{text=who(white);setTextColor(if(m.playing&&p.whiteToMove==white)ink else muted);setCompoundDrawablesRelativeWithIntrinsicBounds(sideDot(white),null,null,null)}
  val line=chessLine(m);chessStatus?.apply{text=line;setTextColor(if(m.playing&&p.inCheck)red else ink)}
  undoButton?.enable(m.canUndo&&!thinking)
  b.isEnabled=m.playing&&!m.phoneToMove;b.contentDescription="Tablero de ajedrez. Jugada ${p.fullmove}. $line"
 }
 private fun chessLine(m:ChessMatch):String{val g=m.game;val p=g.position
  return when(g.outcome){
   Chess.Outcome.PLAYING->when{
    m.phoneToMove->"El teléfono está pensando…"
    m.vsPhone->if(p.inCheck)"Jaque. Te toca mover." else "Te toca mover."
    else->(if(p.whiteToMove)"Mueven las blancas" else "Mueven las negras")+if(p.inCheck)" · Jaque" else ""}
   Chess.Outcome.WHITE_MATES,Chess.Outcome.BLACK_MATES->{val whiteWon=g.outcome==Chess.Outcome.WHITE_MATES
    if(!m.vsPhone)"Jaque mate. Ganan las ${if(whiteWon)"blancas" else "negras"}." else if(whiteWon==m.humanWhite)"¡Jaque mate! Ganaste." else "Jaque mate. Ganó el teléfono."}
   Chess.Outcome.STALEMATE->"Tablas: el rey quedó ahogado."
   Chess.Outcome.MATERIAL->"Tablas: no queda material para dar mate."
   Chess.Outcome.FIFTY_MOVES->"Tablas: 50 jugadas sin capturas ni movimientos de peón."
   Chess.Outcome.REPETITION->"Tablas: la misma posición se repitió tres veces."
  }
 }
 /** A tap picks a piece of the side to move, plays it where it can go, or lets it go. */
 private fun tapSquare(sq:Int){
  val m=match?:return;if(!m.playing||m.phoneToMove||thinking)return
  val p=m.game.position
  if(chessSel>=0){val moves=p.legal.filter{it.from==chessSel&&it.to==sq}
   if(moves.size>1){askPromotion(moves);return};if(moves.size==1){playChess(moves[0]);return}}
  val piece=p[sq];chessSel=if(piece!=0&&(piece>0)==p.whiteToMove&&sq!=chessSel)sq else -1
  chessViews()
 }
 private fun askPromotion(moves:List<Chess.Move>){
  val kinds=listOf(Chess.QUEEN to "Dama",Chess.ROOK to "Torre",Chess.BISHOP to "Alfil",Chess.KNIGHT to "Caballo")
  pick("¿En qué se convierte el peón?",kinds.map{it.second}){i->moves.firstOrNull{it.promo==kinds[i].first}?.let{playChess(it)}}
 }
 private fun playChess(move:Chess.Move){val m=match?:return;if(screen!="chess"||!m.game.play(move))return;chessSel=-1;saveMatch(m);chessViews();phoneTurn()}
 /** The phone's answer, worked out on another thread; dropped if the board closed or the game changed meanwhile. */
 private fun phoneTurn(){
  val m=match?:return;if(!m.phoneToMove||thinking||screen!="chess")return
  thinking=true;val job=chessJob;val position=m.game.position;val level=m.level;val seen=m.game.seen();val started=SystemClock.elapsedRealtime()
  chessViews()
  thread{val move=try{ChessAi.choose(position,level,seen=seen)}catch(_:Exception){position.moves().randomOrNull()}
   // An answer that comes at once looks like no thought at all.
   handler.postDelayed({if(job==chessJob&&match===m){thinking=false;if(move!=null&&m.game.play(move))saveMatch(m);chessViews()}},(450-(SystemClock.elapsedRealtime()-started)).coerceAtLeast(0))}
 }
 private fun undoChess(){val m=match?:return;if(thinking||!m.undo())return;chessSel=-1;saveMatch(m);chessViews()}
 private fun askNewChess(){val m=match
  if(m==null||!m.playing||!m.canUndo){newChess();return}
  AlertDialog.Builder(this).setTitle("¿Empezar otra partida?").setMessage("La partida en curso se va a perder.").setNegativeButton("Seguir jugando",null).setPositiveButton("Empezar otra"){_,_->newChess()}.show()
 }

 // ---------- Truco: against the phone, with flor and contraflor, to 30 (decisions of 21 and 22/10/2026) ----------
 /** The views of the table that change with each action. Lists by player: 0 the person, 1 the phone. */
 private class TrucoViews(val names:List<TextView>,val scores:List<TextView>,val tallies:List<TrucoTally>,val said:List<TextView>,val backs:List<TrucoCard>,
  val muestra:TrucoCard,val table:List<List<TrucoCard>>,val rounds:List<TextView>,val status:TextView,val news:TextView,val hint:TextView,val hand:List<TrucoCard>,val calls:LinearLayout)
 private fun trucoKey()="truco-${uid()}"
 private fun savedTruco()=Truco.Match.load(prefs().getString(trucoKey(),null))
 private fun saveTruco(m:Truco.Match)=prefs().edit().putString(trucoKey(),m.save()).apply()
 /** The game in progress, or a new one when there is none or the last one ended. */
 private fun openTruco(){val s=parkedState();if(!s.allowed){toast(parkedText(s));return};if(savedTruco()?.winner==-1)truco() else newTruco()}
 private fun newTruco(){saveTruco(Truco.Match().also{it.deal()});truco()}
 private fun truco(){
  val s=parkedState();if(!s.allowed){toast(parkedText(s));homeOrTrip();return}
  val m=savedTruco()?:return newTruco()
  page("truco");trucoJob++;trucoThinking=false;trucoMatch=m;trucoPick=null;gamesCheckAt=SystemClock.elapsedRealtime()
  bar("Truco",back={games()},trailing=barButton(R.drawable.ic_plus,"Partida nueva"){askNewTruco()})
  // The cards as big as the screen leaves, so a hand is played without scrolling: upright, the table above the hand and
  // the calls at the bottom; turned, the table and the hand side by side, with the score and the calls at the right.
  val w=resources.displayMetrics.widthPixels;val h=resources.displayMetrics.heightPixels
  val turned=resources.configuration.orientation==Configuration.ORIENTATION_LANDSCAPE
  // What does not grow with the cards takes about 555 dp upright (bars, dock, score, labels, texts) and 195 turned in
  // height, and 430 turned in width (the right column, margins); the rules link may stay below, to scroll to.
  val small:Int;val big:Int
  if(turned){small=minOf(((h-dp(195))/3.9f).toInt(),((w-dp(430))/8.2f).toInt(),dp(64)).coerceAtLeast(dp(36));big=minOf((small*1.4f).toInt(),dp(96))}
  else{big=minOf((w-dp(48))/3,dp(96),((h-dp(555))/3.68f).toInt()).coerceAtLeast(dp(56));small=maxOf((big*0.56f).toInt(),dp(36))}
  fun row(p:LinearLayout,top:Int)=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;p.addView(this,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(top)})}
  // What a player sang or answered last, until they play a card.
  fun bubble(p:LinearLayout)=pill("",amber,amberBg).apply{visibility=View.INVISIBLE;(layoutParams as LinearLayout.LayoutParams).marginStart=dp(10);p.addView(this)}
  // Each one's points in words and in matches, the way they are kept at the table.
  // In the narrow column of the turned screen, the name goes above the points.
  fun scoreBoard(p:LinearLayout,top:Int,stacked:Boolean=false):Pair<List<TextView>,List<TrucoTally>>{
   val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;setPadding(dp(14),dp(9),dp(14),dp(10))};card(p,top=top).addView(r)
   val scores=ArrayList<TextView>();val tallies=ArrayList<TrucoTally>()
   for(i in 0..1){val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};r.addView(col,LinearLayout.LayoutParams(0,-2,1f).apply{if(i==1)marginStart=dp(18)})
    val words=LinearLayout(this).apply{orientation=if(stacked)LinearLayout.VERTICAL else LinearLayout.HORIZONTAL;gravity=if(stacked)Gravity.START else Gravity.BOTTOM};col.addView(words)
    words.addView(tv(if(i==0)"Vos" else "Teléfono",13f,muted,1).apply{if(!stacked)setPadding(0,0,dp(8),dp(1))});scores.add(tv("",16f,ink,2).also{words.addView(it)})
    tallies.add(TrucoTally(this,ink,fieldLine).also{col.addView(it,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(6)})})}
   return scores to tallies
  }
  fun phoneRow(p:LinearLayout,top:Int):Triple<TextView,TextView,List<TrucoCard>>{
   val r=row(p,top);val name=tv("",15f,ink,1);r.addView(name);val said=bubble(r);r.addView(View(this),LinearLayout.LayoutParams(0,1,1f))
   val backs=(0..2).map{i->TrucoCard(this,dark).also{r.addView(it,LinearLayout.LayoutParams(maxOf((small*0.6f).toInt(),dp(26)),-2).apply{if(i>0)marginStart=dp(5)})}}
   return Triple(name,said,backs)
  }
  // The muestra, and each round with the phone's card above the person's and who won it below.
  fun table(p:LinearLayout,top:Int):Triple<TrucoCard,List<List<TrucoCard>>,List<TextView>>{
   val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER;setPadding(dp(10),dp(10),dp(10),dp(8))};card(p,top=top).addView(r,LinearLayout.LayoutParams(-1,-2))
   // The label wraps its text, so that a column is as wide as «Muestra» when the cards are narrower.
   fun column(label:String,start:Int)=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL;addView(tv(label,12.5f,muted,1),LinearLayout.LayoutParams(-2,-2));r.addView(this,LinearLayout.LayoutParams(-2,-2).apply{marginStart=start})}
   val muestra=TrucoCard(this,dark).also{column("Muestra",0).addView(it,LinearLayout.LayoutParams(small,-2).apply{topMargin=dp(4)})}
   val slots=List(2){ArrayList<TrucoCard>()};val won=ArrayList<TextView>()
   for(i in 0..2){val col=column(listOf("1ª","2ª","3ª")[i],dp(if(i==0)18 else 8))
    for(pl in listOf(1,0))TrucoCard(this,dark).also{col.addView(it,LinearLayout.LayoutParams(small,-2).apply{topMargin=dp(4)});slots[pl].add(it)}
    won.add(tv("",12f,muted,1).apply{gravity=Gravity.CENTER;maxLines=1;ellipsize=TextUtils.TruncateAt.END;col.addView(this,LinearLayout.LayoutParams(small,-2).apply{topMargin=dp(3)})})}
   return Triple(muestra,slots,won)
  }
  fun mine(p:LinearLayout,top:Int):Triple<TextView,TextView,TextView>{
   val r=row(p,top);val name=tv("",15f,ink,1);r.addView(name);val said=bubble(r)
   return Triple(name,said,text(p,"",13.5f,muted,0,2))
  }
  fun hand(p:LinearLayout,top:Int):List<TrucoCard>{
   // Room above the cards for the chosen one, which rises; the row keeps its height when no card is left.
   val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_HORIZONTAL;clipToPadding=false;clipChildren=false;setPadding(0,dp(12),0,0);minimumHeight=Math.round(big*1.5f)+dp(12)}
   p.addView(r,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(top)})
   return (0..2).map{i->TrucoCard(this,dark).also{c->r.addView(c,LinearLayout.LayoutParams(big,-2).apply{if(i>0)marginStart=dp(10)});c.setOnClickListener{tapTruco(i)}}}
  }
  fun status(p:LinearLayout,top:Int)=text(p,"",16.5f,ink,1,top).apply{gravity=Gravity.CENTER}
  fun news(p:LinearLayout)=text(p,"",13.5f,muted,0,4).apply{gravity=Gravity.CENTER;minLines=2;maxLines=2;ellipsize=TextUtils.TruncateAt.END}
  val calls=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;minimumHeight=dp(104)}
  trucoUi=if(turned){
   val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};root.addView(r,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(6)})
   val main=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};r.addView(main,LinearLayout.LayoutParams(0,-2,1f))
   val side=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(16),0,0,0)};r.addView(side,LinearLayout.LayoutParams(dp(290),-2))
   val (phoneName,phoneSaid,backs)=phoneRow(main,0)
   val tr=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};main.addView(tr,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(2)})
   val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};tr.addView(box,LinearLayout.LayoutParams(-2,-2))
   val (muestra,slots,won)=table(box,6)
   val me=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(16),0,0,0)};tr.addView(me,LinearLayout.LayoutParams(0,-2,1f))
   val (myName,mySaid,hint)=mine(me,8);val cards=hand(me,0)
   val (scores,tallies)=scoreBoard(side,0,stacked=true);val st=status(side,12);val nw=news(side)
   side.addView(calls,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(10)});link(side,"Reglas de esta mesa",top=4){trucoRules()}
   TrucoViews(listOf(myName,phoneName),scores,tallies,listOf(mySaid,phoneSaid),backs,muestra,slots,won,st,nw,hint,cards,calls)
  }else{
   val (scores,tallies)=scoreBoard(root,6)
   val (phoneName,phoneSaid,backs)=phoneRow(root,12)
   val (muestra,slots,won)=table(root,8)
   val st=status(root,12);val nw=news(root)
   val (myName,mySaid,hint)=mine(root,8);val cards=hand(root,0)
   link(root,"Reglas de esta mesa",top=8){trucoRules()}
   dock.visibility=View.VISIBLE;dock.addView(calls,LinearLayout.LayoutParams(-1,-2))
   TrucoViews(listOf(myName,phoneName),scores,tallies,listOf(mySaid,phoneSaid),backs,muestra,slots,won,st,nw,hint,cards,calls)
  }
  trucoViews();phoneTruco()
 }
 /** The table after each action: the score, what each one said, the cards and the rounds, what to do, and the calls. */
 private fun trucoViews(){
  val m=trucoMatch?:return;val v=trucoUi?:return;val h=m.hand;val mu=h.muestra
  for(p in 0..1){
   v.scores[p].text=TrucoTalk.score(m.score[p]);v.tallies[p].points=m.score[p]
   v.tallies[p].contentDescription="${if(p==0)"Vos" else "El teléfono"}: ${m.score[p]} de 30, ${TrucoTalk.score(m.score[p])}"
   v.names[p].text=(if(p==0)"Vos" else "Teléfono")+if(h.mano==p)" · mano" else ""
   val said=TrucoTalk.lastSaid(h,p);v.said[p].text=said?:"";v.said[p].visibility=if(said!=null)View.VISIBLE else View.INVISIBLE
  }
  // The phone's cards face down; face up once the hand is over.
  v.backs.forEachIndexed{i,c->val card=h.cards[1].getOrNull(i)
   c.visibility=if(card!=null)View.VISIBLE else View.INVISIBLE;c.card=card;c.faceUp=h.over;c.pieza=h.over&&card!=null&&mu.isPieza(card)
   c.contentDescription=card?.let{if(h.over)"El teléfono tenía el "+TrucoTalk.cardName(it) else "Carta del teléfono"}}
  v.muestra.card=mu.card;v.muestra.contentDescription="Muestra: ${TrucoTalk.cardName(mu.card)}"
  for(r in 0..2){val round=h.rounds.getOrNull(r);val won=h.roundWinners.getOrNull(r)
   for(p in 0..1){val c=v.table[p][r];val card=round?.get(p);c.card=card;c.pieza=card!=null&&mu.isPieza(card)
    c.contentDescription=card?.let{"${listOf("Primera","Segunda","Tercera")[r]} ronda, ${if(p==0)"vos" else "el teléfono"}: ${TrucoTalk.cardName(it)}"}}
   v.rounds[r].text=when(won){null->"";-1->"Parda";0->"Vos";else->"Teléfono"};v.rounds[r].setTextColor(when(won){0->green;1->red;else->muted})
  }
  v.status.text=TrucoTalk.status(m);v.status.setTextColor(if(h.actor==1)inkSoft else ink)
  v.news.text=TrucoTalk.news(h).takeLast(2).joinToString("\n")
  val playable=h.actions(0).filterIsInstance<Truco.Action.Play>().map{it.card}
  // Cards dimmed while a call waits for the person's answer.
  val answering=h.actor==0&&playable.isEmpty()
  v.hint.text=if(trucoPick!=null)"Tocá otra vez la carta para jugarla." else TrucoTalk.tantos(mu,h.dealt[0])
  // The cards left are always the first places (the list closes up), so hiding the rest keeps them in the middle.
  v.hand.forEachIndexed{i,c->val card=h.cards[0].getOrNull(i)
   c.visibility=if(card!=null)View.VISIBLE else View.GONE;c.card=card;c.pieza=card!=null&&mu.isPieza(card)
   c.picked=card!=null&&card==trucoPick;c.translationY=if(c.picked)-dpf(10f) else 0f;c.alpha=if(answering)0.55f else 1f
   c.isClickable=card!=null&&card in playable
   c.contentDescription=card?.let{TrucoTalk.cardName(it)+(if(c.pieza)", pieza" else "")+when{it !in playable->"";c.picked->". Tocá otra vez para jugarla.";else->". Tocá para elegirla."}}}
  trucoCalls(v.calls,m)
 }
 /** What the person can sing or answer, three to a row; when the hand is over, the next hand or a new game. */
 private fun trucoCalls(c:LinearLayout,m:Truco.Match){
  c.removeAllViews();val h=m.hand
  if(m.winner>=0){button(c,"Partida nueva",Kind.PRIMARY,R.drawable.ic_plus,top=0){newTruco()};return}
  if(h.over){button(c,"Siguiente mano",Kind.PRIMARY,R.drawable.ic_play,top=0){nextTruco()};return}
  val options=h.actions(0).filter{it !is Truco.Action.Play}.sortedBy{callOrder(it)}
  options.chunked(3).forEachIndexed{i,group->
   val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};c.addView(r,LinearLayout.LayoutParams(-1,-2).apply{if(i>0)topMargin=dp(8)})
   group.forEachIndexed{j,a->callButton(r,a,j==0)}
   // A short row keeps its buttons a third wide.
   repeat(3-group.size){r.addView(View(this),LinearLayout.LayoutParams(0,1,1f).apply{marginStart=dp(8)})}
  }
 }
 private fun callOrder(a:Truco.Action)=when(a){
  is Truco.Action.Sing->when(a.call){Truco.Call.FLOR->0;Truco.Call.CONTRAFLOR->3;Truco.Call.CONTRAFLOR_AL_RESTO->4;Truco.Call.RETRUCO,Truco.Call.VALE_CUATRO->6
   Truco.Call.ENVIDO->7;Truco.Call.REAL_ENVIDO->8;Truco.Call.FALTA_ENVIDO->9;Truco.Call.TRUCO->10}
  Truco.Action.Quiero->1;Truco.Action.NoQuiero->2;Truco.Action.Achico->5;Truco.Action.Mazo->11;is Truco.Action.Play->12
 }
 private fun callButton(p:LinearLayout,a:Truco.Action,first:Boolean){
  val label=when(a){is Truco.Action.Sing->a.call.text;Truco.Action.Quiero->"Quiero";Truco.Action.NoQuiero->"No quiero";Truco.Action.Achico->"Me achico";Truco.Action.Mazo->"Ir al mazo";is Truco.Action.Play->TrucoTalk.cardName(a.card)}
  val kind=when(a){Truco.Action.Quiero->Kind.PRIMARY;Truco.Action.Mazo->Kind.LINE_DANGER;Truco.Action.NoQuiero,Truco.Action.Achico->Kind.LINE;else->if(a==Truco.Action.Sing(Truco.Call.FLOR))Kind.GO else Kind.SOFT}
  val (look,fg,solid)=buttonLook(kind)
  val v=tv(label,14.5f,fg,1).apply{gravity=Gravity.CENTER;maxLines=2;background=look;isClickable=true;isFocusable=true;contentDescription=label;setPadding(dp(6),0,dp(6),0);if(solid)glow(this,fillOf(kind),2f);sink(this,.95f)
   setOnClickListener{if(a==Truco.Action.Mazo)askMazo() else trucoAct(a)}}
  p.addView(v,LinearLayout.LayoutParams(0,dp(48),1f).apply{if(!first)marginStart=dp(8)})
 }
 /** A tap chooses one of the person's cards; a second tap plays it. */
 private fun tapTruco(i:Int){
  val m=trucoMatch?:return;val card=m.hand.cards[0].getOrNull(i)?:return
  if(trucoThinking||Truco.Action.Play(card) !in m.hand.actions(0))return
  if(trucoPick==card)trucoAct(Truco.Action.Play(card)) else {trucoPick=card;trucoViews()}
 }
 private fun trucoAct(a:Truco.Action){
  val m=trucoMatch?:return
  if(screen!="truco"||trucoThinking||!m.hand.act(0,a))return
  trucoPick=null;saveTruco(m);trucoViews();phoneTruco()
 }
 /** The phone acts after a moment, so the person sees each step; dropped if the table closed or the game changed. */
 private fun phoneTruco(){
  val m=trucoMatch?:return;val h=m.hand
  if(h.over||h.actor!=1||trucoThinking||screen!="truco")return
  trucoThinking=true;val job=trucoJob
  handler.postDelayed({if(job==trucoJob&&trucoMatch===m&&m.hand===h){trucoThinking=false
   val a=try{TrucoAi.act(h,1)}catch(_:Exception){null}
   if(a==null||!h.act(1,a))h.actions(1).firstOrNull()?.let{h.act(1,it)}
   saveTruco(m);trucoViews();phoneTruco()}},850)
 }
 private fun nextTruco(){val m=trucoMatch?:return;if(trucoThinking||!m.next())return;trucoPick=null;saveTruco(m);trucoViews();phoneTruco()}
 private fun askMazo(){val n=trucoMatch?.hand?.stake?:return
  AlertDialog.Builder(this).setTitle("¿Te vas al mazo?").setMessage("El teléfono se lleva ${if(n==1)"1 punto" else "$n puntos"} de esta mano.").setNegativeButton("Seguir jugando",null).setPositiveButton("Irme al mazo"){_,_->trucoAct(Truco.Action.Mazo)}.show()
 }
 private fun askNewTruco(){val m=trucoMatch
  if(m==null||m.winner>=0||m.score.all{it==0}&&m.hand.log.isEmpty()){newTruco();return}
  AlertDialog.Builder(this).setTitle("¿Empezar otra partida?").setMessage("La partida en curso se va a perder.").setNegativeButton("Seguir jugando",null).setPositiveButton("Empezar otra"){_,_->newTruco()}.show()
 }
 private fun trucoRules(){AlertDialog.Builder(this).setTitle("Reglas de esta mesa").setMessage(TrucoTalk.RULES).setPositiveButton("Entendido",null).show()}

 // ---------- Account ----------
 private fun settings(){
  page("settings");bar("Mi cuenta")
  val email=api.session()?.optJSONObject("user")?.optString("email")?:""
  val pc=card();val pr=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(16),dp(16),dp(16),dp(16))}
  pr.addView(tv(initials(name),17f,Color.WHITE,1).apply{gravity=Gravity.CENTER;background=featured()},LinearLayout.LayoutParams(dp(52),dp(52)))
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,0,0)}
  col.addView(tv(name,18f,ink,1));col.addView(tv(email,14f,muted).apply{setPadding(0,dp(2),0,0)})
  col.addView(pill(when{panelFirst()->"Dueño · panel de flota";isOwner()->"Dueño y chofer";else->"Chofer"},blue,blueSoft).apply{(layoutParams as LinearLayout.LayoutParams).topMargin=dp(8)})
  pr.addView(col,LinearLayout.LayoutParams(0,-2,1f));pc.addView(pr)
  if(!panelFirst()){section("Modo de uso");val mc=card(pad=16)
   segmented(mc,listOf("Sencillo","Normal"),if(mode()==UiMode.SIMPLE)0 else 1,top=0){setMode(if(it==0)UiMode.SIMPLE else UiMode.NORMAL);toast(if(it==0)"Modo sencillo activado" else "Modo normal activado");homeOrTrip()}
   note("Sencillo: solo iniciar y finalizar el viaje, con botones grandes. Normal: todas las opciones.",mc,10)}
  // Notices (decision of 28/10/2026): each kind can be turned off; the company account has no trips of its own.
  section("Avisos")
  val ac=card()
  fun toggle(icon:Int,title:String,sub:String,kind:String){
   val sw=Switch(this).apply{isChecked=Reminders.on(this@MainActivity,kind,uid());isClickable=false;isFocusable=false;importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO}
   row(ac,icon,title,sub+if(sw.isChecked)" · Activado" else " · Desactivado",trailing=sw){val on=!sw.isChecked;Reminders.set(this,kind,uid(),on);if(on&&!Reminders.allowed(this))askNotify();settings()}
  }
  toggle(R.drawable.ic_doc,"Papeles y services","A las 8:00, lo que vence en 30 días o ya venció",Reminders.PAPERS)
  if(!panelFirst()){toggle(R.drawable.ic_flag,"Viaje abierto","A las 14 horas en curso, o con 2 horas detenido sin pausar",Reminders.TRIP)
   toggle(R.drawable.ic_fuel,"Boleta al finalizar","Si el viaje no tiene boletas cargadas",Reminders.RECEIPT)}
  if(!Reminders.allowed(this)){note("Las notificaciones de la app están apagadas en el teléfono: los avisos no llegan.",top=8);link(root,"Activar las notificaciones",top=2){askNotify()}}
  section("Sincronización")
  val sc=card(pad=16);sync=text(sc,store.message(),15f,ink);note("Los viajes, boletas y remitos se guardan en el teléfono y se envían solos cuando hay conexión.",sc,6)
  button(sc,"Enviar pendientes y actualizar",Kind.SOFT,R.drawable.ic_sync){syncNow()}
  section("GPS y privacidad")
  val gc=card();row(gc,R.drawable.ic_gps,"Revisar GPS","Permisos de ubicación y batería"){checkGps()}
  if(!panelFirst()){val on=prefs().getBoolean(presenceKey(),false)
   row(gc,R.drawable.ic_pin,"Ubicación con la app abierta",if(on)"Activada: al abrirla y cada 5 minutos, sin viaje · Tocá para desactivarla" else "Desactivada: solo se avisa que estás activo · Tocá para activarla"){
    if(on){prefs().edit().putBoolean(presenceKey(),false).apply();toast("Listo: con la app abierta ya no se envía tu ubicación.");settings()} else presencePositionDialog{settings()}}}
  row(gc,R.drawable.ic_shield,"Privacidad","Qué datos usa la app y para qué"){privacy()}
  section("Camiones y papeles")
  val pp=card();row(pp,R.drawable.ic_wrench,"Mantenimiento","Services hechos y pendientes"){maintenance(true)};row(pp,R.drawable.ic_doc,"Documentos","Licencia, carné de salud, SOA y más"){documents(true)}
  button(root,"Renovar acceso",Kind.LINE,R.drawable.ic_lock,top=24){login()}
  button(root,"Cerrar sesión",Kind.LINE_DANGER,R.drawable.ic_logout){logout()}
  note("Transportes Ferreira GPS · versión $appVersion",top=18).gravity=Gravity.CENTER
  navBar("more")
 }
 /** Asks for the notifications, or opens their page of the phone's settings when they were turned off there. */
 private fun askNotify(){
  if(Build.VERSION.SDK_INT>=33&&ContextCompat.checkSelfPermission(this,Manifest.permission.POST_NOTIFICATIONS)!=PackageManager.PERMISSION_GRANTED)notifyPermission.launch(Manifest.permission.POST_NOTIFICATIONS)
  else try{startActivity(Intent(Settings.ACTION_APP_NOTIFICATION_SETTINGS).putExtra(Settings.EXTRA_APP_PACKAGE,packageName))}catch(_:Exception){toast("Activá las notificaciones en Ajustes › Apps › Transportes Ferreira GPS")}
 }
 private fun logout(){if(active()||store.pendingCount()>0){toast("Finalizá el viaje y enviá los datos pendientes antes de cerrar sesión.");return};api.clear();presenceAt=null;login()}
 /**
  * «Chofer activo»: while the app is open (this runs with the screen tick, which stops with the app), when it opens and
  * every 5 minutes; one that could not go out is tried again in 30 seconds. The fleet-panel account is not a driver and
  * sends nothing. The position goes only if the driver accepted it (presencePositionDialog).
  */
 private fun presence(){
  val now=SystemClock.elapsedRealtime();val at=presenceAt
  if((at!=null&&now-at<Presence.EVERY_MS)||api.session()==null||panelFirst())return
  presenceAt=now
  // Asked before looking for the position and again when it arrives: no trip in progress and the consent of the account
  // that started the notice.
  val consent=presenceKey()
  Presence.send(applicationContext,name.ifBlank{driverName()},truck.ifBlank{null},appVersion,{store.current()?.optBoolean("active")!=true&&prefs().getBoolean(consent,false)}){sent->
   if(!sent)runOnUiThread{if(presenceAt==now)presenceAt=now-Presence.EVERY_MS+Presence.RETRY_MS}}
  if(!presenceAsked&&(screen=="home"||screen=="simplehome")&&!prefs().contains(presenceKey())&&locationGranted()){presenceAsked=true;presencePositionDialog{}}
 }
 private fun locationGranted()=listOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION).any{ContextCompat.checkSelfPermission(this,it)==PackageManager.PERMISSION_GRANTED}
 /**
  * Google Play asks for the use of the location to be told before it starts: drivers who gave the permission for trips
  * are asked once whether the position may also go out with the app open; Mi cuenta changes it.
  */
 private fun presencePositionDialog(then:()->Unit){
  AlertDialog.Builder(this).setTitle("Ubicación con la app abierta")
   .setMessage("Cuando tenés la app abierta y no estás de viaje, la app puede avisarle a la administración de Transportes Ferreira dónde estás: al abrirla y cada 5 minutos mientras está abierta. Con la app cerrada no se envía nada.\n\nPodés cambiarlo cuando quieras en Mi cuenta › GPS y privacidad.")
   .setPositiveButton("Aceptar"){_,_->prefs().edit().putBoolean(presenceKey(),true).apply();presenceAt=null;then()}
   .setNegativeButton("Ahora no"){_,_->prefs().edit().putBoolean(presenceKey(),false).apply();then()}
   .setOnCancelListener{then()}.show()
 }

 // ---------- Privacy policy: the same text published in docs/legal/privacidad.md ----------
 private fun privacy(){
  page("privacy");bar("Privacidad",back={if(api.session()==null)login() else settings()})
  val c=card(pad=18)
  val lines=try{assets.open("privacidad.md").bufferedReader().use{it.readLines()}}catch(_:Exception){listOf("No se pudo abrir la política de privacidad.")}
  var paragraph=""
  fun flush(){if(paragraph.isNotBlank())text(c,paragraph.trim(),14.5f,ink,0,10).setLineSpacing(0f,1.2f);paragraph=""}
  for(l in lines)when{
   l.startsWith("# ")->{flush();text(c,l.removePrefix("# "),20f,ink,2)}
   l.startsWith("## ")->{flush();text(c,l.removePrefix("## "),16.5f,ink,1,22)}
   l.startsWith("- ")->{flush();text(c,"•  "+l.removePrefix("- "),14.5f,ink,0,8).setLineSpacing(0f,1.2f)}
   l.isBlank()->flush()
   else->paragraph+=" "+l
  }
  flush()
 }

 // ---------- Owner fleet panel ----------
 private fun ownerDashboard(){
  // The company account lives on this screen. An owner who also drives opens it from the owner menu and goes back to the start screen.
  val hub=!panelFirst();page("owner");back.isEnabled=hub
  val reload=barButton(R.drawable.ic_sync,"Actualizar flota"){loadFleet(true)}
  if(hub)bar("Flota en vivo",back={homeOrTrip()},trailing=reload) else hello(name,"Flota en vivo",reload)
  val f=mobile.fleet();val items=fleetItems(f);val fetched=f.optLong("fetched_at")
  val k=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};root.addView(k,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(14)})
  fleetStats=k;fleetStatsInto(k,items)
  alerts()
  val marks=fleetMarks(items,f);fleetShape=shapeOf(f,items,marks)
  // Half the screen for the map (decision of 29/10/2026), a full screen too, and the route of a truck tapped.
  val mc=card();val map=TripMap.fleet(this,marks,LIVE_MS);activeMap=map;fleetMap=map;mc.addView(map.view,LinearLayout.LayoutParams(-1,max(dp(300),(resources.displayMetrics.heightPixels*.5f).toInt())))
  routeKey=null;map.onTruck{k->truckRoute(k){map.showRoute(it)}}
  if(marks.length()==0)note(if(fetched==0L)"Buscando posiciones…" else "Todavía no hay posiciones GPS para mostrar.",mc,0).setPadding(dp(16),dp(10),dp(16),dp(12))
  button(root,"Ver el mapa en pantalla completa",Kind.LINE,R.drawable.ic_expand,top=10){fullFleet()}
  note("Tocá un camión de viaje para ver su recorrido; tocándolo otra vez se oculta.",top=6)
  section("Camiones")
  if(items.isEmpty())emptyCard(R.drawable.ic_truck,"Sin camiones cargados","Los equipos del catálogo aparecen acá.") else {val c=card();fleetCard=c;items.forEach{fleetRow(c,it)}}
  fleetNote=note(fleetNoteText(f),top=10)
  section("Choferes con la app")
  val pc=card();peopleCard=pc;peopleInto(pc,f)
  note("Activo es con la app abierta en los últimos 10 minutos. El punto azul del mapa es el teléfono del chofer activo que no está de viaje. Las versiones anteriores a la 0.17.0 no avisan.",top=8)
  if(!hub)tileGrid(listOf(Tile(R.drawable.ic_list,"Viajes de la flota",null){openHistory("trips",true)},Tile(R.drawable.ic_history,"Combustible de la flota",null){openHistory("fuel",true)},
   Tile(R.drawable.ic_speed,"Rendimiento",null){openPerformance()},Tile(R.drawable.ic_wrench,"Mantenimiento",null){maintenance(true)},Tile(R.drawable.ic_doc,"Documentos",null){documents(true)},
   Tile(R.drawable.ic_chess,"Juegos",null){games()}))
  sync=note(store.message(),top=16).apply{gravity=Gravity.CENTER}
  if(!hub)navBar("owner")
  if(!fleetLoading&&System.currentTimeMillis()-fleetLoadedAt>FLEET_MS)loadFleet()
  refreshPapers()
 }
 private fun fleetStatsInto(k:LinearLayout,items:List<FleetItem>){
  k.removeAllViews()
  stat(k,"${items.count{it.state=="moving"}}","En ruta",green,0);stat(k,"${items.count{it.state=="stopped"||it.state=="paused"||it.state=="nosignal"}}","Detenidos",amber,1);stat(k,"${items.count{it.state=="idle"}}","Sin viaje",grey,2)
 }
 /**
  * One marker per truck with a position, and a smaller blue one where the phone of each active driver without a trip is;
  * the key lets the open map move each marker instead of drawing it again.
  */
 private fun fleetMarks(items:List<FleetItem>,f:JSONObject):JSONArray{
  val marks=JSONArray()
  // A truck on a trip says its speed while it moves (decision of 29/10/2026).
  items.filter{FleetStats.validPosition(it.lat,it.lng)}.forEach{val speed=if(it.session!=null&&it.state=="moving"&&it.speed.isFinite())" · ${Math.round(it.speed)} km/h" else ""
   marks.put(JSONObject().put("key",it.session?.optString("id")?.let{id->"trip:$id"}?:"truck:${it.model}|${it.plate}").put("lat",it.lat).put("lng",it.lng).put("label",it.plate.ifBlank{it.model}+speed).put("color",hex(stateColor(it.state))))}
  presenceRows(f).filter{(r,state)->placeOf(r,state)}.forEach{(r,_)->val name=FleetStats.text(r.optString("driver_name"))?:"Chofer"
   marks.put(JSONObject().put("key","driver:${r.optString("driver_id")}").put("lat",r.optDouble("latitude")).put("lng",r.optDouble("longitude")).put("label",name.split(' ').first()).put("color",hex(0xFF1663E8.toInt())).put("person",true))}
  return marks
 }
 private fun fleetNoteText(f:JSONObject):String{val at=maxOf(f.optLong("fetched_at"),f.optLong("live_at"));return if(at==0L)"Buscando la flota…" else "Actualizado ${ago(at)}. Las posiciones se actualizan solas cada ${LIVE_MS/1000} segundos."}
 /** New positions while the fleet screen is open: markers, rows and counts change in place; the map keeps its view. */
 private fun loadLive(){
  liveLoading=true
  thread{val ok=try{mobile.live();true}catch(_:Exception){false}
   runOnUiThread{liveLoading=false;liveLoadedAt=System.currentTimeMillis();if(ok){fleetMoved();if(screen=="owner"&&!fleetLive())rebuildOwner()}}}
 }
 /** What decides how the fleet screen is built: trucks or none, positions or none, data or still looking. */
 private fun shapeOf(f:JSONObject,items:List<FleetItem>,marks:JSONArray)="${items.isEmpty()}|${marks.length()==0}|${f.optLong("fetched_at")==0L}"
 /** False when the screen has to be built again: what it shows changed shape. An empty fleet stays as it is. */
 private fun fleetLive():Boolean{
  val f=mobile.fleet();val items=fleetItems(f);val marks=fleetMarks(items,f);val k=fleetStats
  if(k==null||fleetShape!=shapeOf(f,items,marks))return false
  fleetStatsInto(k,items);fleetCard?.let{c->c.removeAllViews();items.forEach{fleetRow(c,it)}}
  fleetMap?.setMarks(marks)
  fleetNote?.text=fleetNoteText(f);peopleCard?.let{peopleInto(it,f)}
  return true
 }
 /**
  * The drivers with the app (0.17.0 or later), the same rule as the panel: on a trip first, then active with the app open in
  * the last 10 minutes, then when they last opened it, with the app version and whether a newer one is in use.
  */
 private fun peopleInto(c:LinearLayout,f:JSONObject){
  c.removeAllViews()
  val rows=presenceRows(f)
  if(rows.isEmpty()){note("Todavía ningún chofer abrió la app nueva.",c,0).setPadding(dp(16),dp(12),dp(16),dp(12));return}
  val newest=rows.map{it.first.optString("app_version")}.reduce{a,b->if(FleetStats.compareVersions(b,a)>0)b else a}
  rows.forEach{(r,state)->
   val seen=FleetStats.seenAt(r.optString("seen_at"))?.let{ago(it)}?:"hace tiempo";val version=r.optString("app_version")
   val what=when(state){"trip"->"En viaje";"active"->"Activo $seen · sin viaje"+if(placeOf(r,state))"" else " · sin posición";else->"Abrió la app $seen"}
   val app="app $version"+if(FleetStats.compareVersions(newest,version)>0)" (hay una más nueva: $newest)" else ""
   row(c,R.drawable.ic_person,FleetStats.text(r.optString("driver_name"))?:"Chofer","$what · $app",tint=when(state){"trip"->blue;"active"->green;else->grey})
  }
 }
 /** Each presence row with its state («trip», «active» or «seen»), on a trip first; who is on a trip comes from the fleet. */
 private fun presenceRows(f:JSONObject):List<Pair<JSONObject,String>>{
  val active=f.optJSONArray("active")?:JSONArray();val onTrip=(0 until active.length()).map{active.getJSONObject(it).optString("driver_id")}.toSet()
  val now=System.currentTimeMillis();val order=mapOf("trip" to 0,"active" to 1,"seen" to 2)
  return mobile.presence().let{a->(0 until a.length()).map{a.getJSONObject(it)}}.map{Pair(it,FleetStats.presenceState(it.optString("driver_id") in onTrip,it.optString("seen_at"),now))}.sortedBy{order[it.second]}
 }
 /** Whether the map shows where this driver's phone is: active without a trip and a recent position (FleetStats.presencePlace). */
 private fun placeOf(r:JSONObject,state:String)=FleetStats.presencePlace(state,r.optString("seen_at"),r.optString("located_at"),r.optDouble("latitude"),r.optDouble("longitude"))
 private fun loadFleet(manual:Boolean=false){
  if(fleetLoading)return;fleetLoading=true;if(manual)toast("Actualizando la flota…")
  thread{val ok=try{mobile.catalog(true);mobile.fleet(true);true}catch(_:Exception){false}
   // Who has the app open; the fleet still shows if this lookup fails.
   if(ok)try{mobile.presence(true)}catch(_:Exception){}
   runOnUiThread{fleetLoading=false;fleetLoadedAt=System.currentTimeMillis();if(!ok&&manual)toast("Sin conexión. Se muestra la última información guardada.")
    // The refresh every minute updates the open screen in place; a manual one, or a change in what it shows, builds it again.
    if(ok)fleetMoved()
    if(ok&&screen=="owner"&&(manual||!fleetLive()))rebuildOwner()}}
 }
 /** New positions to the maps of the fleet that are not Flota en vivo's own: the trip's of an owner who drives, and the full screen. */
 private fun fleetMoved(){
  if(screen=="trip"||screen=="simpletrip")liveMap?.setFleet(tripFleet())
  fullFleetMap?.let{val f=mobile.fleet();it.setMarks(fleetMarks(fleetItems(f),f))}
 }
 private fun rebuildOwner(){val scroll=root.parent as? ScrollView;val y=scroll?.scrollY?:0;ownerDashboard();(root.parent as? ScrollView)?.post{(root.parent as? ScrollView)?.scrollTo(0,y)}}
 private fun stateColor(state:String)=when(state){"moving"->0xFF178A4C.toInt();"idle"->0xFF8F9BAD.toInt();else->0xFFE69A1E.toInt()}
 private fun fleetItems(f:JSONObject):List<FleetItem>{
  val now=System.currentTimeMillis();val out=mutableListOf<FleetItem>();val busy=mutableSetOf<String>()
  // Trucks are matched like the month summary: a trip saved with an older label ("Ford Cargo") still marks its catalog
  // truck as busy, so the truck does not show twice.
  val fleet=mobile.trucks()
  val running=f.optJSONArray("active")?:JSONArray()
  for(i in 0 until running.length()){val s=running.getJSONObject(i);val last=s.optJSONObject("last")
   val at=instant(last?.optString("recorded_at"))?.toEpochMilli();val kmh=last?.optDouble("speed_kmh",Double.NaN)?:Double.NaN
   val state=when{s.optBoolean("paused")->"paused";at==null||now-at>15*60000->"nosignal";kmh.isFinite()&&kmh>=5->"moving";else->"stopped"}
   val label=FleetStats.canonical(s.optString("vehicle"),fleet);if(label!=null)busy.add(label)
   val (model,plate)=truckParts(label?:s.optString("vehicle"))
   out.add(FleetItem(model,plate,s.optString("driver_name"),state,kmh,s.optDouble("distance_meters",0.0),last?.optDouble("latitude",Double.NaN)?:Double.NaN,last?.optDouble("longitude",Double.NaN)?:Double.NaN,at,s))}
  val recent=f.optJSONArray("recent")?:JSONArray();val equipos=mobile.catalog().optJSONArray("equipos")?:JSONArray()
  for(i in 0 until equipos.length()){val e=equipos.getJSONObject(i);val plate=e.optString("matriculaCamion").trim()
   val label=FleetStats.CatalogTruck(e.optString("tipo"),plate).label
   if(label.isNotBlank()&&label in busy)continue
   var last:JSONObject?=null
   for(j in 0 until recent.length()){val r=recent.getJSONObject(j);if(label.isNotBlank()&&FleetStats.canonical(r.optString("vehicle"),fleet)==label){last=r;break}}
   out.add(FleetItem(e.optString("tipo"),plate,last?.optString("driver_name")?:"","idle",Double.NaN,0.0,last?.optDouble("arrival_lat",Double.NaN)?:Double.NaN,last?.optDouble("arrival_lng",Double.NaN)?:Double.NaN,instant(last?.optString("ended_at"))?.toEpochMilli(),null))}
  return out
 }
 private fun fleetRow(c:LinearLayout,u:FleetItem){
  if(c.childCount>0)divider(c,42)
  val v=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(16),dp(12),dp(14),dp(12))}
  val (dot,halo)=when(u.state){"moving"->Pair(green,greenBg);"idle"->Pair(grey,greyBg);else->Pair(amber,amberBg)}
  v.addView(View(this).apply{background=GradientDrawable().apply{shape=GradientDrawable.OVAL;setColor(dot);setStroke(dp(3),halo)}},LinearLayout.LayoutParams(dp(14),dp(14)))
  val stateText=when(u.state){"moving"->"En ruta";"paused"->"Pausado";"nosignal"->"Sin señal";"stopped"->"Detenido";else->"Sin viaje"}
  val title=listOf(u.model,u.plate).filter{it.isNotBlank()}.joinToString(" · ").ifBlank{"Camión"}
  val sub=listOfNotNull(u.driver.substringBefore(" ").ifBlank{null},stateText,u.at?.let{ago(it)}).joinToString(" · ")
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,dp(8),0)}
  col.addView(tv(title,15f,ink,1).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END});col.addView(tv(sub,13f,muted).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END;setPadding(0,dp(3),0,0)})
  v.addView(col,LinearLayout.LayoutParams(0,-2,1f))
  if(u.state!="idle"){val right=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.END}
   right.addView(tv(if(u.speed.isFinite())String.format(uy,"%.0f km/h",u.speed) else "— km/h",14.5f,ink,1).apply{gravity=Gravity.END})
   right.addView(tv(km(u.meters),13f,muted).apply{gravity=Gravity.END;setPadding(0,dp(3),0,0)});v.addView(right)}
  v.contentDescription="$title. $sub"
  u.session?.let{s->v.background=ripple(null);v.isClickable=true;v.isFocusable=true;v.setOnClickListener{detailFrom="fleet";detail(s,true)}}
  c.addView(v,LinearLayout.LayoutParams(-1,-2))
 }

 // ---------- Owner menu: every fleet function, one tap away from the start screen of an owner who also drives ----------
 private fun menuButton()=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER;background=ripple(bg(blueSoft,22));setPadding(dp(12),0,dp(16),0);isClickable=true;isFocusable=true;contentDescription="Menú del dueño";setOnClickListener{ownerMenu()};sink(this,.95f)
  addView(iconView(R.drawable.ic_menu,blue,22));addView(tv("Menú",15.5f,blue,1).apply{setPadding(dp(8),0,0,0)})
  layoutParams=LinearLayout.LayoutParams(-2,dp(44))}
 /**
  * A sheet that slides up from the bottom, nearly solid like the panel's menus: it closes with the back gesture, tapping
  * outside or its ✕. fill gets the list to fill and the sheet, to close it before opening what was chosen.
  */
 private fun sheet(title:String,sub:String?,fill:(LinearLayout,android.app.Dialog)->Unit){
  sheet?.dismiss()
  val d=android.app.Dialog(this);sheet=d
  d.requestWindowFeature(Window.FEATURE_NO_TITLE)
  val frame=FrameLayout(this).apply{setPadding(dp(10),dp(10),dp(10),dp(10));setOnClickListener{d.dismiss()}}
  val panel=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=outline(menuFill,glassLine,28);clipToOutline=true;isClickable=true}
  // The handle on top says that it is a sheet.
  panel.addView(View(this).apply{background=bg(fieldLine,2);importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO},LinearLayout.LayoutParams(dp(36),dp(4)).apply{gravity=Gravity.CENTER_HORIZONTAL;topMargin=dp(8)})
  val top=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(20),dp(6),dp(6),dp(6))}
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
  col.addView(tv(title,19f,ink,2));if(sub!=null)col.addView(tv(sub,13.5f,muted).apply{setPadding(0,dp(2),0,0)})
  top.addView(col,LinearLayout.LayoutParams(0,-2,1f))
  top.addView(ImageView(this).apply{setImageResource(R.drawable.ic_close);imageTintList=ColorStateList.valueOf(muted);setPadding(dp(12),dp(12),dp(12),dp(12));background=RippleDrawable(ColorStateList.valueOf(press),null,null);contentDescription="Cerrar";isClickable=true;isFocusable=true;setOnClickListener{d.dismiss()}},LinearLayout.LayoutParams(dp(48),dp(48)))
  panel.addView(top,LinearLayout.LayoutParams(-1,-2))
  val list=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(10),dp(2),dp(10),dp(12))}
  fill(list,d)
  panel.addView(ScrollView(this).apply{isVerticalScrollBarEnabled=false;overScrollMode=View.OVER_SCROLL_NEVER;addView(list)},LinearLayout.LayoutParams(-1,-2,1f))
  frame.addView(panel,FrameLayout.LayoutParams(if(resources.displayMetrics.widthPixels>dp(560))dp(520) else -1,-2,Gravity.CENTER_HORIZONTAL or Gravity.BOTTOM))
  ViewCompat.setOnApplyWindowInsetsListener(frame){v,i->val bars=i.getInsets(WindowInsetsCompat.Type.systemBars());v.setPadding(bars.left+dp(10),bars.top+dp(10),bars.right+dp(10),bars.bottom+dp(10));i}
  d.setContentView(frame);d.setTitle(title);d.setCanceledOnTouchOutside(true)
  d.setOnDismissListener{if(sheet===d)sheet=null}
  d.window?.apply{setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT));setGravity(Gravity.BOTTOM);setLayout(-1,-2);setWindowAnimations(R.style.TRF_SheetMotion)}
  d.show();d.window?.setLayout(-1,-2)
 }
 /**
  * A list to choose from, in a sheet (they were dialogs before 0.22.0): the current choice is marked; choosing closes it.
  * last is one more choice at the end, quieter (leave it pending, take the choice away), given as items.size.
  */
 private fun pick(title:String,items:List<String>,current:String?=null,last:String?=null,chosen:(Int)->Unit)=sheet(title,null){list,d->
  val c=card(list,top=0);val all=items+listOfNotNull(last)
  all.forEachIndexed{i,s->if(i>0)divider(c,16);val on=i<items.size&&s==current;val quiet=i>=items.size
   val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;minimumHeight=dp(54);setPadding(dp(16),dp(8),dp(12),dp(8));background=ripple(null);isClickable=true;isFocusable=true;contentDescription=s+if(on)", elegido" else "";setOnClickListener{d.dismiss();chosen(i)}}
   r.addView(tv(s,15.5f,if(on)blue else if(quiet)muted else ink,if(quiet)0 else 1).apply{maxLines=2;ellipsize=TextUtils.TruncateAt.END},LinearLayout.LayoutParams(0,-2,1f))
   if(on)r.addView(iconView(R.drawable.ic_check_circle,blue,22))
   c.addView(r,LinearLayout.LayoutParams(-1,-2))}
 }
 /** Every fleet function, in a sheet; each closes it before opening its screen. */
 private fun ownerMenu(){
  val items=mutableListOf(
   Shortcut(R.drawable.ic_map,0xFF178A4C.toInt(),"Flota en vivo","Mapa y estado de cada camión"){ownerDashboard()},
   Shortcut(R.drawable.ic_route,0xFF1663E8.toInt(),"Viajes de la flota","De todos los choferes"){openHistory("trips",true)},
   Shortcut(R.drawable.ic_speed,0xFF7A4FD0.toInt(),"Rendimiento","De cada camión y cada chofer"){openPerformance()},
   Shortcut(R.drawable.ic_fuel,0xFFC96A12.toInt(),"Combustible de la flota","Cargas y gasto de cada camión"){openHistory("fuel",true)},
   Shortcut(R.drawable.ic_wrench,0xFF56647B.toInt(),"Mantenimiento","Services hechos y pendientes"){maintenance(true)},
   Shortcut(R.drawable.ic_doc,0xFF0E8A8A.toInt(),"Documentos","Vencimientos de la flota"){documents(true)})
  // In simple mode this menu takes the place of the "Cambiar de modo" button of the start screen.
  if(simple())items.add(Shortcut(R.drawable.ic_list,0xFF8590A2.toInt(),"Cambiar de modo","Sencillo o normal"){askMode()})
  sheet("Menú del dueño","Toda la flota, desde tu cuenta"){list,d->menuRows(card(list,top=0),items){d.dismiss()}}
 }

 // ---------- Owner: month totals per truck or per driver ----------
 private fun openPerformance(){perfMonth=YearMonth.now();perfDrivers=false;perfFailed=false;performance(true)}
 private fun monthName(m:YearMonth)=m.atDay(1).format(DateTimeFormatter.ofPattern("MMMM yyyy",uy)).replaceFirstChar{it.uppercase(uy)}
 private fun whole(v:Double)=money(v)
 private fun cash(uyu:Double,usd:Double)=listOfNotNull(if(uyu>0)"$ ${whole(uyu)}" else null,if(usd>0)"US$ ${whole(usd)}" else null).joinToString(" + ")
 /** Same truck when the plates match; a label without plate is matched by model. */
 private fun sameUnit(a:String,b:String):Boolean{val (ma,pa)=truckParts(a);val (mb,pb)=truckParts(b);return if(pa.isNotBlank()&&pb.isNotBlank())pa.replace(" ","").equals(pb.replace(" ",""),true) else ma.equals(mb,true)}
 private fun performance(refresh:Boolean=false){
  page("performance");bar("Rendimiento",back={homeOrTrip()},trailing=barButton(R.drawable.ic_sync,"Actualizar"){perfFailed=false;performance(true)})
  val month=perfMonth;val now=YearMonth.now()
  val mr=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(4),dp(4),dp(4),dp(4))}
  fun step(label:String,delta:Long,enabled:Boolean)=ImageView(this).apply{setImageResource(R.drawable.ic_chevron);if(delta<0)rotation=180f;imageTintList=ColorStateList.valueOf(if(enabled)blue else faint);setPadding(dp(12),dp(12),dp(12),dp(12));contentDescription=label;isEnabled=enabled
   if(enabled){background=RippleDrawable(ColorStateList.valueOf(press),null,null);isClickable=true;isFocusable=true;setOnClickListener{perfMonth=month.plusMonths(delta);perfFailed=false;performance(true)}}}
  mr.addView(step("Mes anterior",-1,month.isAfter(now.minusMonths(12))),LinearLayout.LayoutParams(dp(48),dp(48)))
  mr.addView(tv(monthName(month),17f,ink,1).apply{gravity=Gravity.CENTER},LinearLayout.LayoutParams(0,-2,1f))
  mr.addView(step("Mes siguiente",1,month.isBefore(now)),LinearLayout.LayoutParams(dp(48),dp(48)))
  card().addView(mr)
  segmented(root,listOf("Por camión","Por chofer"),if(perfDrivers)1 else 0){perfDrivers=it==1;performance()}
  val data=mobile.performance(month)
  if(data==null){
   if(perfFailed){emptyCard(R.drawable.ic_warning,"No se pudo calcular","Revisá la conexión del teléfono y probá de nuevo.");button(root,"Reintentar",Kind.LINE,R.drawable.ic_sync){perfFailed=false;performance(true)}}
   else emptyCard(R.drawable.ic_speed,"Calculando…","Sumando los viajes y el combustible del mes.")
  }else{
   val s=if(perfDrivers)data.drivers else data.trucks
   if(s.rows.isEmpty())emptyCard(R.drawable.ic_route,"Sin viajes ni combustible","No hay registros de la flota en este mes.")
   else{
    section("Toda la flota");perfCard(s.total,null)
    val moving=s.rows.filter{it.gpsKm>0}
    if(moving.size>1){section(if(perfDrivers)"Kilómetros por chofer" else "Kilómetros por camión");kmBars(moving)}
    section(if(perfDrivers)"Por chofer" else "Por camión");s.rows.forEach{perfCard(it,if(perfDrivers)R.drawable.ic_person else R.drawable.ic_truck)}
   }
   if(!perfDrivers){
    // Trucks of the catalog that neither travelled nor loaded fuel still belong in the picture.
    val idle=mobile.trucks().map{it.label}.filter{label->s.rows.none{sameUnit(it.name,label)}}
    if(idle.isNotEmpty()){section("Sin movimientos en el mes");val ic=card();idle.forEach{label->val (m,p)=truckParts(label);row(ic,R.drawable.ic_truck_outline,m.ifBlank{p},if(m.isNotBlank()&&p.isNotBlank())"Matrícula $p" else null,tint=grey)}}
   }
   note("Kilómetros del GPS de la app. Cada boleta cuenta en su fecha, o en la que le corrigió el panel. El consumo usa los litros cargados en el mes y se calcula con ${whole(FleetStats.MIN_KM_FOR_RATIO)} km o más. Kilos, kilómetros facturables e importes son los que se completan en el panel web.",top=14)
   note("Actualizado ${ago(data.fetchedAt)}.",top=6)
  }
  if((refresh||data==null)&&!perfFailed)loadPerformance(month)
 }
 private fun loadPerformance(month:YearMonth){
  if(perfLoading==month)return;perfLoading=month
  thread{val ok=try{mobile.performance(month,true);true}catch(_:Exception){false}
   runOnUiThread{if(perfLoading==month)perfLoading=null
    if(screen!="performance"||perfMonth!=month)return@runOnUiThread
    if(!ok){perfFailed=mobile.performance(month)==null;toast(if(perfFailed)"No se pudo calcular. Revisá la conexión." else "Sin conexión. Se muestran los últimos datos guardados.")}
    if(ok||perfFailed){val y=(root.parent as? ScrollView)?.scrollY?:0;performance();(root.parent as? ScrollView)?.let{s->s.post{s.scrollTo(0,y)}}}}}
 }
 /** One truck, one driver, or the whole fleet when icon is null: kilometres, share with cargo, fuel and what the office billed. */
 private fun perfCard(r:FleetStats.Row,icon:Int?){
  val c=card()
  if(icon!=null){
   val unnamed=r.name==FleetStats.NO_TRUCK||r.name==FleetStats.NO_DRIVER;val isTruck=icon==R.drawable.ic_truck
   val (model,plate)=if(isTruck&&!unnamed)truckParts(r.name) else Pair(r.name,"")
   row(c,if(unnamed&&isTruck)R.drawable.ic_truck_outline else icon,model.ifBlank{r.name},when{unnamed->if(isTruck)"Viajes y cargas sin camión elegido" else "Viajes y cargas sin nombre de chofer";plate.isNotBlank()->"Matrícula $plate";else->null},tint=if(unnamed)grey else blue)
   divider(c)
  }
  factsGrid(c,listOf(Fact(R.drawable.ic_route,"Kilómetros","${whole(r.gpsKm)} km"),Fact(R.drawable.ic_list,"Viajes","${r.trips}"),Fact(R.drawable.ic_truck,"Con carga","${whole(r.loadedKm)} km"),Fact(R.drawable.ic_truck_outline,"Sin carga","${whole(r.emptyKm)} km")))
  loadBar(c,r)
  val spent=cash(r.fuelUyu,r.fuelUsd)
  fact(c,R.drawable.ic_fuel,"Combustible",if(r.liters<=0&&spent.isEmpty())"Sin cargas en el mes" else listOf("${whole(r.liters)} L",spent).filter{it.isNotEmpty()}.joinToString(" · "))
  fact(c,R.drawable.ic_speed,"Consumo",r.litersPer100?.let{String.format(uy,"%.1f L/100 km · %.1f km por litro",it,100/it)}?:if(r.liters<=0)"Sin litros cargados en el mes" else "Se calcula con ${whole(FleetStats.MIN_KM_FOR_RATIO)} km o más")
  if(r.billableKm>0)fact(c,R.drawable.ic_navigation,"Kilómetros facturables","${whole(r.billableKm)} km")
  if(r.kg>0)fact(c,R.drawable.ic_weight,"Kilos transportados","${whole(r.kg)} kg")
  val billed=cash(r.billedUyu,r.billedUsd)
  if(billed.isNotEmpty()){fact(c,R.drawable.ic_receipt,"Facturado",billed);if(r.unbilled>0)note("Falta el importe de ${r.unbilled} viaje${if(r.unbilled==1)"" else "s"} con carga.",c,0).setPadding(dp(56),0,dp(16),dp(12))}
 }
 /** Share of the GPS kilometres driven with and without cargo. */
 private fun loadBar(c:LinearLayout,r:FleetStats.Row){
  val share=r.loadedShare?:return
  divider(c)
  // The second figure is what is left of the first, so the two always add up to 100.
  val full=0xFF178A4C.toInt();val empty=0xFFE69A1E.toInt();val part=Math.round(share*1000)/10.0
  val loaded=String.format(uy,"%.1f%%",part);val unloaded=String.format(uy,"%.1f%%",100-part)
  val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(16),dp(12),dp(16),dp(12));contentDescription="Con carga $loaded, sin carga $unloaded"}
  val track=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;background=bg(greyBg,5);clipToOutline=true}
  track.addView(View(this).apply{setBackgroundColor(full)},LinearLayout.LayoutParams(0,-1,share.toFloat()))
  track.addView(View(this).apply{setBackgroundColor(empty)},LinearLayout.LayoutParams(0,-1,(1-share).toFloat()))
  box.addView(track,LinearLayout.LayoutParams(-1,dp(10)))
  val legend=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(0,dp(8),0,0)}
  for((color,label) in listOf(Pair(full,"Con carga $loaded"),Pair(empty,"Sin carga $unloaded"))){
   legend.addView(View(this).apply{background=oval(color)},LinearLayout.LayoutParams(dp(8),dp(8)))
   legend.addView(tv(label,13f,muted).apply{setPadding(dp(6),0,dp(8),0);maxLines=1},LinearLayout.LayoutParams(0,-2,1f))}
  box.addView(legend);c.addView(box,LinearLayout.LayoutParams(-1,-2))
 }
 /** Kilometres of the month side by side, longest first. */
 private fun kmBars(rows:List<FleetStats.Row>){
  val c=card(pad=16);val longest=rows.maxOf{it.gpsKm}
  rows.sortedByDescending{it.gpsKm}.forEachIndexed{i,r->
   val head=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;contentDescription="${r.name}: ${whole(r.gpsKm)} kilómetros"}
   head.addView(tv(r.name,14f,ink,1).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END;setPadding(0,0,dp(10),0)},LinearLayout.LayoutParams(0,-2,1f))
   head.addView(tv("${whole(r.gpsKm)} km",14f,ink,1))
   c.addView(head,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(if(i==0)0 else 14)})
   val part=(r.gpsKm/longest).toFloat().coerceIn(0f,1f)
   val track=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;background=bg(greyBg,5);clipToOutline=true}
   track.addView(View(this).apply{background=bg(blue,5)},LinearLayout.LayoutParams(0,-1,part));track.addView(View(this),LinearLayout.LayoutParams(0,-1,1f-part))
   c.addView(track,LinearLayout.LayoutParams(-1,dp(10)).apply{topMargin=dp(6)})}
 }

 // ---------- Maintenance and documents ----------
 private fun JSONArray.objects()=(0 until length()).map{getJSONObject(it)}
 private fun day(r:JSONObject,key:String)=r.optString(key).takeIf{it.isNotBlank()&&it!="null"}?.let{try{LocalDate.parse(it.take(10))}catch(_:Exception){null}}
 private fun dateValue(r:JSONObject,key:String):Any=day(r,key)?.toString()?:JSONObject.NULL
 private fun fmt(d:LocalDate)=d.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
 private fun inDays(d:LocalDate):String{val n=java.time.temporal.ChronoUnit.DAYS.between(LocalDate.now(),d);return when{n==0L->"hoy";n==1L->"mañana";n>1L->"en $n días";n==-1L->"ayer";else->"hace ${-n} días"}}
 private fun sameTruck(a:String,b:String):Boolean{val pa=truckParts(a).second;val pb=truckParts(b).second;return if(pa.isNotBlank()&&pb.isNotBlank())pa.equals(pb,true) else a.trim().equals(b.trim(),true)}
 private fun truckLabel(v:String)=truckParts(v).let{if(it.second.isNotBlank())it.second else it.first}
 private fun maintState(r:JSONObject):Pair<String,String>{val done=day(r,"done_on");val due=day(r,"due_on");val today=LocalDate.now()
  return when{done!=null->Pair("done","Hecho el ${fmt(done)}");due==null->Pair("pending","Sin fecha prevista");due.isBefore(today)->Pair("late","Era para el ${fmt(due)}");!due.isAfter(today.plusDays(15))->Pair("soon","${fmt(due)} · ${inDays(due)}");else->Pair("planned","Para el ${fmt(due)}")}}
 private fun docState(r:JSONObject):Pair<String,String>{val exp=day(r,"expires_on");val today=LocalDate.now()
  return when{exp==null->Pair("nodate","Sin fecha de vencimiento");exp.isBefore(today)->Pair("late","Venció el ${fmt(exp)}");!exp.isAfter(today.plusDays(30))->Pair("soon","Vence el ${fmt(exp)} · ${inDays(exp)}");else->Pair("ok","Vence el ${fmt(exp)}")}}
 private fun stateStyle(state:String,soon:String)=when(state){"done"->Triple("Realizado",green,greenBg);"ok"->Triple("Vigente",green,greenBg);"late"->Triple("Vencido",red,redBg);"soon"->Triple(soon,amber,amberBg);"planned"->Triple("Programado",blue,blueSoft);"nodate"->Triple("Sin fecha",grey,greyBg);else->Triple("Pendiente",grey,greyBg)}
 private fun kindIcon(kind:String)=kind.lowercase(uy).let{when{"aceite" in it->R.drawable.ic_drop;"freno" in it||"cubierta" in it->R.drawable.ic_disc;"filtro" in it->R.drawable.ic_funnel;else->R.drawable.ic_wrench}}
 private fun paperIcon(kind:String)=kind.lowercase(uy).let{when{"licencia" in it->R.drawable.ic_badge;"salud" in it->R.drawable.ic_health;"soa" in it||"seguro" in it->R.drawable.ic_shield;"patente" in it->R.drawable.ic_car;"mtop" in it||"habilitaci" in it->R.drawable.ic_doc;else->R.drawable.ic_folder}}
 private fun dateField(c:LinearLayout,title:String,data:JSONObject,key:String,changed:()->Unit){
  caption(c,title);val current=day(data,key)
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL}
  r.addView(tv(current?.let{fmt(it)}?:"Elegir fecha",16f,if(current==null)faint else ink).apply{gravity=Gravity.CENTER_VERTICAL;background=ripple(outline(fieldFill,fieldLine,14));setPadding(dp(14),0,dp(14),0);setCompoundDrawablesRelative(null,null,tinted(R.drawable.ic_calendar,muted),null);isClickable=true;isFocusable=true;contentDescription="$title: ${current?.let{fmt(it)}?:"sin fecha"}";setOnClickListener{
   val start=current?:LocalDate.now();DatePickerDialog(this@MainActivity,{_,y,m,d->data.put(key,LocalDate.of(y,m+1,d).toString());changed()},start.year,start.monthValue-1,start.dayOfMonth).show()}},LinearLayout.LayoutParams(0,dp(52),1f))
  if(current!=null)r.addView(ImageView(this).apply{setImageResource(R.drawable.ic_close);imageTintList=ColorStateList.valueOf(muted);setPadding(dp(12),dp(12),dp(12),dp(12));background=RippleDrawable(ColorStateList.valueOf(press),null,null);contentDescription="Quitar fecha";isClickable=true;isFocusable=true;setOnClickListener{data.remove(key);changed()}},LinearLayout.LayoutParams(dp(48),dp(48)).apply{marginStart=dp(4)})
  c.addView(r,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(6)})
 }
 private fun saveOnline(table:String,row:JSONObject,ok:String,then:()->Unit){
  toast("Guardando…");val id=editId
  thread{val error=try{mobile.saveRecord(table,row,id);null}catch(e:ApiError){if(e.status==401||e.status==403)"No tenés permiso para guardar esto." else "No se pudo guardar (error ${e.status}). Probá de nuevo."}catch(_:IllegalStateException){"Solo quien lo cargó o el dueño puede editarlo."}catch(_:Exception){"Sin conexión. Probá de nuevo cuando tengas señal."}
   runOnUiThread{if(error==null){toast(ok);then()}else toast(error)}}
 }
 private fun confirmDelete(table:String,question:String,ok:String,then:()->Unit){
  val id=editId?:return
  AlertDialog.Builder(this).setTitle(question).setMessage("No se puede deshacer.").setNegativeButton("Cancelar",null).setPositiveButton("Eliminar"){_,_->
   thread{val error=try{mobile.deleteRecord(table,id);null}catch(_:IllegalStateException){"Solo quien lo cargó o el dueño puede eliminarlo."}catch(_:Exception){"Sin conexión. Probá de nuevo cuando tengas señal."};runOnUiThread{if(error==null){toast(ok);then()}else toast(error)}}}.show()
 }
 /** Reloads both lists at most every 10 minutes and redraws the start screen only if something changed. */
 private fun refreshPapers(force:Boolean=false){
  if(!force&&System.currentTimeMillis()-papersAt<600000)return;papersAt=System.currentTimeMillis()
  thread{val before=mobile.documents().toString()+mobile.maintenance().toString()
   val ok=try{mobile.documents(true);mobile.maintenance(true);true}catch(_:Exception){false}
   if(ok&&before!=mobile.documents().toString()+mobile.maintenance().toString())runOnUiThread{when(screen){"home"->home();"owner"->ownerDashboard()}}}
 }
 private fun alerts(){
  val owner=isOwner()
  fun myTruck(v:String)=owner||(truck.isNotBlank()&&sameTruck(v,truck))
  val docs=mobile.documents().objects().filter{(it.optString("scope")=="vehicle"&&myTruck(it.optString("vehicle")))||(it.optString("scope")=="driver"&&(owner||it.optString("driver_id")==uid()))}.filter{docState(it).first in setOf("late","soon")}
  val services=mobile.maintenance().objects().filter{myTruck(it.optString("vehicle"))}.filter{maintState(it).first in setOf("late","soon")}
  if(docs.isEmpty()&&services.isEmpty())return
  val c=card()
  val top=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(16),dp(14),dp(16),dp(6))}
  top.addView(iconView(R.drawable.ic_warning,amber,20));top.addView(tv("Para tener en cuenta",15.5f,ink,1).apply{setPadding(dp(10),0,0,0)});c.addView(top)
  val items=docs.map{Triple(it,true,day(it,"expires_on"))}+services.map{Triple(it,false,day(it,"due_on"))}
  items.sortedBy{it.third?:LocalDate.MAX}.take(4).forEach{(r,isDoc,_)->
   val who=if(r.optString("scope")=="driver")(if(r.optString("driver_id")==uid())"" else r.optString("driver_name").substringBefore(" ")) else truckLabel(r.optString("vehicle"))
   val (state,detail)=if(isDoc)docState(r) else maintState(r);val (label,fg,fill)=stateStyle(state,if(isDoc)"Por vencer" else "Próximo")
   row(c,if(isDoc)paperIcon(r.optString("kind")) else kindIcon(r.optString("kind")),listOf(r.optString("kind"),who).filter{it.isNotBlank()}.joinToString(" · "),detail,trailing=pill(label,fg,fill),tint=fg){if(isDoc)documents(true) else maintenance(true)}}
 }
 private fun maintenance(refresh:Boolean=false){
  page("maintenance");bar("Mantenimiento",back={homeOrTrip()},trailing=plusButton("Agregar service"){editMaintenance(null)})
  val (model,plate)=truckParts(maintTruck)
  row(card(),R.drawable.ic_truck,if(maintTruck.isBlank())"Todos los camiones" else model,if(maintTruck.isBlank())"Tocá para ver un solo camión" else if(plate.isNotBlank())"Matrícula $plate" else null,trailing=tv("Cambiar",14.5f,blue,1)){
   val items=truckChoices();pick("¿Qué camión?",listOf("Todos los camiones")+items,maintTruck.ifBlank{"Todos los camiones"}){i->maintTruck=if(i==0)"" else items[i-1];maintenance()}}
  segmented(root,listOf("Todos","Pendientes","Hechos"),maintFilter){maintFilter=it;maintenance()}
  val rows=mobile.maintenance().objects().filter{maintTruck.isBlank()||sameTruck(it.optString("vehicle"),maintTruck)}
   .filter{when(maintFilter){1->day(it,"done_on")==null;2->day(it,"done_on")!=null;else->true}}
   .sortedWith(compareBy<JSONObject>({day(it,"done_on")!=null},{day(it,"due_on")?:LocalDate.MAX}).thenByDescending{day(it,"done_on")?:LocalDate.MIN})
  if(rows.isEmpty())emptyCard(R.drawable.ic_wrench,if(maintFilter==2)"Sin services hechos" else "Sin services cargados","Tocá + para cargar un service hecho o uno que hay que hacer.")
  else{val c=card();rows.forEach{maintenanceRow(c,it)}}
  note("Los pendientes se marcan como próximos 15 días antes de la fecha.",top=12)
  if(refresh)thread{try{mobile.maintenance(true);runOnUiThread{if(screen=="maintenance")maintenance()}}catch(_:Exception){runOnUiThread{if(screen=="maintenance")toast("Sin conexión. Se muestran los datos guardados en el teléfono.")}}}
 }
 /** Whole kilometres of a service as Uruguay writes them («412.500»), or null when it has none. */
 private fun kmOf(r:JSONObject,key:String)=r.optString(key).takeIf{it.isNotBlank()&&it!="null"}?.toDoubleOrNull()?.toLong()?.let{NumberFormat.getIntegerInstance(uy).format(it)}
 private fun maintenanceRow(c:LinearLayout,r:JSONObject){
  if(c.childCount>0)divider(c,70)
  val (state,detail)=maintState(r);val (label,fg,fill)=stateStyle(state,"Próximo")
  val km=kmOf(r,"odometer_km")?.let{"$it km"}
  // The panel also schedules services by kilometres (it estimates the truck's with the GPS): «a los 412.500 km», «cada 10.000 km».
  val dueKm=kmOf(r,"due_km")?.takeIf{day(r,"done_on")==null}
  val sub=listOfNotNull(detail.takeUnless{state=="pending"&&dueKm!=null},if(maintTruck.isBlank())truckLabel(r.optString("vehicle")).ifBlank{null} else null,km,dueKm?.let{"a los $it km"},kmOf(r,"interval_km")?.let{"cada $it km"}).joinToString(" · ").replaceFirstChar{it.uppercase(uy)}
  val v=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(14),dp(12),dp(14),dp(12));background=ripple(null);isClickable=true;isFocusable=true;contentDescription="${r.optString("kind")}. $sub. $label";setOnClickListener{openMaintenance(r)}}
  v.addView(square(kindIcon(r.optString("kind")),tone(0xFF56647B,0xFFB4C0D3),greyBg))
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,dp(8),0)}
  col.addView(tv(r.optString("kind"),15.5f,ink,1).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END});col.addView(tv(sub,13f,muted).apply{maxLines=2;setPadding(0,dp(3),0,0)})
  v.addView(col,LinearLayout.LayoutParams(0,-2,1f));v.addView(pill(label,fg,fill))
  c.addView(v,LinearLayout.LayoutParams(-1,-2))
 }
 private fun openMaintenance(r:JSONObject){
  if(isOwner()||r.optString("created_by")==uid()){editMaintenance(r);return}
  val lines=listOfNotNull(r.optString("vehicle").ifBlank{null},maintState(r).second,kmOf(r,"odometer_km")?.let{"Kilometraje: $it km"},kmOf(r,"due_km")?.takeIf{day(r,"done_on")==null}?.let{"A los $it km"},kmOf(r,"interval_km")?.let{"Cada $it km"},r.optString("notes").ifBlank{null},r.optString("created_by_name").ifBlank{null}?.let{"Cargado por $it"})
  AlertDialog.Builder(this).setTitle(r.optString("kind")).setMessage(lines.joinToString("\n")).setPositiveButton("Cerrar",null).show()
 }
 private fun editMaintenance(r:JSONObject?){editId=r?.optString("id");editForm=if(r==null)JSONObject().put("vehicle",maintTruck.ifBlank{truck}).put("done",false) else JSONObject(r.toString()).put("done",day(r,"done_on")!=null);maintForm()}
 private fun maintForm(){
  page("maintform");bar(if(editId==null)"Nuevo service" else "Editar service",back={maintenance()})
  val done=editForm.optBoolean("done")
  val c=card(pad=16)
  select(c,"Camión",editForm,"vehicle",truckChoices())
  select(c,"Tipo de service",editForm,"kind",serviceKinds){maintForm()};bound(c,"Otro tipo · si no está en la lista",editForm,"kind")
  val s=card(pad=16);text(s,"¿Ya se hizo?",16.5f,ink,1)
  radio(s,"Todavía no",!done){editForm.put("done",false);maintForm()}
  radio(s,"Sí, ya se hizo",done){editForm.put("done",true);if(day(editForm,"done_on")==null)editForm.put("done_on",LocalDate.now().toString());maintForm()}
  if(done)dateField(s,"Fecha en que se hizo",editForm,"done_on"){maintForm()} else dateField(s,"Fecha prevista · opcional",editForm,"due_on"){maintForm()}
  val d=card(pad=16);bound(d,"Kilometraje del camión · opcional",editForm,"odometer_km",true,"Ej. 412380");bound(d,"Notas · opcional",editForm,"notes",hint="Taller, repuestos, costo…")
  dock.visibility=View.VISIBLE
  button(dock,"Guardar service",top=0){
   val vehicle=editForm.optString("vehicle").trim();val kind=editForm.optString("kind").trim()
   if(vehicle.isBlank()){toast("Elegí el camión");return@button};if(kind.isBlank()){toast("Indicá el tipo de service");return@button}
   val rawKm=editForm.optString("odometer_km").takeUnless{it=="null"}.orEmpty().replace(".","").replace(",","").trim()
   val km=if(rawKm.isBlank())null else rawKm.toIntOrNull()?.takeIf{it>=0}
   if(rawKm.isNotBlank()&&km==null){toast("Revisá el kilometraje");return@button}
   val row=JSONObject().put("vehicle",vehicle).put("kind",kind).put("due_on",dateValue(editForm,"due_on")).put("done_on",if(editForm.optBoolean("done"))(day(editForm,"done_on")?:LocalDate.now()).toString() else JSONObject.NULL).put("odometer_km",km?:JSONObject.NULL).put("notes",editForm.optString("notes").takeUnless{it=="null"}.orEmpty().trim())
   if(editId==null)row.put("created_by_name",name)
   saveOnline("trf_vehicle_maintenance",row,"Service guardado"){maintenance(true)}
  }
  if(editId!=null)link(dock,"Eliminar service",top=2,color=red){confirmDelete("trf_vehicle_maintenance","¿Eliminar este service?","Service eliminado"){maintenance(true)}}
 }
 private fun documents(refresh:Boolean=false){
  page("documents");bar("Documentos",back={homeOrTrip()},trailing=plusButton("Agregar documento"){editDocument(null)})
  val all=mobile.documents().objects().sortedWith(compareBy<JSONObject>{day(it,"expires_on")?:LocalDate.MAX})
  val mine=all.filter{it.optString("scope")=="driver"&&it.optString("driver_id")==uid()}
  val drivers=all.filter{it.optString("scope")=="driver"&&it.optString("driver_id")!=uid()}
  val papers=all.filter{it.optString("scope")=="vehicle"}
  if(!panelFirst()||mine.isNotEmpty()){section("Mis documentos");if(mine.isEmpty())emptyCard(R.drawable.ic_badge,"Sin documentos cargados","Tocá + para agregar tu licencia de conducir o tu carné de salud.") else {val c=card();mine.forEach{documentRow(c,it,false)}}}
  if(drivers.isNotEmpty()){section("Choferes");val c=card();drivers.forEach{documentRow(c,it,true)}}
  section("Camiones")
  if(papers.isEmpty())note(if(isOwner())"Todavía no hay documentos de camiones. Tocá + para agregar SOA, patente o habilitación MTOP." else "Todavía no hay documentos de camiones cargados.",top=8) else {val c=card();papers.forEach{documentRow(c,it,false)}}
  note("Se marcan en ámbar 30 días antes de vencer.",top=14)
  if(refresh)thread{try{mobile.documents(true);runOnUiThread{if(screen=="documents")documents()}}catch(_:Exception){runOnUiThread{if(screen=="documents")toast("Sin conexión. Se muestran los datos guardados en el teléfono.")}}}
 }
 private fun documentRow(c:LinearLayout,r:JSONObject,showDriver:Boolean){
  if(c.childCount>0)divider(c,70)
  val (state,detail)=docState(r);val (label,fg,fill)=stateStyle(state,"Por vencer")
  val owner=if(r.optString("scope")=="vehicle")truckParts(r.optString("vehicle")).let{listOf(it.first,it.second).filter{s->s.isNotBlank()}.joinToString(" · ")} else if(showDriver)r.optString("driver_name").ifBlank{"Chofer"} else ""
  val editable=isOwner()||(r.optString("scope")=="driver"&&r.optString("driver_id")==uid())
  val sub=listOf(owner,detail).filter{it.isNotBlank()}.joinToString(" · ")
  val v=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(14),dp(12),dp(14),dp(12));contentDescription="${r.optString("kind")}. $sub. $label";if(editable){background=ripple(null);isClickable=true;isFocusable=true;setOnClickListener{editDocument(r)}}}
  v.addView(square(paperIcon(r.optString("kind")),blue,blueSoft))
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,dp(8),0)}
  col.addView(tv(r.optString("kind"),15.5f,ink,1).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END});col.addView(tv(sub,13f,muted).apply{maxLines=2;setPadding(0,dp(3),0,0)})
  v.addView(col,LinearLayout.LayoutParams(0,-2,1f));v.addView(pill(label,fg,fill))
  c.addView(v,LinearLayout.LayoutParams(-1,-2))
 }
 private fun editDocument(r:JSONObject?){editId=r?.optString("id");editForm=if(r==null)JSONObject().put("scope","driver") else JSONObject(r.toString());paperForm()}
 private fun paperForm(){
  page("docform");bar(if(editId==null)"Nuevo documento" else "Editar documento",back={documents()})
  val vehicle=editForm.optString("scope")=="vehicle";val other=!vehicle&&editForm.optBoolean("other");val c=card(pad=16)
  if(isOwner()&&editId==null){text(c,"¿De quién es?",16.5f,ink,1)
   radio(c,"Mío",!vehicle&&!other){editForm.put("scope","driver").put("other",false);paperForm()}
   radio(c,"De un chofer",other){editForm.put("scope","driver").put("other",true);paperForm();if(editForm.optString("driver_id").isBlank())pickDriver()}
   radio(c,"De un camión",vehicle){editForm.put("scope","vehicle").put("other",false);paperForm()}}
  if(vehicle)select(c,"Camión",editForm,"vehicle",truckChoices())
  if(other)driverField(c)
  select(c,"Tipo de documento",editForm,"kind",if(vehicle)listOf("SOA / Seguro","Patente","Habilitación MTOP") else listOf("Licencia de conducir","Carné de salud")){paperForm()}
  bound(c,"Otro tipo · si no está en la lista",editForm,"kind")
  dateField(c,"Fecha de vencimiento",editForm,"expires_on"){paperForm()}
  bound(c,"Notas · opcional",editForm,"notes",hint="Número, categoría, aseguradora…")
  dock.visibility=View.VISIBLE
  button(dock,"Guardar documento",top=0){
   val kind=editForm.optString("kind").trim();val truckName=editForm.optString("vehicle").trim()
   if(kind.isBlank()){toast("Indicá el tipo de documento");return@button};if(vehicle&&truckName.isBlank()){toast("Elegí el camión");return@button}
   if(other&&editForm.optString("driver_id").isBlank()){toast("Elegí el chofer");return@button}
   val row=JSONObject().put("kind",kind).put("expires_on",dateValue(editForm,"expires_on")).put("notes",editForm.optString("notes").takeUnless{it=="null"}.orEmpty().trim())
   if(vehicle)row.put("vehicle",truckName)
   if(editId==null){row.put("scope",if(vehicle)"vehicle" else "driver");if(other)row.put("driver_id",editForm.optString("driver_id")).put("driver_name",editForm.optString("driver_name")) else if(!vehicle)row.put("driver_name",name)}
   saveOnline("trf_documents",row,"Documento guardado"){documents(true)}
  }
  if(editId!=null)link(dock,"Eliminar documento",top=2,color=red){confirmDelete("trf_documents","¿Eliminar este documento?","Documento eliminado"){documents(true)}}
 }
 /** Owner only: the driver a new paper is for. */
 private fun driverField(c:LinearLayout){
  caption(c,"Chofer");val current=editForm.optString("driver_name").takeUnless{it.isBlank()||it=="null"}
  c.addView(tv(current?:"Elegir chofer",16f,if(current==null)faint else ink).apply{gravity=Gravity.CENTER_VERTICAL;background=ripple(outline(fieldFill,fieldLine,14));setPadding(dp(14),0,dp(14),0);setCompoundDrawablesRelative(null,null,tinted(R.drawable.ic_expand,muted),null);isClickable=true;isFocusable=true;contentDescription="Chofer: ${current?:"sin elegir"}";setOnClickListener{pickDriver()}},LinearLayout.LayoutParams(-1,dp(52)).apply{topMargin=dp(6)})
 }
 /** Drivers with trips, plus the ones that only have papers, by name; the owner is left out ("Mío" is for that). */
 private fun pickDriver(){
  toast("Buscando choferes…")
  thread{val found=try{mobile.drivers()}catch(_:Exception){null}
   runOnUiThread{if(screen!="docform")return@runOnUiThread
    val known=LinkedHashMap<String,String>();found?.forEach{(id,n)->known[id]=n}
    mobile.documents().objects().filter{it.optString("scope")=="driver"}.forEach{val id=it.optString("driver_id");val n=it.optString("driver_name").trim();if(id.isNotBlank()&&n.isNotBlank()&&id !in known)known[id]=n}
    known.remove(uid())
    if(known.isEmpty()){toast(if(found==null)"Sin conexión. Probá de nuevo cuando tengas señal." else "Todavía no hay choferes con viajes.");return@runOnUiThread}
    val list=known.entries.sortedBy{it.value.lowercase(uy)}
    pick("¿De qué chofer?",list.map{it.value},editForm.optString("driver_name")){i->editForm.put("driver_id",list[i].key).put("driver_name",list[i].value);paperForm()}}}
 }

 // ---------- Formatting ----------
 private fun instant(s:String?):Instant?=if(s.isNullOrBlank()||s=="null")null else try{Instant.parse(s)}catch(_:Exception){try{OffsetDateTime.parse(s).toInstant()}catch(_:Exception){null}}
 private fun zoned(s:String?)=instant(s)?.atZone(ZoneId.systemDefault())
 private fun date(s:String)=zoned(s)?.format(DateTimeFormatter.ofPattern("dd/MM/yyyy · HH:mm"))?:s
 private fun km(m:Double)=String.format(uy,"%.1f km",m/1000)
 private fun litre(v:Double)=if(v%1.0==0.0)"${NumberFormat.getIntegerInstance(uy).format(Math.round(v))} L" else String.format(uy,"%.1f L",v)
 private fun money(v:Double)=NumberFormat.getIntegerInstance(uy).format(Math.round(v))
 private fun elapsedText(start:String)=instant(start)?.let{val s=Duration.between(it,Instant.now()).seconds.coerceAtLeast(0);String.format(Locale.US,"%02d:%02d:%02d",s/3600,(s/60)%60,s%60)}?:"--:--:--"
 private fun durationText(a:String,b:String):String?{val x=instant(a)?:return null;val y=instant(b)?:return null;val m=Duration.between(x,y).toMinutes();return if(m>=60)"${m/60} h ${m%60} min" else "$m min"}
 private fun ago(ms:Long):String{val m=(System.currentTimeMillis()-ms)/60000;return when{m<1->"recién";m<60->"hace $m min";m<1440->"hace ${m/60} h";else->"hace ${m/1440} d"}}

 private fun showPhoto(r:JSONObject,bucket:String){
  toast("Abriendo foto…");thread{try{val local=r.optString("local_path").takeIf{it.isNotBlank()}?.let{File(it)};val bytes=if(local?.exists()==true)local.readBytes() else mobile.photo(r.getString("object_path"),bucket);val bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.size)?:error("Imagen no disponible");runOnUiThread{val image=ImageView(this).apply{setImageBitmap(bitmap);adjustViewBounds=true;contentDescription="Comprobante adjunto"};AlertDialog.Builder(this).setView(image).setPositiveButton("Cerrar",null).show()}}catch(_:Exception){runOnUiThread{toast("No se pudo abrir la foto. Revisá la conexión.")}}}
 }
 private fun preparePhoto(uri:Uri){val job=++photoJob;val target=photoMode;photoBusy=true;toast("Preparando foto…");thread{try{
  val original=File(cacheDir,"receipt-original-${UUID.randomUUID()}");contentResolver.openInputStream(uri)?.use{input->original.outputStream().use{out->val buf=ByteArray(8192);var total=0L;while(true){val n=input.read(buf);if(n<0)break;total+=n;check(total<=40*1024*1024);out.write(buf,0,n)}}}?:error("Sin imagen")
  val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(original.path,bounds);var sample=1;while(max(bounds.outWidth,bounds.outHeight)/sample>2400)sample*=2;val bitmap=BitmapFactory.decodeFile(original.path,BitmapFactory.Options().apply{inSampleSize=sample})?:error("Formato no compatible");val exif=ExifInterface(original);val matrix=Matrix();matrix.postRotate(exif.rotationDegrees.toFloat());if(exif.isFlipped)matrix.postScale(-1f,1f);val rotated=Bitmap.createBitmap(bitmap,0,0,bitmap.width,bitmap.height,matrix,true);val out=File(File(filesDir,"draft-photos").apply{mkdirs()},"receipt-${UUID.randomUUID()}.jpg");out.outputStream().use{rotated.compress(Bitmap.CompressFormat.JPEG,88,it)};if(rotated!==bitmap)rotated.recycle();bitmap.recycle();original.delete();check(out.length()<=10*1024*1024);runOnUiThread{if(job==photoJob){photoBusy=false;photo=out;if(screen==target){if(target=="document")document() else fuel()}}else out.delete()}
 }catch(_:Exception){runOnUiThread{if(job==photoJob)photoBusy=false;toast("No se pudo preparar la foto. Probá con otra imagen.")}}}}
 // The sample view has no network: the notices that say so would cover its screenshots.
 private fun toast(s:String){if(Api.sample==null)Toast.makeText(this,s,Toast.LENGTH_LONG).show()}
}
