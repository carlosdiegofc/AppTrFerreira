package uy.transportesferreira.gps
import android.Manifest
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
import android.location.Geocoder
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.text.Editable
import android.text.InputType
import android.text.TextUtils
import android.text.TextWatcher
import android.view.*
import android.view.inputmethod.EditorInfo
import android.widget.*
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
class MainActivity:AppCompatActivity(){
 // Palette: light value first, dark value second.
 private val dark by lazy{(resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK)==Configuration.UI_MODE_NIGHT_YES}
 private fun tone(light:Long,night:Long)=(if(dark)night else light).toInt()
 private val barBg by lazy{tone(0xFF0F2142,0xFF0A1730)}
 private val blue by lazy{tone(0xFF1663E8,0xFF5B9BFF)}
 private val blueSoft by lazy{tone(0xFFE8F0FE,0xFF1B2B4A)}
 private val appBg by lazy{tone(0xFFEEF2F7,0xFF0D1422)}
 private val cardBg by lazy{tone(0xFFFFFFFF,0xFF172133)}
 private val ink by lazy{tone(0xFF111C2E,0xFFE8EEF7)}
 private val muted by lazy{tone(0xFF67758B,0xFF9AA8BE)}
 private val faint by lazy{tone(0xFF9AA5B6,0xFF6C7A90)}
 private val line by lazy{tone(0xFFE5EAF1,0xFF253047)}
 private val fieldLine by lazy{tone(0xFFD5DDE8,0xFF33415A)}
 private val green by lazy{tone(0xFF178A4C,0xFF4CC58A)}
 private val greenBg by lazy{tone(0xFFDEF3E6,0xFF143826)}
 private val amber by lazy{tone(0xFFB06A00,0xFFF2B25C)}
 private val amberBg by lazy{tone(0xFFFFEFD3,0xFF3A2A10)}
 private val red by lazy{tone(0xFFE0393E,0xFFF0575C)}
 private val grey by lazy{tone(0xFF8F9BAD,0xFF6C7A90)}
 private val greyBg by lazy{tone(0xFFEDF0F5,0xFF222C3E)}
 private val press by lazy{tone(0x1F0F2142,0x33FFFFFF)}
 private val medium by lazy{Typeface.create("sans-serif-medium",Typeface.NORMAL)}
 private val uy=Locale("es","UY")
 private val loginBg=0xFF0A1220.toInt()
 private enum class Kind{PRIMARY,DANGER,LINE,SOFT,LINE_DANGER}
 private class Btn(val view:LinearLayout,val label:TextView){fun enable(v:Boolean){view.isEnabled=v;view.alpha=if(v)1f else .5f}}
 private class Tile(val icon:Int,val title:String,val sub:String?,val action:()->Unit)
 private class Fact(val icon:Int,val label:String,val value:String)
 private class FleetItem(val model:String,val plate:String,val driver:String,val state:String,val speed:Double,val meters:Double,val lat:Double,val lng:Double,val at:Long?,val session:JSONObject?)

 private lateinit var shell:LinearLayout
 private lateinit var head:LinearLayout
 private lateinit var root:LinearLayout
 private lateinit var dock:LinearLayout
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
 private var activeMap:android.webkit.WebView?=null;private var liveMap:TripMap.Live?=null;private var trackOffset=0L
 private val trucks=listOf("Ford Cargo 1722","Mercedes-Benz 1618","Leyland","Mercedes-Benz 1630")
 // Accounts that open on the fleet panel instead of the driver home.
 private val ownerEmails=setOf("luis@trferreira.com","transportesferreirauy@gmail.com")
 private fun isOwner()=(api.session()?.optJSONObject("user")?.optString("email")?.lowercase()?:"") in ownerEmails
 private fun uid()=api.session()?.optJSONObject("user")?.optString("id")?:""
 private fun prefs()=getSharedPreferences("gps",MODE_PRIVATE)
 private fun active()=store.current()?.optBoolean("active")==true

 private val permissions=registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){
  if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED){if(active())try{service()}catch(_:Exception){};homeOrTrip()}
  else AlertDialog.Builder(this).setTitle("Activá la ubicación precisa").setMessage("El cuentakilómetros necesita ubicación precisa. Habilitala en los permisos de la app.").setPositiveButton("Abrir ajustes"){_,_->startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")))}.setNegativeButton("Ahora no",null).show()
 }
 private val take=registerForActivityResult(ActivityResultContracts.TakePicture()){ok->if(ok)camera?.let{preparePhoto(Uri.fromFile(it))}else camera?.delete()}
 private val pick=registerForActivityResult(ActivityResultContracts.GetContent()){uri->if(uri!=null)preparePhoto(uri)}

 override fun onCreate(b:Bundle?){super.onCreate(b);store=TripStore(this);api=Api(this)
  WindowCompat.setDecorFitsSystemWindows(window,false);transparentBars()
  tripForm=JSONObject(b?.getString("tripForm")?:"{}");fuelForm=JSONObject(b?.getString("fuelForm")?:"{}");docForm=JSONObject(b?.getString("docForm")?:"{}");draftDocs=JSONArray(b?.getString("draftDocs")?:"[]")
  fuelTrip=b?.getString("fuelTrip")?.let{JSONObject(it)};docTrip=b?.getString("docTrip")?.let{JSONObject(it)};historyTrip=b?.getString("historyTrip")?.let{JSONObject(it)};photoMode=b?.getString("photoMode")?:"fuel";docReturn=b?.getString("docReturn")?:"prepare"
  camera=b?.getString("camera")?.let{File(it)};photo=b?.getString("photo")?.let{File(it)}?.takeIf{it.exists()};truck=b?.getString("truck")?:prefs().getString("truck","")?:"";empty=b?.getBoolean("empty")?:false
  if(api.session()==null)login() else {name=driverName();when(b?.getString("screen")){"fuel"->fuel();"document"->document();"prepare"->prepare();"newtrip"->newTrip();else->homeOrTrip()};Sync.schedule(this);refreshCatalog()}
 }
 @Suppress("DEPRECATION") private fun transparentBars(){window.statusBarColor=Color.TRANSPARENT;window.navigationBarColor=Color.TRANSPARENT}
 override fun onSaveInstanceState(b:Bundle){super.onSaveInstanceState(b);b.putString("camera",camera?.path);b.putString("photo",photo?.path);b.putString("screen",screen);b.putString("truck",truck);b.putBoolean("empty",empty);b.putString("tripForm",tripForm.toString());b.putString("fuelForm",fuelForm.toString());b.putString("docForm",docForm.toString());b.putString("draftDocs",draftDocs.toString());b.putString("fuelTrip",fuelTrip?.toString());b.putString("docTrip",docTrip?.toString());b.putString("historyTrip",historyTrip?.toString());b.putString("photoMode",photoMode);b.putString("docReturn",docReturn)}
 override fun onStart(){super.onStart();handler.post(tick)}
 override fun onDestroy(){photoJob++;activeMap?.destroy();activeMap=null;super.onDestroy()}
 override fun onStop(){handler.removeCallbacks(tick);super.onStop()}
 @Deprecated("Deprecated in Java") override fun onBackPressed(){when(screen){
  "fuel"->homeOrTrip()
  "document"->backFromDocument()
  "prepare"->newTrip()
  "newtrip","trip"->home()
  "triphistory","fuelhistory","settings"->if(isOwner())ownerDashboard() else home()
  "tripdetail"->history("trips")
  else->super.onBackPressed()
 }}
 private fun refreshCatalog(){thread{try{mobile.catalog(true);runOnUiThread{if(screen=="prepare")prepare() else if(screen=="newtrip")newTrip()}}catch(_:Exception){}}}

 // ---------- Building blocks ----------
 private fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
 private fun dpf(n:Float)=n*resources.displayMetrics.density
 private fun bg(color:Int,r:Int=12)=GradientDrawable().apply{setColor(color);cornerRadius=dpf(r.toFloat())}
 private fun outline(color:Int,edge:Int,r:Int=12)=GradientDrawable().apply{setColor(color);cornerRadius=dpf(r.toFloat());setStroke(dp(1),edge)}
 private fun oval(color:Int)=GradientDrawable().apply{shape=GradientDrawable.OVAL;setColor(color)}
 private fun ripple(content:Drawable?,tint:Int=press):Drawable=RippleDrawable(ColorStateList.valueOf(tint),content,if(content==null)ColorDrawable(Color.WHITE) else null)
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
  val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=bg(cardBg,16);elevation=dpf(1.5f);clipToOutline=true;setPadding(dp(pad),dp(pad),dp(pad),dp(pad))}
  p.addView(v,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(top)});return v
 }
 private fun square(res:Int,color:Int,fill:Int,size:Int=40,inner:Int=22)=FrameLayout(this).apply{background=bg(fill,11);addView(ImageView(this@MainActivity).apply{setImageResource(res);imageTintList=ColorStateList.valueOf(color)},FrameLayout.LayoutParams(dp(inner),dp(inner),Gravity.CENTER));importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO_HIDE_DESCENDANTS;layoutParams=LinearLayout.LayoutParams(dp(size),dp(size))}
 private fun pill(s:String,fg:Int,fill:Int)=tv(s,12f,fg,1).apply{background=bg(fill,7);setPadding(dp(9),dp(4),dp(9),dp(5));layoutParams=LinearLayout.LayoutParams(-2,-2)}
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
 private fun button(p:LinearLayout,s:String,kind:Kind=Kind.PRIMARY,icon:Int?=null,top:Int=12,action:()->Unit):Btn{
  val solid=kind==Kind.PRIMARY||kind==Kind.DANGER
  val fill=when(kind){Kind.PRIMARY->blue;Kind.DANGER->red;Kind.SOFT->blueSoft;else->cardBg}
  val fg=when(kind){Kind.PRIMARY,Kind.DANGER->Color.WHITE;Kind.LINE_DANGER->red;else->blue}
  val shape=when(kind){Kind.LINE->outline(fill,tone(0xFFC9D8F6,0xFF35507E),14);Kind.LINE_DANGER->outline(fill,tone(0xFFF3C5C7,0xFF6A2C30),14);else->bg(fill,14)}
  val v=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER;background=ripple(shape,if(solid)0x40FFFFFF else press);isClickable=true;isFocusable=true;contentDescription=s;setPadding(dp(16),0,dp(16),0);if(solid)elevation=dpf(2f)}
  if(icon!=null)v.addView(iconView(icon,fg,20).apply{(layoutParams as LinearLayout.LayoutParams).marginEnd=dp(10)})
  val label=tv(s,16f,fg,1).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END};v.addView(label)
  v.setOnClickListener{action()};p.addView(v,LinearLayout.LayoutParams(-1,dp(54)).apply{topMargin=dp(top)});return Btn(v,label)
 }
 private fun link(p:LinearLayout,s:String,top:Int=8,action:()->Unit)=tv(s,15f,blue,1).apply{gravity=Gravity.CENTER;minHeight=dp(48);background=ripple(null);isClickable=true;isFocusable=true;setOnClickListener{action()};p.addView(this,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(top)})}
 private fun input(type:Int,hint:String="")=EditText(this).apply{inputType=type;textSize=16f;setTextColor(ink);setHintTextColor(faint);this.hint=hint;background=outline(cardBg,fieldLine,12);setPadding(dp(14),0,dp(14),0)}
 private fun field(p:LinearLayout,title:String,type:Int,hint:String=""):EditText{caption(p,title);val e=input(type,hint);p.addView(e,LinearLayout.LayoutParams(-1,dp(52)).apply{topMargin=dp(6)});return e}
 private fun bind(v:EditText,data:JSONObject,key:String){
  v.setText(data.optString(key).takeUnless{it=="null"}?:"")
  v.addTextChangedListener(object:TextWatcher{override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){};override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){data.put(key,s.toString())};override fun afterTextChanged(e:Editable?){}})
 }
 private fun bound(c:LinearLayout,title:String,data:JSONObject,key:String,number:Boolean=false,hint:String=""):EditText{val v=field(c,title,if(number)InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL else InputType.TYPE_CLASS_TEXT,hint);bind(v,data,key);return v}
 private fun spinnerAdapter(items:List<String>)=object:ArrayAdapter<String>(this,android.R.layout.simple_spinner_item,items){
  override fun getView(position:Int,convertView:View?,parent:ViewGroup):View=(super.getView(position,convertView,parent) as TextView).apply{setTextColor(ink);textSize=16f;setPadding(dp(14),0,dp(40),0);maxLines=1;ellipsize=TextUtils.TruncateAt.END}
 }.apply{setDropDownViewResource(android.R.layout.simple_spinner_dropdown_item)}
 private fun spinnerBg():Drawable=LayerDrawable(arrayOf(outline(cardBg,fieldLine,12),getDrawable(R.drawable.ic_expand)!!.mutate().apply{setTint(muted)})).apply{setLayerGravity(1,Gravity.END or Gravity.CENTER_VERTICAL);setLayerInsetEnd(1,dp(12));setLayerSize(1,dp(22),dp(22))}
 private fun select(c:LinearLayout,title:String,data:JSONObject,key:String,values:List<String>,changed:(String)->Unit={}){
  caption(c,title);val options=listOf("Sin seleccionar")+(values+data.optString(key)).distinct().filter{it.isNotBlank()}
  val spinner=Spinner(this).apply{adapter=spinnerAdapter(options);background=spinnerBg()};c.addView(spinner,LinearLayout.LayoutParams(-1,dp(52)).apply{topMargin=dp(6)})
  spinner.setSelection(options.indexOf(data.optString(key)).coerceAtLeast(0));spinner.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,pos:Int,id:Long){val next=if(pos==0)"" else options[pos];val previous=data.optString(key);data.put(key,next);if(previous!=next)changed(next)}}
 }
 private fun radio(p:LinearLayout,title:String,selected:Boolean,action:()->Unit){
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;minimumHeight=dp(56);setPadding(dp(14),dp(8),dp(14),dp(8));background=ripple(if(selected)outline(blueSoft,blue,12) else outline(cardBg,fieldLine,12));isClickable=true;isFocusable=true;contentDescription=title+if(selected)", elegido" else "";setOnClickListener{action()}}
  r.addView(if(selected)iconView(R.drawable.ic_check_circle,blue,24) else View(this).apply{background=GradientDrawable().apply{shape=GradientDrawable.OVAL;setStroke(dp(2),faint)};layoutParams=LinearLayout.LayoutParams(dp(22),dp(22)).apply{marginStart=dp(1);marginEnd=dp(1)}})
  r.addView(tv(title,15.5f,ink,1).apply{setPadding(dp(14),0,0,0)},LinearLayout.LayoutParams(0,-2,1f))
  p.addView(r,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(10)})
 }
 private fun segmented(p:LinearLayout,options:List<String>,selected:Int,top:Int=12,change:(Int)->Unit){
  val box=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;background=bg(tone(0xFFE1E7F0,0xFF1C2638),12);setPadding(dp(4),dp(4),dp(4),dp(4))}
  options.forEachIndexed{i,s->val on=i==selected;box.addView(tv(s,14f,if(on)Color.WHITE else muted,1).apply{gravity=Gravity.CENTER;background=if(on)bg(blue,9) else ripple(null);isClickable=true;isFocusable=true;contentDescription=s+if(on)", elegido" else "";setOnClickListener{if(!on)change(i)}},LinearLayout.LayoutParams(0,dp(40),1f))}
  p.addView(box,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(top)})
 }
 private fun searchBox(p:LinearLayout,hint:String,value:String):EditText{
  val box=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;background=outline(cardBg,fieldLine,12);setPadding(dp(14),0,dp(8),0)}
  box.addView(iconView(R.drawable.ic_search,faint,20))
  val e=EditText(this).apply{inputType=InputType.TYPE_CLASS_TEXT;imeOptions=EditorInfo.IME_ACTION_SEARCH;textSize=15.5f;setTextColor(ink);setHintTextColor(faint);this.hint=hint;background=null;setPadding(dp(10),0,dp(4),0);setText(value)}
  box.addView(e,LinearLayout.LayoutParams(0,-1,1f));p.addView(box,LinearLayout.LayoutParams(-1,dp(50)).apply{topMargin=dp(12)});return e
 }
 private fun tileGrid(items:List<Tile>){
  for(i in items.indices step 2){val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};root.addView(r,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(12)})
   for(j in i until minOf(i+2,items.size)){val t=items[j]
    val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=ripple(bg(cardBg,16));elevation=dpf(1.5f);setPadding(dp(16),dp(16),dp(12),dp(14));isClickable=true;isFocusable=true;contentDescription=t.title+(t.sub?.let{". $it"}?:"");setOnClickListener{t.action()}}
    v.addView(iconView(t.icon,blue,28));v.addView(tv(t.title,15.5f,ink,1).apply{setPadding(0,dp(12),0,0)});if(t.sub!=null)v.addView(tv(t.sub,13f,muted).apply{setPadding(0,dp(2),0,0)})
    r.addView(v,LinearLayout.LayoutParams(0,-1,1f).apply{if(j%2==1)marginStart=dp(12)})}}
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
 private fun kpi(p:LinearLayout,label:String,value:String,index:Int){
  val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=bg(cardBg,16);elevation=dpf(1.5f);setPadding(dp(16),dp(14),dp(12),dp(14))}
  v.addView(tv(label,13.5f,muted));v.addView(tv(value,22f,ink,2).apply{setPadding(0,dp(4),0,0);maxLines=1});v.contentDescription="$label: $value"
  p.addView(v,LinearLayout.LayoutParams(0,-2,1f).apply{if(index>0)marginStart=dp(12)})
 }
 private fun stat(p:LinearLayout,value:String,label:String,color:Int,index:Int){
  val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=bg(cardBg,16);elevation=dpf(1.5f);setPadding(dp(14),dp(12),dp(10),dp(12))}
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

 // ---------- Page frame: navy header, scrolling content, optional bottom dock and navigation ----------
 private fun page(key:String,header:Boolean=true){
  activeMap?.destroy();activeMap=null;liveMap=null;screen=key
  distance=null;speed=null;limit=null;status=null;statusBox=null;elapsed=null;sync=null;gps=null;count=null;pauseLabel=null;pauseIcon=null
  shell=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(appBg)}
  head=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(barBg);visibility=if(header)View.VISIBLE else View.GONE}
  shell.addView(head,LinearLayout.LayoutParams(-1,-2));topTarget=head
  val scroll=ScrollView(this).apply{isFillViewport=true;isVerticalScrollBarEnabled=false;overScrollMode=View.OVER_SCROLL_NEVER;setBackgroundColor(appBg)}
  root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),dp(6),dp(14),dp(24))}
  scroll.addView(root);shell.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
  dock=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),dp(10),dp(14),dp(12));setBackgroundColor(appBg);visibility=View.GONE}
  shell.addView(dock,LinearLayout.LayoutParams(-1,-2))
  setContentView(shell)
  ViewCompat.setOnApplyWindowInsetsListener(shell){v,i->val bars=i.getInsets(WindowInsetsCompat.Type.systemBars());val ime=i.getInsets(WindowInsetsCompat.Type.ime())
   topTarget?.let{it.setPadding(it.paddingLeft,bars.top,it.paddingRight,it.paddingBottom)}
   v.setPadding(bars.left,0,bars.right,max(bars.bottom,ime.bottom));i}
  WindowCompat.getInsetsController(window,window.decorView).apply{isAppearanceLightStatusBars=false;isAppearanceLightNavigationBars=!dark}
  shell.alpha=0f;shell.animate().alpha(1f).setDuration(160).start()
 }
 private fun barButton(res:Int,desc:String,action:()->Unit)=ImageView(this).apply{setImageResource(res);imageTintList=ColorStateList.valueOf(Color.WHITE);setPadding(dp(12),dp(12),dp(12),dp(12));background=RippleDrawable(ColorStateList.valueOf(0x33FFFFFF),null,null);contentDescription=desc;isClickable=true;isFocusable=true;setOnClickListener{action()};layoutParams=LinearLayout.LayoutParams(dp(48),dp(48))}
 private fun plusButton(desc:String,action:()->Unit)=ImageView(this).apply{setImageResource(R.drawable.ic_plus);imageTintList=ColorStateList.valueOf(Color.WHITE);setPadding(dp(7),dp(7),dp(7),dp(7));background=ripple(bg(0xFF1663E8.toInt(),10),0x40FFFFFF);contentDescription=desc;isClickable=true;isFocusable=true;setOnClickListener{action()};layoutParams=LinearLayout.LayoutParams(dp(38),dp(38)).apply{marginEnd=dp(8)}}
 private fun chip(s:String)=tv(s,13f,0xFFDCE6F8.toInt(),1).apply{background=bg(0x26FFFFFF,8);setPadding(dp(10),dp(5),dp(10),dp(6));layoutParams=LinearLayout.LayoutParams(-2,-2).apply{marginEnd=dp(10)}}
 private fun bar(title:String,back:(()->Unit)?=null,trailing:View?=null){
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(if(back==null)20 else 4),0,dp(6),0)}
  if(back!=null)r.addView(barButton(R.drawable.ic_back,"Volver",back))
  r.addView(tv(title,20f,Color.WHITE,1).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END;setPadding(dp(if(back==null)0 else 4),0,dp(8),0)},LinearLayout.LayoutParams(0,-2,1f))
  if(trailing!=null)r.addView(trailing)
  head.addView(r,LinearLayout.LayoutParams(-1,dp(60)))
 }
 private fun initials(s:String)=s.split(" ").filter{it.isNotBlank()}.take(2).joinToString(""){it.take(1).uppercase()}.ifBlank{"TF"}
 private fun hello(small:String,big:String,trailing:View?=null){
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(18),dp(8),dp(6),dp(18))}
  r.addView(tv(initials(name),15f,0xFFDCE6F8.toInt(),1).apply{gravity=Gravity.CENTER;background=GradientDrawable().apply{shape=GradientDrawable.OVAL;setColor(0xFF2A3E66.toInt());setStroke(dp(1),0x33FFFFFF)};importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO},LinearLayout.LayoutParams(dp(46),dp(46)))
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,dp(8),0)}
  col.addView(tv(small,14f,0xFFAFBCD3.toInt()));col.addView(tv(big,21f,Color.WHITE,1).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END})
  r.addView(col,LinearLayout.LayoutParams(0,-2,1f));if(trailing!=null)r.addView(trailing)
  head.addView(r,LinearLayout.LayoutParams(-1,-2))
 }
 private fun navBar(active:String){
  val items=listOf(if(isOwner())Triple("owner",R.drawable.ic_map,"Flota") else Triple("home",R.drawable.ic_home,"Inicio"),Triple("trips",R.drawable.ic_route,"Viajes"),Triple("fuel",R.drawable.ic_fuel,"Combustible"),Triple("more",R.drawable.ic_more,"Más"))
  shell.addView(View(this).apply{setBackgroundColor(line)},LinearLayout.LayoutParams(-1,1))
  val nav=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;setBackgroundColor(cardBg)}
  for((key,res,label) in items){val on=key==active;val color=if(on)blue else muted
   val item=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;background=RippleDrawable(ColorStateList.valueOf(press),null,null);isClickable=true;isFocusable=true;isSelected=on;contentDescription=label;setOnClickListener{if(!on)go(key)}}
   item.addView(iconView(res,color,24));item.addView(tv(label,12f,color,if(on)1 else 0).apply{setPadding(0,dp(3),0,0)})
   nav.addView(item,LinearLayout.LayoutParams(0,dp(64),1f))}
  shell.addView(nav,LinearLayout.LayoutParams(-1,-2));shell.setBackgroundColor(cardBg)
 }
 private fun go(key:String){when(key){"home"->home();"owner"->ownerDashboard();"trips"->history("trips",true);"fuel"->history("fuel",true);else->settings()}}

 // ---------- Login ----------
 private fun login(){
  page("login",header=false);shell.setBackgroundColor(loginBg);(root.parent as View).setBackgroundColor(loginBg);root.setPadding(0,0,0,dp(28))
  WindowCompat.getInsetsController(window,window.decorView).isAppearanceLightNavigationBars=false
  val hero=FrameLayout(this)
  hero.addView(ImageView(this).apply{setImageResource(R.drawable.login_scene);scaleType=ImageView.ScaleType.CENTER_CROP;importantForAccessibility=View.IMPORTANT_FOR_ACCESSIBILITY_NO},FrameLayout.LayoutParams(-1,-1))
  val top=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL}
  top.addView(ImageView(this).apply{setImageResource(R.drawable.tr_ferreira_logo);adjustViewBounds=true;contentDescription="TR Ferreira"},LinearLayout.LayoutParams(dp(240),-2).apply{topMargin=dp(36)})
  hero.addView(top,FrameLayout.LayoutParams(-1,-2));topTarget=top
  root.addView(hero,LinearLayout.LayoutParams(-1,dp(400)))
  val form=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(24),0,dp(24),0)};root.addView(form,LinearLayout.LayoutParams(-1,-2))
  text(form,"Tu viaje empieza acá.",27f,Color.WHITE,2)
  text(form,"Ingresá con tu cuenta de chofer.",15.5f,0xFFA9B6CC.toInt(),0,6)
  val email=darkField(form,R.drawable.ic_mail,"Correo electrónico",InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS,22);email.setText(prefs().getString("email",""))
  val pass=darkField(form,R.drawable.ic_lock,"Contraseña",InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD,12)
  val msg=text(form,"",14f,0xFFFFB4B4.toInt(),0,10)
  lateinit var submit:Btn
  submit=button(form,"Ingresar",top=6){val e=email.text.toString().trim().lowercase();val p=pass.text.toString();if(e.isBlank()||p.isBlank()){msg.text="Completá correo y contraseña";return@button};submit.enable(false);msg.setTextColor(0xFFA9B6CC.toInt());msg.text="Ingresando…"
   thread{try{api.login(e,p);name=driverName();runOnUiThread{pass.text.clear();homeOrTrip();Sync.schedule(this);refreshCatalog()}}catch(_:Exception){runOnUiThread{submit.enable(true);msg.setTextColor(0xFFFFB4B4.toInt());msg.text="No se pudo ingresar. Revisá tus datos y la conexión."}}}}
  text(form,"Tu sesión queda guardada de forma segura en este teléfono.",13f,0xFF8E9CB4.toInt(),0,18).gravity=Gravity.CENTER
 }
 private fun darkField(p:LinearLayout,icon:Int,hint:String,type:Int,top:Int):EditText{
  val box=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;background=outline(0xB30F1A2E.toInt(),0x47FFFFFF,12);setPadding(dp(16),0,dp(8),0)}
  box.addView(iconView(icon,0xFFB9C4D6.toInt(),20))
  val e=EditText(this).apply{inputType=type;textSize=16f;setTextColor(Color.WHITE);setHintTextColor(0xFF8E9CB4.toInt());this.hint=hint;background=null;setPadding(dp(12),0,dp(4),0)}
  box.addView(e,LinearLayout.LayoutParams(0,-1,1f));p.addView(box,LinearLayout.LayoutParams(-1,dp(56)).apply{topMargin=dp(top)});return e
 }
 private fun driverName():String{val u=api.session()?.optJSONObject("user")?:return "Chofer";val m=u.optJSONObject("user_metadata");val known=mapOf("immer@trferreira.com" to "Immer Sampayo","luis@trferreira.com" to "Luis Ferreira","hugo@trferreira.com" to "Hugo Silva","transportesferreirauy@gmail.com" to "Transportes Ferreira");return m?.optString("full_name")?.takeIf{it.isNotBlank()}?:m?.optString("name")?.takeIf{it.isNotBlank()}?:known[u.optString("email").lowercase()]?:u.optString("email").substringBefore("@").replaceFirstChar{it.uppercase()}}
 private fun homeOrTrip(){if(isOwner())ownerDashboard() else if(active())trip() else home()}

 // ---------- Driver home ----------
 private fun home(){
  page("home");hello("Bienvenido",name,barButton(R.drawable.ic_sync,"Enviar pendientes y actualizar"){syncNow()})
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
  tileGrid(listOf(
   Tile(R.drawable.ic_route,"Nuevo viaje",null){if(active()){toast("Ya tenés un viaje en curso");trip()}else{tripForm=JSONObject();draftDocs=JSONArray();empty=false;newTrip()}},
   Tile(R.drawable.ic_navigation,"Viaje activo",if(running)"En curso" else "Sin viaje"){if(active())trip() else toast("No hay un viaje en curso. Tocá «Nuevo viaje» para empezar.")},
   Tile(R.drawable.ic_fuel,"Cargar combustible",null){fuelChoice()},
   Tile(R.drawable.ic_receipt,"Remitos",null){if(active())openDocument(store.current(),"trip","arrival") else {toast("Elegí el viaje al que querés agregar el remito");history("trips",true)}},
   Tile(R.drawable.ic_list,"Mis viajes",null){history("trips",true)},
   Tile(R.drawable.ic_history,"Mi combustible",null){history("fuel",true)},
   Tile(R.drawable.ic_gps,"Revisar GPS",null){checkGps()},
   Tile(R.drawable.ic_person,"Mi cuenta",null){settings()}))
  sync=note(store.message(),top=18).apply{gravity=Gravity.CENTER}
  navBar("home")
 }
 private fun truckChoices():List<String>{
  val catalog=mobile.catalog().optJSONArray("equipos");val out=mutableListOf<String>()
  if(catalog!=null)for(i in 0 until catalog.length()){val e=catalog.getJSONObject(i);out.add(e.optString("tipo")+e.optString("matriculaCamion").let{if(it.isBlank())"" else " · $it"})}
  if(out.isEmpty())out.addAll(trucks);if(truck.isNotBlank()&&!out.contains(truck))out.add(truck);return out
 }
 private fun truckParts(v:String):Pair<String,String>{val i=v.indexOf(" · ");return if(i<0)Pair(v.trim(),"") else Pair(v.substring(0,i).trim(),v.substring(i+3).trim())}
 private fun saveTruck(v:String){truck=v;prefs().edit().putString("truck",v).apply()}
 private fun pickTruck(then:()->Unit){val items=truckChoices();AlertDialog.Builder(this).setTitle("¿Con qué camión salís?").setItems((items+"Dejar pendiente").toTypedArray()){_,i->saveTruck(if(i<items.size)items[i] else "");then()}.setNegativeButton("Cancelar",null).show()}
 private fun truckSelector(c:LinearLayout,title:String){
  caption(c,title);val choices=listOf("Sin seleccionar")+truckChoices()
  val spinner=Spinner(this).apply{adapter=spinnerAdapter(choices);background=spinnerBg()};c.addView(spinner,LinearLayout.LayoutParams(-1,dp(52)).apply{topMargin=dp(6)})
  spinner.setSelection(choices.indexOf(truck).coerceAtLeast(0));spinner.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,pos:Int,id:Long){saveTruck(if(pos>0)choices[pos] else "")}}
 }
 private fun fuelChoice(){if(active())AlertDialog.Builder(this).setTitle("¿Dónde registrar la carga?").setItems(arrayOf("En el viaje en curso","Fuera de viaje")){_,i->openFuel(if(i==0)store.current() else null)}.show() else openFuel(null)}
 private fun syncNow(){Sync.schedule(this);toast("Enviando pendientes y actualizando…");thread{try{mobile.catalog(true);runOnUiThread{toast("Datos actualizados")}}catch(_:Exception){runOnUiThread{toast("Sin conexión. Los datos siguen guardados en el teléfono.")}}}}
 private fun locationPermissions()=mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION).apply{if(Build.VERSION.SDK_INT>=33)add(Manifest.permission.POST_NOTIFICATIONS)}
 private fun checkGps(){
  val req=locationPermissions();if(req.any{ContextCompat.checkSelfPermission(this,it)!=PackageManager.PERMISSION_GRANTED}){permissions.launch(req.toTypedArray());return}
  if(!(getSystemService(POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName))AlertDialog.Builder(this).setTitle("Evitar cortes del GPS").setMessage("La ubicación está permitida. Para que el GPS no se corte durante el viaje, permití que la app funcione sin restricciones de batería.").setPositiveButton("Permitir"){_,_->batteryExemption()}.setNegativeButton("Ahora no",null).show()
  else toast("GPS listo: ubicación precisa y batería sin restricciones.")
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
  val f=FrameLayout(this).apply{background=ripple(if(selected)outline(cardBg,blue,16).apply{setStroke(dp(2),blue)} else bg(cardBg,16));elevation=dpf(if(selected)3f else 1.5f);isClickable=true;isFocusable=true;contentDescription="$title. $sub"+if(selected)". Elegido" else "";setOnClickListener{action()}}
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
  dock.visibility=View.VISIBLE;button(dock,"Iniciar viaje",top=0){begin()}
 }
 private fun choose(title:String,values:List<String>,data:JSONObject,key:String,changed:()->Unit={}){
  val current=data.optString(key);val items=values.filter{it.isNotBlank()}.distinct().toMutableList()
  if(current.isNotBlank()&&!items.contains(current))items.add(0,current)
  if(items.isEmpty()){toast("No hay opciones cargadas. Actualizá desde Mi cuenta.");return}
  val labels=(items+if(current.isNotBlank())listOf("Quitar selección") else emptyList()).toTypedArray()
  AlertDialog.Builder(this).setTitle(title).setItems(labels){_,i->val next=if(i<items.size)items[i] else "";if(next!=current){data.put(key,next);changed()};rerender()}.setNegativeButton("Cancelar",null).show()
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
  if(req.any{ContextCompat.checkSelfPermission(this,it)!=PackageManager.PERMISSION_GRANTED})permissions.launch(req.toTypedArray()) else service()
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
  val t=store.current()?:return home();page("trip")
  val (model,plate)=truckParts(t.optString("vehicle"))
  bar("Viaje activo",back={home()},trailing=if(plate.isNotBlank())chip(plate) else null)
  val sb=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(16),0,dp(16),0);background=bg(0xFF178A4C.toInt(),14)}
  sb.addView(View(this).apply{background=oval(Color.WHITE)},LinearLayout.LayoutParams(dp(9),dp(9)))
  status=tv("Viaje en curso",15.5f,Color.WHITE,1).apply{setPadding(dp(10),0,0,0)};sb.addView(status,LinearLayout.LayoutParams(0,-2,1f))
  elapsed=tv("",15.5f,Color.WHITE,1).apply{fontFeatureSettings="tnum"};sb.addView(elapsed)
  statusBox=sb;root.addView(sb,LinearLayout.LayoutParams(-1,dp(48)).apply{topMargin=dp(12)})
  val details=store.details().firstOrNull{it.second.optString("trip_id")==t.getString("id")}?.second?.optJSONObject("data")
  val mc=card();trackOffset=0L
  val live=TripMap.live(this,details?.optDouble("destination_lat",Double.NaN)?:Double.NaN,details?.optDouble("destination_lng",Double.NaN)?:Double.NaN)
  liveMap=live;activeMap=live.web;mc.addView(live.web,LinearLayout.LayoutParams(-1,dp(300)))
  val sc=card();val sr=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(16),dp(12),dp(16),dp(12))}
  sr.addView(square(R.drawable.ic_speed,blue,blueSoft))
  val scol=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,dp(8),0)}
  scol.addView(tv("Velocidad actual",13.5f,muted))
  val sv=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.BOTTOM}
  speed=tv("—",30f,ink,2);sv.addView(speed);sv.addView(tv("km/h",14f,muted,1).apply{setPadding(dp(6),0,0,dp(6))})
  scol.addView(sv);sr.addView(scol,LinearLayout.LayoutParams(0,-2,1f))
  limit=tv("90",16f,ink,2).apply{gravity=Gravity.CENTER;contentDescription="Máximo para camiones: 90 kilómetros por hora"};sr.addView(limit,LinearLayout.LayoutParams(dp(50),dp(50)));sc.addView(sr)
  val kg=details?.optString("kg")?.takeIf{it.isNotBlank()&&it!="null"}?.let{"$it kg"}
  val cargo=if(t.optString("load_type")=="empty")"Retorno vacío" else listOfNotNull(details?.optString("tipoCarga")?.ifBlank{null},kg).joinToString(" · ").ifBlank{"Con carga"}
  val values=factsGrid(card(),listOf(Fact(R.drawable.ic_flag,"Destino",details?.optString("destino")?.ifBlank{null}?:"Sin destino"),Fact(R.drawable.ic_route,"Recorrido GPS",km(t.optDouble("distance_meters",0.0))),Fact(R.drawable.ic_box,"Carga",cargo),Fact(R.drawable.ic_truck,"Camión",model.ifBlank{"Sin asignar"})))
  distance=values[1]
  gps=note("",top=12)
  val trio=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};root.addView(trio,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(12)})
  actionBox(trio,R.drawable.ic_fuel,"Combustible",0){openFuel(store.current())}
  actionBox(trio,R.drawable.ic_receipt,"Remito",1){openDocument(store.current(),"trip","arrival")}
  val (pi,pl)=actionBox(trio,R.drawable.ic_pause,"Pausar",2){try{service(if(store.current()?.optBoolean("paused")==true)GpsService.RESUME else GpsService.PAUSE)}catch(_:Exception){toast("Revisá el permiso de ubicación")}}
  pauseIcon=pi;pauseLabel=pl
  if(!(getSystemService(POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName))row(card(),R.drawable.ic_battery,"Evitar cortes del GPS","Permitir que la app siga en segundo plano",tint=amber){batteryExemption()}
  count=note("",top=16);sync=note(store.message(),top=4)
  link(root,"Revisar ubicación GPS",top=4){requestStart()}
  dock.visibility=View.VISIBLE
  button(dock,"Finalizar viaje",Kind.DANGER,R.drawable.ic_flag,top=0){AlertDialog.Builder(this).setTitle("¿Finalizar este viaje?").setMessage("Se guardarán el recorrido, las boletas y los remitos.").setNegativeButton("Seguir viaje",null).setPositiveButton("Finalizar"){_,_->try{service(GpsService.FINISH)}catch(_:Exception){toast("No se pudo finalizar. Reintentá.")}}.show()}
  refresh();try{service()}catch(_:Exception){gps?.text="Revisá el permiso de ubicación para continuar"}
 }
 private fun actionBox(p:LinearLayout,icon:Int,label:String,index:Int,action:()->Unit):Pair<ImageView,TextView>{
  val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;background=ripple(bg(cardBg,14));elevation=dpf(1.5f);isClickable=true;isFocusable=true;contentDescription=label;setOnClickListener{action()}}
  val image=iconView(icon,blue,24);val caption=tv(label,13.5f,blue,1).apply{setPadding(0,dp(6),0,0)};v.addView(image);v.addView(caption)
  p.addView(v,LinearLayout.LayoutParams(0,dp(76),1f).apply{if(index>0)marginStart=dp(10)});return Pair(image,caption)
 }
 @android.annotation.SuppressLint("BatteryLife") private fun batteryExemption(){
  try{startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,Uri.parse("package:$packageName")))}
  catch(_:Exception){try{startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))}catch(_:Exception){toast("Abrí Ajustes › Batería y permití que la app funcione sin restricciones")}}
 }
 private fun refresh(){if(!::store.isInitialized)return;sync?.text=store.message()
  if(screen=="owner"&&!fleetLoading&&System.currentTimeMillis()-fleetLoadedAt>120000)loadFleet()
  if(screen!="trip")return;val t=store.current()?:return
  if(!t.optBoolean("active")){home();toast("Viaje finalizado. Los datos pendientes se enviarán con conexión.");return}
  val paused=t.optBoolean("paused")
  status?.text=if(paused)"Viaje pausado" else "Viaje en curso";statusBox?.background=bg(if(paused)0xFFB7740B.toInt() else 0xFF178A4C.toInt(),14)
  elapsed?.text=elapsedText(t.optString("started_at"))
  distance?.text=km(t.optDouble("distance_meters",0.0))
  pauseLabel?.text=if(paused)"Reanudar" else "Pausar";pauseIcon?.setImageResource(if(paused)R.drawable.ic_play else R.drawable.ic_pause);(pauseLabel?.parent as? View)?.contentDescription=pauseLabel?.text
  val recent=instant(t.optJSONObject("last_point")?.optString("recorded_at"))?.let{System.currentTimeMillis()-it.toEpochMilli()<30000}?:false
  val v=if(paused)0.0 else if(recent)t.optDouble("speed_kmh",0.0) else Double.NaN
  speed?.text=if(v.isNaN())"—" else String.format(uy,"%.0f",v)
  val over=!v.isNaN()&&v>90;speed?.setTextColor(if(over)red else ink)
  limit?.background=GradientDrawable().apply{shape=GradientDrawable.OVAL;setColor(if(over)red else cardBg);setStroke(dp(4),red)};limit?.setTextColor(if(over)Color.WHITE else ink)
  val warn=store.warning();gps?.text=if(paused)"El GPS y los kilómetros están pausados" else if(warn.isNotBlank())"⚠ $warn" else if(recent)"GPS actualizado" else "Esperando señal GPS precisa…";gps?.setTextColor(if(warn.isNotBlank()&&!paused)amber else muted)
  val n=store.receiptCount(t.getString("id"));count?.text=if(n==0)"Sin boletas en este viaje" else "$n boleta${if(n==1)"" else "s"} en este viaje"
  liveMap?.let{map->val (points,end)=store.track(t.getString("id"),trackOffset);trackOffset=end;map.push(points)}
 }

 // ---------- Fuel receipt ----------
 private fun openFuel(t:JSONObject?){photoJob++;photoBusy=false;fuelTrip=t;fuelForm=JSONObject().put("receipt_date",LocalDate.now().toString());photo=null;photoMode="fuel";fuel()}
 private fun fuel(){
  page("fuel");photoMode="fuel";bar("Cargar combustible",back={homeOrTrip()})
  root.addView(pill(fuelTrip?.let{"En este viaje · ${truckParts(it.optString("vehicle")).first}"}?:"Fuera de viaje",blue,blueSoft).apply{(layoutParams as LinearLayout.LayoutParams).topMargin=dp(14)})
  val pc=card(pad=16);text(pc,"Foto de la boleta",16.5f,ink,1);note("Sacá una foto o elegí una guardada. También podés guardar sin foto.",pc,4);photoControls(pc)
  val c=card(pad=16)
  if(fuelTrip==null)truckSelector(c,"Camión · opcional")
  caption(c,"Fecha");val day=fuelForm.optString("receipt_date",LocalDate.now().toString())
  c.addView(tv(try{LocalDate.parse(day).format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))}catch(_:Exception){day},16f,ink).apply{gravity=Gravity.CENTER_VERTICAL;background=ripple(outline(cardBg,fieldLine,12));setPadding(dp(14),0,dp(14),0);setCompoundDrawablesRelative(null,null,tinted(R.drawable.ic_calendar,muted),null);isClickable=true;isFocusable=true;contentDescription="Fecha de la boleta: $day";setOnClickListener{
   val date=try{LocalDate.parse(fuelForm.optString("receipt_date"))}catch(_:Exception){LocalDate.now()};DatePickerDialog(this@MainActivity,{_,y,m,d->fuelForm.put("receipt_date",LocalDate.of(y,m+1,d).toString());fuel()},date.year,date.monthValue-1,date.dayOfMonth).show()}},LinearLayout.LayoutParams(-1,dp(52)).apply{topMargin=dp(6)})
  val stations=mobile.catalog().optJSONArray("estaciones")?:JSONArray();val names=(0 until stations.length()).map{stations.getJSONObject(it).optString("nombre")}
  if(names.isEmpty())bound(c,"Estación de servicio",fuelForm,"station_name",hint="Nombre de la estación") else {select(c,"Estación de servicio",fuelForm,"station_name",names){fuel()};bound(c,"Otra estación · si no está en la lista",fuelForm,"station_name")}
  val two=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};c.addView(two,LinearLayout.LayoutParams(-1,-2))
  val left=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};val right=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL}
  two.addView(left,LinearLayout.LayoutParams(0,-2,1f));two.addView(right,LinearLayout.LayoutParams(0,-2,1f).apply{marginStart=dp(12)})
  bound(left,"Litros",fuelForm,"liters",true,"0");bound(right,"Total (UYU)",fuelForm,"total",true,"0")
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
   val frame=FrameLayout(this).apply{background=bg(0xFF263041.toInt(),12);clipToOutline=true}
   frame.addView(ImageView(this).apply{setImageURI(Uri.fromFile(f));scaleType=ImageView.ScaleType.CENTER_CROP;contentDescription="Vista previa del comprobante"},FrameLayout.LayoutParams(-1,-1))
   frame.addView(ImageView(this).apply{setImageResource(R.drawable.ic_close);imageTintList=ColorStateList.valueOf(0xFF111C2E.toInt());background=oval(0xEEFFFFFF.toInt());setPadding(dp(7),dp(7),dp(7),dp(7));contentDescription="Quitar foto";isClickable=true;isFocusable=true;setOnClickListener{removePhoto()}},FrameLayout.LayoutParams(dp(36),dp(36),Gravity.TOP or Gravity.END).apply{setMargins(dp(8),dp(8),dp(8),dp(8))})
   frame.addView(tv("Foto adjunta",12f,Color.WHITE,1).apply{background=bg(0xF2178A4C.toInt(),7);setPadding(dp(9),dp(4),dp(9),dp(5))},FrameLayout.LayoutParams(-2,-2,Gravity.BOTTOM or Gravity.START).apply{setMargins(dp(10),dp(10),dp(10),dp(10))})
   c.addView(frame,LinearLayout.LayoutParams(-1,dp(170)).apply{topMargin=dp(12)})
  }
 }
 private fun photoButton(icon:Int,label:String,action:()->Unit)=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;background=ripple(outline(cardBg,fieldLine,12));isClickable=true;isFocusable=true;contentDescription=label;setOnClickListener{action()}
  addView(iconView(icon,blue,24));addView(tv(label,13.5f,ink,1).apply{setPadding(0,dp(5),0,0)})}
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
  thread{try{@Suppress("DEPRECATION") val found=Geocoder(this,uy).getFromLocationName(q,5)?:emptyList();runOnUiThread{if(screen!="prepare")return@runOnUiThread;if(found.isEmpty()){toast("No se encontraron resultados. Podés conservar el nombre escrito.");return@runOnUiThread};AlertDialog.Builder(this).setTitle("Elegí un destino").setItems(found.map{it.getAddressLine(0)?:it.featureName?:q}.toTypedArray()){_,i->val a=found[i];tripForm.put("destino",a.getAddressLine(0)?:q).put("destination_lat",a.latitude).put("destination_lng",a.longitude);prepare()}.setNegativeButton("Cancelar",null).show()}}catch(_:Exception){runOnUiThread{toast("Búsqueda no disponible. Podés iniciar con el destino escrito o sin destino.")}}}
 }

 // ---------- History ----------
 private fun history(kind:String,refresh:Boolean=false){
  val fleet=isOwner();val key=if(kind=="trips")"triphistory" else "fuelhistory";page(key)
  val title=if(kind=="trips")(if(fleet)"Viajes de la flota" else "Mis viajes") else (if(fleet)"Combustible de la flota" else "Mi combustible")
  bar(title,trailing=if(kind=="fuel"&&!fleet)plusButton("Cargar combustible"){fuelChoice()} else barButton(R.drawable.ic_sync,"Actualizar"){history(kind,true)})
  val rows=mobile.history(kind,historyLimit,false,fleet)
  if(kind=="trips")tripList(rows,fleet) else fuelList(rows,fleet)
  if(rows.length()>=historyLimit)button(root,"Cargar más",Kind.LINE){historyLimit+=50;history(kind,true)}
  navBar(kind)
  if(refresh)thread{try{mobile.history(kind,historyLimit,true,fleet);runOnUiThread{if(screen==key)history(kind)}}catch(_:Exception){runOnUiThread{if(screen==key)toast("Sin conexión. Mostrando los registros guardados en este teléfono.")}}}
 }
 private fun tripList(rows:JSONArray,fleet:Boolean){
  val info=mobile.tripInfo(fleet)
  val search=searchBox(root,"Buscar por camión, destino o carga",historyQuery)
  val box=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};root.addView(box,LinearLayout.LayoutParams(-1,-2))
  fun render(){box.removeAllViews();val q=historyQuery.trim().lowercase(uy);var c:LinearLayout?=null
   for(i in 0 until rows.length()){val r=rows.getJSONObject(i);val d=info.optJSONObject(r.optString("id"))?:JSONObject()
    val haystack=listOf(r.optString("vehicle"),r.optString("driver_name"),d.optString("destino"),d.optString("cliente"),d.optString("tipoCarga"),date(r.optString("started_at"))).joinToString(" ").lowercase(uy)
    if(q.isNotEmpty()&&!haystack.contains(q))continue
    if(c==null)c=card(box);tripRow(c,r,d,fleet)}
   if(c==null){val prev=root;root=box;emptyCard(R.drawable.ic_route,if(q.isEmpty())"Todavía no hay viajes" else "Sin resultados",if(q.isEmpty())"Los viajes aparecen acá cuando se inician." else "No hay viajes que coincidan con «${historyQuery.trim()}».");root=prev}
  }
  render()
  search.addTextChangedListener(object:TextWatcher{override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){};override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){};override fun afterTextChanged(e:Editable?){historyQuery=e?.toString()?:"";render()}})
 }
 private fun tripRow(c:LinearLayout,r:JSONObject,d:JSONObject,fleet:Boolean){
  if(c.childCount>0)divider(c,16)
  val z=zoned(r.optString("started_at"))
  val v=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(12),dp(12),dp(12),dp(12));background=ripple(null);isClickable=true;isFocusable=true;setOnClickListener{detail(r,true)}}
  val badge=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER;background=bg(appBg,10)}
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
  segmented(root,listOf("Este mes","Todos"),if(fuelMonth)0 else 1){fuelMonth=it==0;history("fuel")}
  val now=YearMonth.now();val list=(0 until rows.length()).map{rows.getJSONObject(it)}.filter{!fuelMonth||fuelDay(it)?.let{d->YearMonth.from(d)}==now}
  var litres=0.0;var pesos=0.0
  list.forEach{r->val d=r.optJSONObject("panel_data")?:JSONObject();amount(d,"litros",r,"liters")?.let{litres+=it};if(currency(d)=="UYU")amount(d,"monto",r,"total")?.let{pesos+=it}}
  val k=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};root.addView(k,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(12)})
  kpi(k,"Total litros",litre(litres),0);kpi(k,"Total gastado","$ ${money(pesos)}",1)
  if(list.isEmpty()){emptyCard(R.drawable.ic_fuel,if(fuelMonth)"Sin cargas este mes" else "Todavía no hay cargas",if(fleet)"Las cargas de la flota aparecen acá cuando se registran." else "Tocá + para registrar una carga de combustible.");return}
  val c=card();list.forEach{fuelRow(c,it,fleet)}
 }
 private fun fuelRow(c:LinearLayout,r:JSONObject,fleet:Boolean){
  if(c.childCount>0)divider(c,68)
  val d=r.optJSONObject("panel_data")?:JSONObject()
  val station=d.optString("estacionNombre").takeIf{it.isNotBlank()&&it!="null"}?:r.optString("station_name").ifBlank{"Estación por completar"}
  val day=fuelDay(r)?.format(DateTimeFormatter.ofPattern("dd/MM/yyyy"))
  val who=if(fleet)r.optString("driver_name").substringBefore(" ").ifBlank{null} else null
  val v=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(14),dp(12),dp(14),dp(12))}
  v.addView(square(R.drawable.ic_fuel,green,greenBg))
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,dp(8),0)}
  col.addView(tv(station,15f,ink,1).apply{maxLines=1;ellipsize=TextUtils.TruncateAt.END})
  col.addView(tv(listOfNotNull(day,who,if(r.isNull("trip_id"))"Fuera de viaje" else "En viaje").joinToString(" · "),13f,muted).apply{setPadding(0,dp(3),0,0)})
  v.addView(col,LinearLayout.LayoutParams(0,-2,1f))
  val right=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.END}
  val lt=amount(d,"litros",r,"liters");val paid=amount(d,"monto",r,"total");val cur=currency(d)
  right.addView(tv(lt?.let{litre(it)}?:"— L",15f,ink,1).apply{gravity=Gravity.END})
  right.addView(tv(paid?.let{(if(cur=="UYU")"$ " else "$cur ")+money(it)}?:"Sin monto",13f,muted).apply{gravity=Gravity.END;setPadding(0,dp(3),0,0)})
  v.addView(right);v.contentDescription="$station, ${day?:""}"
  if(!r.isNull("object_path")){v.background=ripple(null);v.isClickable=true;v.isFocusable=true;v.contentDescription="$station, ${day?:""}. Ver boleta";v.setOnClickListener{showPhoto(r,"trf-fuel-receipts")}}
  c.addView(v,LinearLayout.LayoutParams(-1,-2))
 }
 private fun currency(d:JSONObject)=d.optString("moneda").takeIf{it.isNotBlank()&&it!="null"}?:"UYU"
 private fun amount(a:JSONObject,k:String,b:JSONObject,l:String):Double?{val raw=a.optString(k).takeUnless{it.isBlank()||it=="null"}?:b.optString(l).takeUnless{it.isBlank()||it=="null"}?:return null;return raw.replace(',','.').toDoubleOrNull()?.takeIf{it.isFinite()}}
 private fun fuelDay(r:JSONObject):LocalDate?{
  val s=r.optJSONObject("panel_data")?.optString("fecha")?.takeIf{it.isNotBlank()&&it!="null"}?:r.optString("receipt_date")
  return try{LocalDate.parse(s.take(10))}catch(_:Exception){try{LocalDate.parse(s,DateTimeFormatter.ofPattern("dd/MM/yyyy"))}catch(_:Exception){zoned(r.optString("recorded_at"))?.toLocalDate()}}
 }

 // ---------- Trip detail ----------
 private fun detail(t:JSONObject,refresh:Boolean=false){
  historyTrip=t;page("tripdetail");bar("Detalle del viaje",back={history("trips")})
  val bundle=mobile.detail(t);val d=bundle.optJSONObject("data")?:JSONObject();val docs=bundle.optJSONArray("documents")?:JSONArray()
  val running=t.optBoolean("active");val (model,plate)=truckParts(t.optString("vehicle"))
  val (label,fg,fill)=when{running&&t.optBoolean("paused")->Triple("Viaje pausado",amber,amberBg);running->Triple("Viaje en curso",blue,blueSoft);else->Triple("Viaje finalizado",green,greenBg)}
  val banner=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;background=bg(fill,14);setPadding(dp(14),0,dp(14),0)}
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
  if(points.length()>0){val mc=card();val web=TripMap.view(this,points);activeMap=web;mc.addView(web,LinearLayout.LayoutParams(-1,dp(300)));button(root,"Ver mapa en pantalla completa",Kind.LINE,R.drawable.ic_map){fullMap(points)};note("Las líneas unen lecturas GPS; los tramos sin señal o pausados quedan abiertos.")}
  else note("Sin recorrido disponible. Actualizá para consultar el GPS guardado.",top=8)
  link(root,"Actualizar desde el panel",top=10){detail(t,true)}
  if(refresh)thread{try{mobile.detail(t,true);mobile.route(t,true);runOnUiThread{if(screen=="tripdetail"&&historyTrip?.optString("id")==t.optString("id"))detail(t)}}catch(_:Exception){runOnUiThread{if(screen=="tripdetail")toast("No se pudo actualizar. Se mantienen los datos guardados.")}}}
 }
 private fun stop(p:LinearLayout,label:String,place:String,time:String,first:Boolean){
  val r=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL}
  val rail=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;gravity=Gravity.CENTER_HORIZONTAL}
  rail.addView(View(this).apply{background=GradientDrawable().apply{shape=GradientDrawable.OVAL;setColor(if(first)cardBg else green);setStroke(dp(3),green)}},LinearLayout.LayoutParams(dp(16),dp(16)).apply{topMargin=dp(3)})
  if(first)rail.addView(View(this).apply{setBackgroundColor(tone(0xFFB9DEC8,0xFF2A5A40))},LinearLayout.LayoutParams(dp(2),0,1f).apply{topMargin=dp(2)})
  r.addView(rail,LinearLayout.LayoutParams(dp(18),-1))
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,dp(8),if(first)dp(16) else 0)}
  col.addView(tv(label,13f,muted));col.addView(tv(place,16f,ink,1).apply{setPadding(0,dp(2),0,0)})
  if(time.isNotBlank())col.addView(tv(time,13f,muted).apply{setPadding(0,dp(2),0,0)})
  r.addView(col,LinearLayout.LayoutParams(0,-2,1f))
  p.addView(r,LinearLayout.LayoutParams(-1,-2))
 }
 private fun fullMap(points:JSONArray){
  val dialog=android.app.Dialog(this,android.R.style.Theme_Material_Light_NoActionBar)
  val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(12),dp(12),dp(12),dp(12));setBackgroundColor(appBg)}
  button(layout,"Cerrar mapa",Kind.LINE,R.drawable.ic_close,top=0){dialog.dismiss()}
  val web=TripMap.view(this,points);layout.addView(web,LinearLayout.LayoutParams(-1,0,1f).apply{topMargin=dp(12)});dialog.setContentView(layout)
  dialog.setOnDismissListener{web.destroy()};dialog.show();dialog.window?.setLayout(-1,-1)
  ViewCompat.setOnApplyWindowInsetsListener(layout){v,i->val insets=i.getInsets(WindowInsetsCompat.Type.systemBars());v.setPadding(insets.left+dp(12),insets.top+dp(12),insets.right+dp(12),insets.bottom+dp(12));i}
 }

 // ---------- Account ----------
 private fun settings(){
  page("settings");bar("Mi cuenta")
  val email=api.session()?.optJSONObject("user")?.optString("email")?:""
  val pc=card();val pr=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;setPadding(dp(16),dp(16),dp(16),dp(16))}
  pr.addView(tv(initials(name),17f,Color.WHITE,1).apply{gravity=Gravity.CENTER;background=oval(barBg)},LinearLayout.LayoutParams(dp(52),dp(52)))
  val col=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(14),0,0,0)}
  col.addView(tv(name,18f,ink,1));col.addView(tv(email,14f,muted).apply{setPadding(0,dp(2),0,0)})
  col.addView(pill(if(isOwner())"Dueño · panel de flota" else "Chofer",blue,blueSoft).apply{(layoutParams as LinearLayout.LayoutParams).topMargin=dp(8)})
  pr.addView(col,LinearLayout.LayoutParams(0,-2,1f));pc.addView(pr)
  section("Sincronización")
  val sc=card(pad=16);sync=text(sc,store.message(),15f,ink);note("Los viajes, boletas y remitos se guardan en el teléfono y se envían solos cuando hay conexión.",sc,6)
  button(sc,"Enviar pendientes y actualizar",Kind.SOFT,R.drawable.ic_sync){syncNow()}
  section("GPS")
  row(card(),R.drawable.ic_gps,"Revisar GPS","Permisos de ubicación y batería"){checkGps()}
  button(root,"Renovar acceso",Kind.LINE,R.drawable.ic_lock,top=24){login()}
  button(root,"Cerrar sesión",Kind.LINE_DANGER,R.drawable.ic_logout){if(active()||store.pendingCount()>0){toast("Finalizá el viaje y enviá los datos pendientes antes de cerrar sesión.");return@button};api.clear();login()}
  note("Transportes Ferreira GPS · versión $appVersion",top=18).gravity=Gravity.CENTER
  navBar("more")
 }

 // ---------- Owner fleet panel ----------
 private fun ownerDashboard(){
  page("owner");hello(name,"Flota en vivo",barButton(R.drawable.ic_sync,"Actualizar flota"){loadFleet(true)})
  val f=mobile.fleet();val items=fleetItems(f);val fetched=f.optLong("fetched_at")
  val k=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL};root.addView(k,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(14)})
  stat(k,"${items.count{it.state=="moving"}}","En ruta",green,0);stat(k,"${items.count{it.state=="stopped"||it.state=="paused"||it.state=="nosignal"}}","Detenidos",amber,1);stat(k,"${items.count{it.state=="idle"}}","Sin viaje",grey,2)
  val marks=JSONArray();items.filter{it.lat.isFinite()&&it.lng.isFinite()}.forEach{marks.put(JSONObject().put("lat",it.lat).put("lng",it.lng).put("label",it.plate.ifBlank{it.model}).put("color",hex(stateColor(it.state))))}
  val mc=card();val web=TripMap.fleet(this,marks);activeMap=web;mc.addView(web,LinearLayout.LayoutParams(-1,dp(260)))
  if(marks.length()==0)note(if(fetched==0L)"Buscando posiciones…" else "Todavía no hay posiciones GPS para mostrar.",mc,0).setPadding(dp(16),dp(10),dp(16),dp(12))
  section("Camiones")
  if(items.isEmpty())emptyCard(R.drawable.ic_truck,"Sin camiones cargados","Los equipos del catálogo aparecen acá.") else {val c=card();items.forEach{fleetRow(c,it)}}
  note(if(fetched==0L)"Buscando la flota…" else "Actualizado ${ago(fetched)}. Se actualiza sola cada 2 minutos.",top=10)
  tileGrid(listOf(Tile(R.drawable.ic_list,"Viajes de la flota",null){history("trips",true)},Tile(R.drawable.ic_history,"Combustible de la flota",null){history("fuel",true)}))
  sync=note(store.message(),top=16).apply{gravity=Gravity.CENTER}
  navBar("owner")
  if(!fleetLoading&&System.currentTimeMillis()-fleetLoadedAt>120000)loadFleet()
 }
 private fun loadFleet(manual:Boolean=false){
  if(fleetLoading)return;fleetLoading=true;if(manual)toast("Actualizando la flota…")
  thread{val ok=try{mobile.catalog(true);mobile.fleet(true);true}catch(_:Exception){false}
   runOnUiThread{fleetLoading=false;fleetLoadedAt=System.currentTimeMillis();if(!ok&&manual)toast("Sin conexión. Se muestra la última información guardada.")
    if(ok&&screen=="owner"){val scroll=root.parent as? ScrollView;val y=scroll?.scrollY?:0;ownerDashboard();(root.parent as? ScrollView)?.post{(root.parent as? ScrollView)?.scrollTo(0,y)}}}}
 }
 private fun stateColor(state:String)=when(state){"moving"->0xFF178A4C.toInt();"idle"->0xFF8F9BAD.toInt();else->0xFFE69A1E.toInt()}
 private fun fleetItems(f:JSONObject):List<FleetItem>{
  val now=System.currentTimeMillis();val out=mutableListOf<FleetItem>();val busy=mutableSetOf<String>()
  val running=f.optJSONArray("active")?:JSONArray()
  for(i in 0 until running.length()){val s=running.getJSONObject(i);val last=s.optJSONObject("last")
   val at=instant(last?.optString("recorded_at"))?.toEpochMilli();val kmh=last?.optDouble("speed_kmh",Double.NaN)?:Double.NaN
   val state=when{s.optBoolean("paused")->"paused";at==null||now-at>15*60000->"nosignal";kmh.isFinite()&&kmh>=5->"moving";else->"stopped"}
   val (model,plate)=truckParts(s.optString("vehicle"));if(plate.isNotBlank())busy.add(plate.uppercase())
   out.add(FleetItem(model,plate,s.optString("driver_name"),state,kmh,s.optDouble("distance_meters",0.0),last?.optDouble("latitude",Double.NaN)?:Double.NaN,last?.optDouble("longitude",Double.NaN)?:Double.NaN,at,s))}
  val recent=f.optJSONArray("recent")?:JSONArray();val equipos=mobile.catalog().optJSONArray("equipos")?:JSONArray()
  for(i in 0 until equipos.length()){val e=equipos.getJSONObject(i);val plate=e.optString("matriculaCamion").trim()
   if(plate.isNotBlank()&&plate.uppercase() in busy)continue
   var last:JSONObject?=null
   for(j in 0 until recent.length()){val r=recent.getJSONObject(j);if(plate.isNotBlank()&&r.optString("vehicle").uppercase().contains(plate.uppercase())){last=r;break}}
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
  u.session?.let{s->v.background=ripple(null);v.isClickable=true;v.isFocusable=true;v.setOnClickListener{detail(s,true)}}
  c.addView(v,LinearLayout.LayoutParams(-1,-2))
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
 private fun toast(s:String)=Toast.makeText(this,s,Toast.LENGTH_LONG).show()
}
