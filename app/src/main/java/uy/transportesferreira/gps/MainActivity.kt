package uy.transportesferreira.gps
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.*
import android.graphics.drawable.GradientDrawable
import android.net.Uri
import android.os.*
import android.provider.Settings
import android.text.InputType
import android.view.*
import android.widget.*
import androidx.activity.result.contract.ActivityResultContracts
import androidx.appcompat.app.AlertDialog
import androidx.appcompat.app.AppCompatActivity
import androidx.core.content.ContextCompat
import androidx.core.content.FileProvider
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat
import androidx.exifinterface.media.ExifInterface
import java.io.File
import org.json.JSONObject
import org.json.JSONArray
import android.text.TextWatcher
import android.text.Editable
import android.location.Geocoder
import android.app.DatePickerDialog
import java.util.*
import kotlin.concurrent.thread
import kotlin.math.max
class MainActivity:AppCompatActivity(){
 private val isDarkMode by lazy { (resources.configuration.uiMode and android.content.res.Configuration.UI_MODE_NIGHT_MASK) == android.content.res.Configuration.UI_MODE_NIGHT_YES }
 private val primary by lazy { if(isDarkMode) Color.rgb(76,175,255) else Color.rgb(28,100,242) }
 private val secondary by lazy { if(isDarkMode) Color.rgb(129,212,250) else Color.rgb(66,165,245) }
 private val navy by lazy { if(isDarkMode) Color.rgb(230,235,242) else Color.rgb(16,35,61) }
 private val blue by lazy { primary }
 private val muted by lazy { if(isDarkMode) Color.rgb(176,190,197) else Color.rgb(99,115,136) }
 private val pale by lazy { if(isDarkMode) Color.rgb(33,33,33) else Color.rgb(241,246,252) }
 private val cardBg by lazy { if(isDarkMode) Color.rgb(48,48,48) else Color.WHITE }
 private lateinit var root:LinearLayout
 private lateinit var dock:LinearLayout
 private var tripStep=0;private var fuelStep=0;private var docStep=0
 private var speed:TextView?=null
 private val appVersion:String get()=packageManager.getPackageInfo(packageName,0).versionName?:""
 private lateinit var store:TripStore
 private lateinit var api:Api
 private var screen="";private var name="";private var truck="";private var empty=false
 private val isOwner by lazy { api.session()?.optJSONObject("user")?.optString("email") == "luis@trferreira.com" }
 private var photoJob=0;private var photoBusy=false
 private var photo:File?=null;private var camera:File?=null
 private var distance:TextView?=null;private var status:TextView?=null;private var sync:TextView?=null;private var gps:TextView?=null;private var pause:Button?=null;private var count:TextView?=null
 private val handler=Handler(Looper.getMainLooper());private val tick=object:Runnable{override fun run(){refresh();handler.postDelayed(this,1000)}}
 private val mobile by lazy{MobileData(this)}
 private var tripForm=JSONObject();private var fuelForm=JSONObject();private var docForm=JSONObject();private var draftDocs=JSONArray()
 private var fuelTrip:JSONObject?=null;private var historyTrip:JSONObject?=null;private var docTrip:JSONObject?=null
 private var photoMode="fuel";private var docReturn="prepare";private var historyLimit=50
 private var activeMap:android.webkit.WebView?=null;private var liveMap:TripMap.Live?=null;private var trackOffset=0L
 private val trucks=arrayOf("Seleccioná un camión","Ford Cargo 1722","Mercedes-Benz 1618","Leyland","Mercedes-Benz 1630")
 private val permissions=registerForActivityResult(ActivityResultContracts.RequestMultiplePermissions()){
  if(ContextCompat.checkSelfPermission(this,Manifest.permission.ACCESS_FINE_LOCATION)==PackageManager.PERMISSION_GRANTED){try{service()}catch(_:Exception){};homeOrTrip()}
  else AlertDialog.Builder(this).setTitle("Activá la ubicación precisa").setMessage("El cuentakilómetros necesita ubicación precisa. Habilitala en los permisos de la app.").setPositiveButton("Abrir ajustes"){_,_->startActivity(Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS,Uri.parse("package:$packageName")))}.setNegativeButton("Ahora no",null).show()
 }
 private val take=registerForActivityResult(ActivityResultContracts.TakePicture()){ok->if(ok)camera?.let{preparePhoto(Uri.fromFile(it))}else camera?.delete()}
 private val pick=registerForActivityResult(ActivityResultContracts.GetContent()){uri->if(uri!=null)preparePhoto(uri)}
 override fun onCreate(b:Bundle?){super.onCreate(b);store=TripStore(this);api=Api(this);
  tripForm=JSONObject(b?.getString("tripForm")?:"{}");fuelForm=JSONObject(b?.getString("fuelForm")?:"{}");docForm=JSONObject(b?.getString("docForm")?:"{}");draftDocs=JSONArray(b?.getString("draftDocs")?:"[]")
  fuelTrip=b?.getString("fuelTrip")?.let{JSONObject(it)};docTrip=b?.getString("docTrip")?.let{JSONObject(it)};historyTrip=b?.getString("historyTrip")?.let{JSONObject(it)};photoMode=b?.getString("photoMode")?:"fuel";docReturn=b?.getString("docReturn")?:"prepare"
 camera=b?.getString("camera")?.let{File(it)};photo=b?.getString("photo")?.let{File(it)}?.takeIf{it.exists()};truck=b?.getString("truck")?:"";empty=b?.getBoolean("empty")?:false
  tripStep=(b?.getInt("tripStep")?:0).coerceIn(0,2);fuelStep=(b?.getInt("fuelStep")?:0).coerceIn(0,1);docStep=(b?.getInt("docStep")?:0).coerceIn(0,1)
  window.statusBarColor=if(isDarkMode)Color.rgb(32,32,32) else pale;window.navigationBarColor=if(isDarkMode)Color.rgb(32,32,32) else Color.WHITE
  androidx.core.view.WindowCompat.getInsetsController(window,window.decorView).apply{isAppearanceLightStatusBars=!isDarkMode;isAppearanceLightNavigationBars=!isDarkMode}
  if(api.session()==null)login() else {name=driverName();when(b?.getString("screen")){"fuel"->fuel();"document"->document();"prepare"->prepare();else->homeOrTrip()};Sync.schedule(this);thread{try{mobile.catalog(true);runOnUiThread{if(screen=="prepare")prepare()}}catch(_:Exception){}}}

 }
 override fun onSaveInstanceState(b:Bundle){super.onSaveInstanceState(b);b.putInt("tripStep",tripStep);b.putInt("fuelStep",fuelStep);b.putInt("docStep",docStep);b.putString("camera",camera?.path);b.putString("photo",photo?.path);b.putString("screen",screen);b.putString("truck",truck);b.putBoolean("empty",empty);b.putString("tripForm",tripForm.toString());b.putString("fuelForm",fuelForm.toString());b.putString("docForm",docForm.toString());b.putString("draftDocs",draftDocs.toString());b.putString("fuelTrip",fuelTrip?.toString());b.putString("docTrip",docTrip?.toString());b.putString("historyTrip",historyTrip?.toString());b.putString("photoMode",photoMode);b.putString("docReturn",docReturn)}
 override fun onStart(){super.onStart();handler.post(tick)}
 override fun onDestroy(){photoJob++;activeMap?.destroy();activeMap=null;super.onDestroy()}
 override fun onStop(){handler.removeCallbacks(tick);super.onStop()}
 @Deprecated("Deprecated in Java") override fun onBackPressed(){when(screen){
  "fuel"->if(fuelStep>0){fuelStep--;fuel()}else homeOrTrip()
  "document"->if(docStep>0){docStep--;document()}else backFromDocument()
  "prepare"->if(tripStep>0){tripStep--;prepare()}else home()
  "triphistory","fuelhistory","settings"->home()
  "tripdetail"->history("trips")
  "trip"->home()
  else->super.onBackPressed()
 }}
 private fun dp(n:Int)=(n*resources.displayMetrics.density).toInt()
 private fun bg(color:Int,r:Int=20)=GradientDrawable().apply{setColor(color);cornerRadius=dp(r).toFloat()}
 private fun grad(a:Int,b:Int,r:Int=20)=GradientDrawable(GradientDrawable.Orientation.TL_BR,intArrayOf(a,b)).apply{cornerRadius=dp(r).toFloat()}
 private fun ripple(content:android.graphics.drawable.Drawable,tint:Int=Color.argb(35,16,35,61)):android.graphics.drawable.Drawable=android.graphics.drawable.RippleDrawable(android.content.res.ColorStateList.valueOf(tint),content,null)
 private fun page(key:String){activeMap?.destroy();activeMap=null;liveMap=null;screen=key;distance=null;speed=null;status=null;sync=null;gps=null;pause=null;count=null
  val shell=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setBackgroundColor(pale)}
  val scroll=ScrollView(this).apply{isFillViewport=true;isVerticalScrollBarEnabled=false;isNestedScrollingEnabled=true;setOverScrollMode(View.OVER_SCROLL_NEVER)}
  root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(24),dp(16),dp(24),dp(24))};scroll.addView(root)
  shell.addView(scroll,LinearLayout.LayoutParams(-1,0,1f))
  dock=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(24),dp(8),dp(24),dp(16));setBackgroundColor(cardBg);visibility=View.GONE}
  shell.addView(dock,LinearLayout.LayoutParams(-1,-2));setContentView(shell)
  ViewCompat.setOnApplyWindowInsetsListener(shell){v,i->val insets=i.getInsets(WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime());v.setPadding(insets.left,insets.top,insets.right,insets.bottom);i}
  val brand=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;background=bg(cardBg,12);elevation=dp(1).toFloat();setPadding(dp(12),dp(8),dp(12),dp(8))}
  brand.addView(ImageView(this).apply{setImageResource(R.drawable.tr_ferreira_logo);adjustViewBounds=true;contentDescription="TR Ferreira"},LinearLayout.LayoutParams(-2,dp(30)))
  brand.addView(TextView(this).apply{text="CHOFERES";textSize=13f;setTextColor(muted);setTypeface(null,Typeface.BOLD);letterSpacing=.12f;setPadding(dp(14),0,0,0)})
  root.addView(brand,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(8);bottomMargin=dp(12)})
  shell.alpha=0f;shell.animate().alpha(1f).setDuration(250).setInterpolator(android.view.animation.DecelerateInterpolator()).start();root.animate().translationY(-dp(20).toFloat()).setDuration(0).start();root.animate().translationY(0f).setDuration(300).setInterpolator(android.view.animation.DecelerateInterpolator()).start()
 }
 private fun back(title:String="Inicio",action:()->Unit){
  val v=TextView(this).apply{text="‹  $title";textSize=16f;setTextColor(blue);gravity=Gravity.CENTER_VERTICAL;minHeight=dp(56);setPadding(dp(12),dp(8),dp(12),dp(8));background=ripple(bg(cardBg,12));elevation=dp(1).toFloat();setOnClickListener{action()};isFocusable=true;contentDescription="Volver a $title";letterSpacing=-.01f};root.addView(v,LinearLayout.LayoutParams(-1,-2).apply{bottomMargin=dp(8)})
 }
 private fun sticky(title:String,action:()->Unit){dock.visibility=View.VISIBLE;button(dock,title,action=action)}
 private fun steps(current:Int,titles:List<String>,change:(Int)->Unit){
  val row=LinearLayout(this);root.addView(row,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(12);bottomMargin=dp(14)})
  titles.forEachIndexed{i,title->val v=TextView(this).apply{text="${i+1}  $title";textSize=12f;gravity=Gravity.CENTER;setTextColor(if(i==current)Color.WHITE else navy);background=ripple(bg(if(i==current)navy else pale,14));elevation=if(i==current)dp(2).toFloat() else dp(1).toFloat();minHeight=dp(52);setPadding(dp(6),dp(10),dp(6),dp(10));setTypeface(null,if(i==current)Typeface.BOLD else Typeface.NORMAL);letterSpacing=if(i==current).01f else 0f;isFocusable=true;setOnClickListener{change(i)}};row.addView(v,LinearLayout.LayoutParams(0,-2,1f).apply{if(i>0)leftMargin=dp(8)})}
 }
 private fun actionTile(parent:LinearLayout,title:String,subtitle:String,icon:String="●",action:()->Unit){
  val tile=LinearLayout(this).apply{orientation=LinearLayout.HORIZONTAL;gravity=Gravity.CENTER_VERTICAL;background=ripple(bg(cardBg,20));elevation=dp(3).toFloat();setPadding(dp(18),dp(16),dp(18),dp(16));isClickable=true;isFocusable=true;alpha=0.9f;translationX=-dp(12).toFloat();setOnClickListener{tile.animate().scaleX(.97f).scaleY(.97f).setDuration(80).withEndAction{tile.animate().scaleX(1f).scaleY(1f).setDuration(120).start()}.start();postDelayed({action()},40)};contentDescription="$title. $subtitle"}
  tile.addView(TextView(this).apply{text=icon;textSize=24f;gravity=Gravity.CENTER;background=bg(if(isDarkMode)Color.rgb(66,100,140) else Color.rgb(228,238,254),16);setPadding(dp(4),dp(4),dp(4),dp(4))},LinearLayout.LayoutParams(dp(56),dp(56)))
  val texts=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(18),0,dp(12),0)}
  label(texts,title,19f,navy,true).setPadding(0,0,0,dp(3));label(texts,subtitle,13f,muted).setPadding(0,0,0,0)
  tile.addView(texts,LinearLayout.LayoutParams(0,-2,1f))
  tile.addView(TextView(this).apply{text="›";textSize=28f;setTextColor(blue);setPadding(dp(8),0,0,0)})
  parent.addView(tile,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(14);bottomMargin=dp(8)});tile.animate().alpha(1f).translationX(0f).setDuration(300).setInterpolator(android.view.animation.DecelerateInterpolator()).start()
 }
 private fun truckSelector(c:LinearLayout){
  label(c,"Seleccionar camión",13f,muted,true)
  val catalog=mobile.catalog().optJSONArray("equipos");val choices=mutableListOf("Sin seleccionar")
  if(catalog!=null)for(i in 0 until catalog.length()){val e=catalog.getJSONObject(i);choices.add(e.optString("tipo")+e.optString("matriculaCamion").let{if(it.isBlank())"" else " · $it"})}
  if(choices.size==1)choices.addAll(trucks.drop(1))
  if(truck.isNotBlank()&&!choices.contains(truck))choices.add(truck)
  val spinner=Spinner(this).apply{adapter=ArrayAdapter(this@MainActivity,android.R.layout.simple_spinner_dropdown_item,choices);minimumHeight=dp(56);background=bg(if(isDarkMode)Color.rgb(66,66,66) else pale,14)};c.addView(spinner,LinearLayout.LayoutParams(-1,dp(60)).apply{topMargin=dp(8);bottomMargin=dp(12)})
  spinner.setSelection(choices.indexOf(truck).coerceAtLeast(0));spinner.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,pos:Int,id:Long){truck=if(pos>0)choices[pos] else ""}}
 }
 private fun choice(c:LinearLayout,title:String,selected:Boolean,action:()->Unit){
  button(c,(if(selected)"●  " else "○  ")+title,selected,navy,action)
 }
 private fun label(p:LinearLayout,s:String,size:Float=16f,color:Int=navy,bold:Boolean=false):TextView{val v=TextView(this).apply{text=s;textSize=size;setTextColor(color);if(bold){setTypeface(null,Typeface.BOLD);letterSpacing=.01f};setPadding(0,dp(8),0,dp(10));lineHeight=dp((size*1.4).toInt());alpha=0.8f};p.addView(v,LinearLayout.LayoutParams(-1,-2));v.animate().alpha(1f).setDuration(200).start();return v}
 private fun card():LinearLayout{val v=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;background=bg(cardBg,24);elevation=dp(4).toFloat();setPadding(dp(20),dp(18),dp(20),dp(18));alpha=0.9f;scaleY=0.95f};root.addView(v,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(14);bottomMargin=dp(6)});v.animate().alpha(1f).scaleY(1f).setDuration(300).setInterpolator(android.view.animation.DecelerateInterpolator()).start();return v}
 private fun button(p:LinearLayout,s:String,primary:Boolean=true,color:Int=blue,action:()->Unit):Button{val v=Button(this).apply{text=s;isAllCaps=false;textSize=16f;setTypeface(null,Typeface.BOLD);setTextColor(if(primary)Color.WHITE else color);backgroundTintList=null;background=if(primary)ripple(grad(color,androidx.core.graphics.ColorUtils.blendARGB(color,Color.BLACK,.12f),18),Color.argb(60,255,255,255)) else ripple(bg(if(isDarkMode)Color.rgb(66,66,66) else Color.rgb(231,239,253),18));if(primary)elevation=dp(3).toFloat();minHeight=dp(56);stateListAnimator=null;setPadding(dp(16),dp(12),dp(16),dp(12));letterSpacing=.02f;setOnClickListener{animate().scaleX(.98f).scaleY(.98f).setDuration(100).withEndAction{animate().scaleX(1f).scaleY(1f).setDuration(150).start()}.start();postDelayed({action()},50)}};p.addView(v,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(14)});return v}
 private fun field(p:LinearLayout,s:String,type:Int):EditText{label(p,s,13f,muted,true);return EditText(this).apply{inputType=type;textSize=17f;setTextColor(navy);background=bg(if(isDarkMode)Color.rgb(66,66,66) else pale,16);setPadding(dp(16),dp(16),dp(16),dp(16));isSingleLine=true;elevation=dp(1).toFloat();p.addView(this,LinearLayout.LayoutParams(-1,dp(60)))}}
 private fun login(){page("login");label(root,"Tu viaje empieza acá.",32f,navy,true);label(root,"Ingresá con tu cuenta de chofer.",16f,muted)
  val c=card();label(c,"Iniciar sesión",21f,navy,true);val email=field(c,"Correo electrónico",InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS);email.setText(getSharedPreferences("gps",MODE_PRIVATE).getString("email",""));val pass=field(c,"Contraseña",InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_VARIATION_PASSWORD);val msg=label(c,"",14f,muted)
  lateinit var submit:Button;submit=button(c,"Ingresar"){val e=email.text.toString().trim().lowercase();val p=pass.text.toString();if(e.isBlank()||p.isBlank()){msg.text="Completá correo y contraseña";return@button};submit.isEnabled=false;msg.text="Ingresando…"
   thread{try{api.login(e,p);name=driverName();runOnUiThread{pass.text.clear();homeOrTrip();Sync.schedule(this);thread{try{mobile.catalog(true);runOnUiThread{if(screen=="prepare")prepare()}}catch(_:Exception){}}}}catch(_:Exception){runOnUiThread{submit.isEnabled=true;msg.text="No se pudo ingresar. Revisá tus datos y la conexión."}}}}
  label(root,"Tu sesión queda guardada de forma segura en este teléfono.",13f,muted)
 }
 private fun driverName():String{val u=api.session()?.optJSONObject("user")?:return "Chofer";val m=u.optJSONObject("user_metadata");val known=mapOf("immer@trferreira.com" to "Immer Sampayo","luis@trferreira.com" to "Luis Ferreira","hugo@trferreira.com" to "Hugo Silva");return m?.optString("full_name")?.takeIf{it.isNotBlank()}?:m?.optString("name")?.takeIf{it.isNotBlank()}?:known[u.optString("email")]?:u.optString("email").substringBefore("@").replaceFirstChar{it.uppercase()}}
 private fun homeOrTrip(){if(isOwner)ownerDashboard() else if(store.current()?.optBoolean("active")==true)trip() else home()}
 private fun home(){
  page("home");label(root,"Hola, $name 👋",30f,navy,true);label(root,"¿Qué vas a hacer hoy?",16f,muted)
  val active=store.current()?.optBoolean("active")==true
  val hero=card().apply{background=grad(navy,Color.rgb(22,78,190),24)}
  label(hero,if(active)"TU VIAJE ESTÁ EN CURSO" else "LISTO PARA SALIR",11f,Color.rgb(155,190,245),true)
  label(hero,if(active)store.current()!!.optString("vehicle") else "Un nuevo viaje",25f,Color.WHITE,true)
  label(hero,if(active)"Volvé para ver kilómetros y registrar cargas." else "Podés salir ahora y completar los datos después.",14f,Color.rgb(212,225,245))
  button(hero,if(active)"Ver viaje  →" else "Nuevo viaje  →"){
   if(active)trip() else startTripDashboard()
  }
  actionTile(root,"Combustible",if(active)"Cargar en este viaje o fuera de él" else "Registrar una carga fuera de viaje",icon="⛽"){
   if(active)AlertDialog.Builder(this).setTitle("¿Dónde registrar la carga?").setItems(arrayOf("En el viaje en curso","Fuera de viaje")){_,i->openFuel(if(i==0)store.current() else null)}.show() else openFuel(null)
  }
  actionTile(root,"Mi historial","Mis viajes y cargas de combustible",icon="🗂️"){
   AlertDialog.Builder(this).setTitle("Mi historial").setItems(arrayOf("Mis viajes","Mi combustible")){_,i->history(if(i==0)"trips" else "fuel",true)}.show()
  }
  sync=label(root,store.message(),12f,muted)
  back("Cuenta y sincronización · v${appVersion}"){settings()}
 }
 private fun settings(){
  page("settings");back{home()};label(root,"Mi cuenta",28f,navy,true);label(root,name,20f,navy,true);label(root,"Versión ${appVersion}",14f,muted)
  val c=card();sync=label(c,store.message(),14f,muted)
  button(c,"Actualizar y enviar pendientes"){Sync.schedule(this);thread{try{mobile.catalog(true);runOnUiThread{toast("Catálogos actualizados")}}catch(_:Exception){runOnUiThread{toast("Sin conexión. Los datos siguen guardados.")}}}}
  button(root,"Renovar acceso",false){login()}
  button(root,"Cerrar sesión",false){if(store.current()?.optBoolean("active")==true||store.pendingCount()>0){toast("Finalizá el viaje y enviá los datos pendientes antes de cerrar sesión.");return@button};api.clear();login()}
 }
 private fun ownerDashboard(){
  page("owner");label(root,"Hola, $name 👋",30f,navy,true);label(root,"Flota y gestión en vivo",16f,muted)
  val fleetData=mobile.fleet();val activeTrips=fleetData.optJSONArray("active")?:JSONArray();val locations=fleetData.optJSONArray("locations")?:JSONArray()
  val hero=card().apply{background=grad(navy,Color.rgb(22,78,190),24)}
  label(hero,"FLOTA EN VIVO",11f,Color.rgb(155,190,245),true);label(hero,"${activeTrips.length()} viaje${if(activeTrips.length()!=1)"s" else ""} en curso",25f,Color.WHITE,true)
  label(hero,"${locations.length()} equipos activos",14f,Color.rgb(212,225,245))
  button(hero,"Ver mapa completo  →"){ownerFleetMap()}
  actionTile(root,"Todos los viajes","Historial de todos los equipos",icon="🗂️"){history("trips",true)}
  actionTile(root,"Combustible","Historial de cargas de toda la flota",icon="⛽"){history("fuel",true)}
  val c=card();label(c,"Viajes activos ahora",19f,navy,true)
  if(activeTrips.length()==0)label(c,"Sin viajes en curso",14f,muted) else for(i in 0 until minOf(activeTrips.length(),5)){val trip=activeTrips.getJSONObject(i);label(c,"${trip.optString("vehicle")} · ${String.format(Locale("es","UY"),"%.1f",trip.optDouble("distance_meters",0.0)/1000)} km",14f,navy);label(c,"Iniciado hace ${String.format("%d",System.currentTimeMillis()-java.time.Instant.parse(trip.optString("started_at")).toEpochMilli())/60000} min",12f,muted)}
  sync=label(root,store.message(),12f,muted)
  back("Cuenta  · v${appVersion}"){settings()}
 }
 private fun ownerFleetMap(){
  page("fleetmap");back("Dashboard",action={ownerDashboard()})
  label(root,"Mapa de flota en vivo",28f,navy,true);label(root,"Ubicación actual de todos los equipos",14f,muted)
  val fleetData=mobile.fleet();val locations=fleetData.optJSONArray("locations")?:JSONArray()
  if(locations.length()>0){activeMap=TripMap.view(this,locations.getJSONObject(0).optDouble("latitude"),locations.getJSONObject(0).optDouble("longitude"));root.addView(activeMap,LinearLayout.LayoutParams(-1,dp(450)).apply{topMargin=dp(12);bottomMargin=dp(12)})}
  val c=card();label(c,"Equipos conectados",19f,navy,true)
  for(i in 0 until locations.length()){val loc=locations.getJSONObject(i);label(c,"${loc.optString("vehicle")} · Actualizado hace ${String.format("%d",(System.currentTimeMillis()-java.time.Instant.parse(loc.optString("updated_at")).toEpochMilli())/60000)} min",14f,navy);label(c,"${String.format(Locale.US,"%.5f",loc.optDouble("latitude"))}, ${String.format(Locale.US,"%.5f",loc.optDouble("longitude"))}",11f,muted)}
 }
 private fun startTripDashboard(){
  page("startdash");back("Inicio"){home()}
  label(root,"Iniciar viaje",28f,navy,true);label(root,"¿Cómo quieres empezar?",16f,muted)
  val quick=card().apply{background=grad(Color.rgb(56,142,60),Color.rgb(27,94,32),24);elevation=dp(4).toFloat();setPadding(dp(20),dp(24),dp(20),dp(24))}
  label(quick,"RÁPIDO",11f,Color.rgb(165,214,167),true);label(quick,"Solo GPS y kilómetros",22f,Color.WHITE,true);label(quick,"Inicia ahora, datos automáticos. Perfecto si apuras.",14f,Color.rgb(198,239,206));button(quick,"Salir ahora  →",true,Color.rgb(76,175,80)){tripForm=JSONObject();draftDocs=JSONArray();empty=false;tripStep=0;beginTrip()};root.addView(quick,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(16);bottomMargin=dp(12)})
  val detailed=card().apply{background=grad(navy,Color.rgb(22,78,190),24);elevation=dp(4).toFloat();setPadding(dp(20),dp(24),dp(20),dp(24))}
  label(detailed,"COMPLETO",11f,Color.rgb(155,190,245),true);label(detailed,"Con cliente, carga y destino",22f,Color.WHITE,true);label(detailed,"Completá los datos. Toma 2 minutos, ayuda a la gestión.",14f,Color.rgb(212,225,245));button(detailed,"Completar datos  →",true,navy){tripForm=JSONObject();draftDocs=JSONArray();empty=false;tripStep=0;prepare()};root.addView(detailed,LinearLayout.LayoutParams(-1,-2).apply{topMargin=dp(12);bottomMargin=dp(12)})
  label(root,"Podés cambiar de opinión durante el viaje.",13f,muted)
 }
 private fun prepare(){
  page("prepare");back(if(tripStep==0)"Inicio" else "Paso anterior"){if(tripStep>0){tripStep--;prepare()}else home()}
  label(root,"Nuevo viaje",28f,navy,true)
  steps(tripStep,listOf("Viaje","Datos","Remitos")){tripStep=it;prepare()}
  when(tripStep){
   0->{val c=card();label(c,"¿Con qué camión?",21f,navy,true);label(c,"Opcional · podés dejarlo pendiente",13f,muted);truckSelector(c)
    label(c,"¿Qué tipo de viaje?",20f,navy,true)
    choice(c,"Viaje con carga",!empty){empty=false;prepare()};choice(c,"Retorno vacío",empty){empty=true;prepare()}
    button(root,"Agregar destino y datos  →",false){tripStep=1;prepare()}
   }
   1->{val c=card();label(c,"¿A dónde vas?",21f,navy,true);bound(c,"Destino previsto · opcional",tripForm,"destino");button(c,"Buscar lugar",false){searchDestination()}
    select(c,"Cliente · opcional",tripForm,"cliente",catalogNames("clientes")){tripForm.put("tipoCarga","");prepare()}
    if(!empty){select(c,"Carga · opcional",tripForm,"tipoCarga",cargoNames(tripForm.optString("cliente")));bound(c,"Kilogramos · opcional",tripForm,"kg",true)}
    label(c,"El origen y el recorrido se registran por GPS.",13f,muted)
    button(root,"Agregar remitos  →",false){tripStep=2;prepare()}
   }
   else->{val c=card();label(c,"Tus remitos",21f,navy,true);label(c,"Podés agregarlos ahora, durante el viaje o al llegar.",14f,muted)
    if(draftDocs.length()==0)label(c,"Todavía no agregaste remitos.",15f,muted)
    for(i in 0 until draftDocs.length()){val d=draftDocs.getJSONObject(i);val title="${if(d.optString("kind")=="arrival")"Llegada" else "Salida"} · ${d.optString("number").ifBlank{"Sin número"}}";button(c,"$title   ×",false){AlertDialog.Builder(this).setTitle("¿Quitar este remito?").setMessage(title).setNegativeButton("Conservar",null).setPositiveButton("Quitar"){_,_->draftDocs.remove(i);prepare()}.show()}}
    button(root,"+ Agregar remito",false){openDocument(null,"prepare","departure")}
   }
  }
  sticky("Iniciar viaje ahora  →"){begin()}
  label(dock,"Todos los datos son opcionales",12f,muted).gravity=Gravity.CENTER
 }
 private fun requestStart(){
  val req=mutableListOf(Manifest.permission.ACCESS_FINE_LOCATION,Manifest.permission.ACCESS_COARSE_LOCATION);if(Build.VERSION.SDK_INT>=33)req.add(Manifest.permission.POST_NOTIFICATIONS)
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
  when(action){GpsService.PAUSE->store.update{it.put("paused",true)};GpsService.RESUME->store.update{it.put("paused",false).put("segment",it.optInt("segment")+1)};GpsService.FINISH->store.update{it.put("active",false).put("paused",false).put("ended_at",java.time.Instant.now().toString())}}
  Sync.schedule(this)
 }
 private fun trip(){
  val t=store.current()?:return home();page("trip");back{home()}
  status=label(root,"VIAJE EN CURSO",12f,blue,true).apply{background=bg(Color.WHITE,14);setPadding(dp(14),dp(6),dp(14),dp(6));elevation=dp(1).toFloat();(layoutParams as LinearLayout.LayoutParams).apply{width=-2;topMargin=dp(6)}};label(root,t.optString("vehicle"),25f,navy,true);label(root,if(t.optString("load_type")=="empty")"Retorno vacío" else "Viaje con carga",14f,muted)
  val c=card().apply{background=grad(navy,Color.rgb(22,78,190),24)}
  val row=LinearLayout(this);c.addView(row)
  val left=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL};val right=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(dp(12),0,0,0)}
  row.addView(left,LinearLayout.LayoutParams(0,-2,1f));row.addView(right,LinearLayout.LayoutParams(0,-2,1f))
  label(left,"RECORRIDO",11f,Color.rgb(155,190,245),true);distance=label(left,"0,0",42f,Color.WHITE,true);label(left,"kilómetros GPS",12f,Color.WHITE)
  label(right,"VELOCIDAD",11f,Color.rgb(155,190,245),true);speed=label(right,"—",42f,Color.WHITE,true);label(right,"km/h",12f,Color.WHITE)
  gps=label(c,"Esperando ubicación precisa…",13f,Color.rgb(212,225,245))
  val dest=store.details().firstOrNull{it.second.optString("trip_id")==t.getString("id")}?.second?.optJSONObject("data")
  trackOffset=0L;val live=TripMap.live(this,dest?.optDouble("destination_lat",Double.NaN)?:Double.NaN,dest?.optDouble("destination_lng",Double.NaN)?:Double.NaN)
  liveMap=live;activeMap=live.web;root.addView(live.web,LinearLayout.LayoutParams(-1,dp(340)).apply{topMargin=dp(12);bottomMargin=dp(12)})
  pause=button(root,"Pausar viaje",false){try{service(if(store.current()?.optBoolean("paused")==true)GpsService.RESUME else GpsService.PAUSE)}catch(_:Exception){toast("Revisá el permiso de ubicación")}}
  actionTile(root,"Cargar combustible","Foto de boleta o ingreso manual",icon="⛽"){openFuel(store.current())}
  actionTile(root,"Agregar remito","Salida o llegada · número y/o foto",icon="🧾"){openDocument(store.current(),"trip","arrival")}
  if(!(getSystemService(POWER_SERVICE) as PowerManager).isIgnoringBatteryOptimizations(packageName))actionTile(root,"Evitar cortes del GPS","Permitir que la app siga en segundo plano",icon="🔋"){batteryExemption()}
  count=label(root,"",12f,muted);sync=label(root,store.message(),12f,muted)
  back("Revisar ubicación GPS"){requestStart()}
  dock.visibility=View.VISIBLE;button(dock,"Finalizar viaje",false,Color.rgb(182,47,52)){AlertDialog.Builder(this).setTitle("¿Finalizar este viaje?").setMessage("Se guardarán el recorrido, las boletas y los remitos.").setNegativeButton("Seguir viaje",null).setPositiveButton("Finalizar"){_,_->try{service(GpsService.FINISH)}catch(_:Exception){toast("No se pudo finalizar. Reintentá.")}}.show()}
  refresh();try{service()}catch(_:Exception){gps?.text="Revisá el permiso de ubicación para continuar"}
 }
 @android.annotation.SuppressLint("BatteryLife") private fun batteryExemption(){
  try{startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,Uri.parse("package:$packageName")))}
  catch(_:Exception){try{startActivity(Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS))}catch(_:Exception){toast("Abrí Ajustes › Batería y permití que la app funcione sin restricciones")}}
 }
 private fun refresh(){if(!::store.isInitialized)return;sync?.text=store.message();if(screen!="trip")return;val t=store.current()?:return;if(!t.optBoolean("active")){home();toast("Viaje finalizado. Los datos pendientes se enviarán con conexión.");return}
  val paused=t.optBoolean("paused");status?.text=if(paused)"VIAJE PAUSADO" else "VIAJE EN CURSO";status?.setTextColor(if(paused)Color.rgb(159,101,15) else Color.rgb(12,119,90));distance?.text=String.format(Locale("es","UY"),"%.1f",t.optDouble("distance_meters",0.0)/1000);pause?.text=if(paused)"Reanudar viaje" else "Pausar viaje"
  val recent=try{System.currentTimeMillis()-java.time.Instant.parse(t.optJSONObject("last_point")?.optString("recorded_at")).toEpochMilli()<30000}catch(_:Exception){false};speed?.text=if(paused)"0" else if(recent)String.format(Locale("es","UY"),"%.0f",t.optDouble("speed_kmh",0.0)) else "—";val warn=store.warning();gps?.text=if(paused)"El GPS y los kilómetros están pausados" else if(warn.isNotBlank())"⚠ "+warn else if(recent)"GPS actualizado" else "Esperando señal GPS precisa…";val n=store.receiptCount(t.getString("id"));count?.text=if(n==0)"Sin boletas adjuntas" else "$n boleta(s) vinculada(s) a este viaje"
  liveMap?.let{map->val (points,end)=store.track(t.getString("id"),trackOffset);trackOffset=end;map.push(points)}
 }
 private fun openFuel(t:JSONObject?){photoJob++;photoBusy=false;fuelStep=0;fuelTrip=t;fuelForm=JSONObject().put("receipt_date",java.time.LocalDate.now().toString());photo=null;photoMode="fuel";fuel()}
 private fun fuel(){
  page("fuel");photoMode="fuel";back(if(fuelStep==0)"Volver" else "Foto"){if(fuelStep>0){fuelStep=0;fuel()}else homeOrTrip()}
  label(root,"Cargar combustible",28f,navy,true)
  label(root,if(fuelTrip==null)"Fuera de viaje" else "En este viaje · ${fuelTrip!!.optString("vehicle")}",14f,muted)
  steps(fuelStep,listOf("Comprobante","Datos")){fuelStep=it;fuel()}
  if(fuelStep==0){val c=card();label(c,"La boleta, primero",22f,navy,true);label(c,"Sacá una foto o elegí una guardada. También podés continuar sin foto.",14f,muted);photoControls(c)
   sticky(if(photo==null)"Continuar sin foto  →" else "Continuar  →"){fuelStep=1;fuel()};return
  }
  val c=card()
  if(fuelTrip==null){label(c,"Camión · opcional",13f,muted,true);truckSelector(c)}
  button(c,"Fecha: ${fuelForm.optString("receipt_date",java.time.LocalDate.now().toString())}",false){
   val date=java.time.LocalDate.parse(fuelForm.optString("receipt_date",java.time.LocalDate.now().toString()));DatePickerDialog(this,{_,y,m,d->fuelForm.put("receipt_date",java.time.LocalDate.of(y,m+1,d).toString());fuel()},date.year,date.monthValue-1,date.dayOfMonth).show()
  }
  val stations=mobile.catalog().optJSONArray("estaciones")?:JSONArray();val names=(0 until stations.length()).map{stations.getJSONObject(it).optString("nombre")}
  if(names.isEmpty())bound(c,"Estación de servicio · obligatoria",fuelForm,"station_name") else {select(c,"Estación de servicio",fuelForm,"station_name",names){fuel()};bound(c,"Nombre de estación · podés escribir otra",fuelForm,"station_name")}
  bound(c,"Litros · opcional",fuelForm,"liters",true);bound(c,"Total en UYU · opcional",fuelForm,"total",true)
  label(c,if(photo==null)"Sin foto adjunta" else "✓ Boleta adjunta",13f,muted)
  dock.visibility=View.VISIBLE
  button(dock,"Guardar combustible"){
   if(photoBusy){toast("Esperá a que termine de prepararse la foto");return@button}
   if(fuelForm.optString("station_name").isBlank()){toast("Indicá la estación de servicio para guardar el combustible");return@button}
   try{val fields=JSONObject(fuelForm.toString());for(key in listOf("liters","total")){val raw=fields.optString(key);val n=raw.replace(',','.').toDoubleOrNull();if(raw.isNotBlank()&&(n==null||!n.isFinite()||n<0)){toast("Revisá litros e importe");return@button};fields.put(key,n?:JSONObject.NULL)}
    for(i in 0 until stations.length()){val station=stations.getJSONObject(i);if(station.optString("nombre")==fields.optString("station_name"))fields.put("station_id",station.optString("id"))}
    store.saveReceipt(photo,fuelTrip,api.session()!!.getJSONObject("user"),name,truck,fields);photo=null;Sync.schedule(this);toast("Combustible guardado");homeOrTrip()
   }catch(_:Exception){toast("No se pudo guardar. Revisá el espacio del teléfono.")}
  };label(root,"Se enviará al panel cuando haya conexión.",13f,muted)
 }
 private fun openDocument(t:JSONObject?,target:String,kind:String){photoJob++;photoBusy=false;docTrip=t;docReturn=target;docForm=JSONObject().put("kind",kind);photo=null;docStep=0;document()}
 private fun document(){
  page("document");photoMode="document";back(if(docStep==0)"Volver" else "Comprobante"){if(docStep>0){docStep=0;document()}else backFromDocument()}
  label(root,"Agregar remito",28f,navy,true);steps(docStep,listOf("Comprobante","Detalles")){docStep=it;document()}
  val c=card()
  if(docStep==0){label(c,"¿De dónde es?",21f,navy,true)
   choice(c,"Salida de chacra / planta",docForm.optString("kind")!="arrival"){docForm.put("kind","departure");document()}
   choice(c,"Llegada a destino",docForm.optString("kind")=="arrival"){docForm.put("kind","arrival");document()}
   bound(c,"Número · opcional",docForm,"number");photoControls(c)
   button(root,"Agregar carga y kilos  →",false){docStep=1;document()}
  }else{
   label(c,"Datos de la carga",21f,navy,true);label(c,"Completá lo que tengas; todo es opcional.",14f,muted)
   select(c,"Tipo de carga · opcional",docForm,"cargo_type",catalogNames("tiposCarga"));bound(c,"Kilogramos · opcional",docForm,"kg",true)
   label(c,"${if(docForm.optString("kind")=="arrival")"Llegada" else "Salida"} · ${docForm.optString("number").ifBlank{"Sin número"}}",15f,navy,true);label(c,if(photo==null)"Sin foto" else "✓ Foto adjunta",13f,muted)
  }
  dock.visibility=View.VISIBLE
  button(dock,"Guardar remito"){
   if(photoBusy){toast("Esperá a que termine de prepararse la foto");return@button}
   try{val d=JSONObject(docForm.toString());val raw=d.optString("kg");val n=raw.replace(',','.').toDoubleOrNull();if(raw.isNotBlank()&&(n==null||!n.isFinite()||n<0)){toast("Revisá los kilogramos");return@button};d.put("kg",n?:JSONObject.NULL)
    if(docTrip==null){photo?.let{d.put("draft_photo",it.path)};draftDocs.put(d)}else{store.saveDocument(docTrip!!,d,photo);Sync.schedule(this)}
    photo=null;toast("Remito agregado. Podés agregar otro.");backFromDocument()
   }catch(_:Exception){toast("No se pudo guardar el remito")}
  }
 }
 private fun backFromDocument(){when(docReturn){"prepare"->prepare();"tripdetail"->historyTrip?.let{detail(it,true)};else->trip()}}
 private fun photoControls(c:LinearLayout){
  photo?.takeIf{it.exists()}?.let{f->c.addView(ImageView(this).apply{setImageURI(Uri.fromFile(f));adjustViewBounds=true;contentDescription="Vista previa del comprobante";background=bg(pale,12)},LinearLayout.LayoutParams(-1,dp(160)).apply{topMargin=dp(8);bottomMargin=dp(12)})}
  button(c,if(photo==null)"Sacar foto" else "Cambiar foto",false){try{camera=File(File(filesDir,"camera").apply{mkdirs()},"${UUID.randomUUID()}.jpg");take.launch(FileProvider.getUriForFile(this,"$packageName.files",camera!!))}catch(_:Exception){toast("No hay cámara disponible. Elegí una imagen de la galería.")}}
  button(c,"Elegir foto de la galería",false){pick.launch("image/*")}
 }
 private fun bound(c:LinearLayout,title:String,data:JSONObject,key:String,number:Boolean=false):EditText{
  val v=field(c,title,if(number)InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL else InputType.TYPE_CLASS_TEXT)
  v.setText(data.optString(key).takeUnless{it=="null"}?:"");v.addTextChangedListener(object:TextWatcher{override fun beforeTextChanged(s:CharSequence?,start:Int,count:Int,after:Int){};override fun onTextChanged(s:CharSequence?,start:Int,before:Int,count:Int){data.put(key,s.toString())};override fun afterTextChanged(e:Editable?){} });return v
 }
 private fun select(c:LinearLayout,title:String,data:JSONObject,key:String,values:List<String>,changed:(String)->Unit={}){
  label(c,title,13f,muted,true);val options=listOf("Sin seleccionar")+(values+data.optString(key)).distinct().filter{it.isNotBlank()};val spinner=Spinner(this).apply{adapter=ArrayAdapter(this@MainActivity,android.R.layout.simple_spinner_dropdown_item,options);minimumHeight=dp(60);background=bg(if(isDarkMode)Color.rgb(66,66,66) else pale,14);setPadding(dp(12),dp(8),dp(12),dp(8))};c.addView(spinner,LinearLayout.LayoutParams(-1,dp(60)).apply{topMargin=dp(8);bottomMargin=dp(10)})
  spinner.setSelection(options.indexOf(data.optString(key)).coerceAtLeast(0));spinner.onItemSelectedListener=object:AdapterView.OnItemSelectedListener{override fun onNothingSelected(p:AdapterView<*>?){};override fun onItemSelected(p:AdapterView<*>?,v:View?,pos:Int,id:Long){val next=if(pos==0)"" else options[pos];val previous=data.optString(key);data.put(key,next);if(previous!=next)changed(next)}}
 }
 private fun cargoNames(client:String):List<String>{
  val entries=mobile.catalog().optJSONArray("clientesDetalle")?:JSONArray()
  for(i in 0 until entries.length()){val e=entries.getJSONObject(i);if(e.optString("nombre").equals(client,true)){val a=e.optJSONArray("cargas")?:JSONArray();if(a.length()>0)return (0 until a.length()).map{a.optString(it)}}}
  return catalogNames("tiposCarga")
 }
 private fun fullMap(points:JSONArray){
  val dialog=android.app.Dialog(this,android.R.style.Theme_Material_Light_NoActionBar)
  val layout=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(0,dp(12),0,dp(12));setBackgroundColor(Color.WHITE)}
  button(layout,"Cerrar mapa",false){dialog.dismiss()}
  val web=TripMap.view(this,points);layout.addView(web,LinearLayout.LayoutParams(-1,0,1f));dialog.setContentView(layout)
  dialog.setOnDismissListener{web.destroy()};dialog.show();dialog.window?.setLayout(-1,-1)
  ViewCompat.setOnApplyWindowInsetsListener(layout){v,i->val insets=i.getInsets(WindowInsetsCompat.Type.systemBars());v.setPadding(insets.left,insets.top,insets.right,insets.bottom);i}
 }
 private fun catalogNames(key:String):List<String>{val a=mobile.catalog().optJSONArray(key)?:JSONArray();return (0 until a.length()).map{a.optString(it)}}
 private fun searchDestination(){
  val q=tripForm.optString("destino");if(q.isBlank()){toast("Escribí un lugar para buscar. También podés iniciar sin destino.");return};toast("Buscando destino…")
  thread{try{@Suppress("DEPRECATION") val found=Geocoder(this,Locale("es","UY")).getFromLocationName(q,5)?:emptyList();runOnUiThread{if(screen!="prepare")return@runOnUiThread;if(found.isEmpty()){toast("No se encontraron resultados. Podés conservar el nombre escrito.");return@runOnUiThread};AlertDialog.Builder(this).setTitle("Elegí un destino").setItems(found.map{it.getAddressLine(0)?:it.featureName?:q}.toTypedArray()){_,i->val a=found[i];tripForm.put("destino",a.getAddressLine(0)?:q).put("destination_lat",a.latitude).put("destination_lng",a.longitude);prepare()}.setNegativeButton("Cancelar",null).show()}}catch(_:Exception){runOnUiThread{toast("Búsqueda no disponible. Podés iniciar con el destino escrito o sin destino.")}}}
 }
 private fun history(kind:String,refresh:Boolean=false){
  val key=if(kind=="trips")"triphistory" else "fuelhistory";page(key);back{home()};label(root,if(kind=="trips")"Mis viajes" else "Mi combustible",28f,navy,true);label(root,"Solo registros de $name, en todos los camiones.",14f,muted)
  val rows=mobile.history(kind,historyLimit);if(rows.length()==0)label(root,"Todavía no hay registros guardados.",16f,muted)
  for(i in 0 until rows.length()){val row=rows.getJSONObject(i);val c=card()
   if(kind=="trips"){label(c,row.optString("vehicle").ifBlank{"Sin camión asignado"},19f,navy,true);label(c,"${date(row.optString("started_at"))} · ${if(row.optBoolean("active"))if(row.optBoolean("paused"))"Pausado" else "En curso" else "Finalizado"}",14f,muted);label(c,"${String.format(Locale("es","UY"),"%.1f",row.optDouble("distance_meters",0.0)/1000)} km GPS · ${if(row.optString("load_type")=="empty")"Retorno vacío" else "Viaje común"}",14f,muted);button(c,"Ver datos, remitos y mapa",false){detail(row,true)}}
   else{val d=row.optJSONObject("panel_data")?:JSONObject();label(c,d.optString("estacionNombre").ifBlank{row.optString("station_name").ifBlank{"Estación por completar"}},19f,navy,true);label(c,"${d.optString("fecha").ifBlank{row.optString("receipt_date")}} · ${d.optString("vehicle").ifBlank{row.optString("vehicle")}}",14f,muted);label(c,"${value(d,"litros",row,"liters")} L · ${d.optString("moneda").ifBlank{"UYU"}} ${value(d,"monto",row,"total")}");label(c,if(row.isNull("trip_id"))"Fuera de viaje" else "Vinculado a un viaje",13f,muted);if(!row.isNull("object_path"))button(c,"Ver boleta",false){showPhoto(row,"trf-fuel-receipts")}}
  }
  button(root,"Actualizar historial",false){history(kind,true)};button(root,"Cargar más",false){historyLimit+=50;history(kind,true)}
  if(refresh)thread{try{mobile.history(kind,historyLimit,true);runOnUiThread{if(screen==key)history(kind)}}catch(_:Exception){runOnUiThread{toast("Sin conexión. Mostrando los registros guardados en este teléfono.")}}}
 }
 private fun value(a:JSONObject,k:String,b:JSONObject,l:String)=a.optString(k).takeUnless{it.isBlank()||it=="null"}?:b.optString(l).takeUnless{it.isBlank()||it=="null"}?:"Pendiente"
 private fun detail(t:JSONObject,refresh:Boolean=false){
  historyTrip=t;page("tripdetail");back("Mis viajes"){history("trips")};label(root,t.optString("vehicle"),27f,navy,true)
  val bundle=mobile.detail(t);val d=bundle.optJSONObject("data")?:JSONObject();val docs=bundle.optJSONArray("documents")?:JSONArray();val c=card()
  fun coord(lat:String,lng:String)=if(t.has(lat)&&!t.isNull(lat))"${String.format(Locale.US,"%.5f",t.optDouble(lat))}, ${String.format(Locale.US,"%.5f",t.optDouble(lng))}" else "Sin lectura GPS"
  label(c,"Origen: ${d.optString("origen").ifBlank{coord("origin_lat","origin_lng")}}")
  label(c,"Destino: ${d.optString("destino").ifBlank{"Sin destino previsto"}}")
  label(c,"Última ubicación / llegada: ${coord("arrival_lat","arrival_lng")}",14f,muted)
  label(c,"Cliente: ${d.optString("cliente").ifBlank{"Pendiente"}}\nCarga: ${d.optString("tipoCarga").ifBlank{if(t.optString("load_type")=="empty")"Retorno vacío" else "Pendiente"}}\nKilogramos: ${d.optString("kg").ifBlank{"Pendiente"}}\nDistancia: ${d.optString("km").ifBlank{String.format(Locale.US,"%.1f",t.optDouble("distance_meters",0.0)/1000)}} km")
  if(d.optString("remito").isNotBlank())label(c,"Remitos completados en el panel: ${d.optString("remito")}")
  label(root,"Recorrido registrado",21f,navy,true);val points=mobile.route(t)
  if(points.length()>0){button(root,"Ver mapa en pantalla completa",false){fullMap(points)};activeMap=TripMap.view(this,points);root.addView(activeMap,LinearLayout.LayoutParams(-1,dp(330)));label(root,"Las líneas unen lecturas GPS; los tramos sin señal o pausados quedan abiertos.",12f,muted)}else label(root,"Sin recorrido disponible. Actualizá para consultar el GPS guardado.",14f,muted)
  label(root,"Remitos (${docs.length()})",21f,navy,true)
  for(i in 0 until docs.length()){val r=docs.getJSONObject(i);val rc=card();label(rc,"${if(r.optString("kind")=="arrival")"Llegada" else "Salida"} · ${r.optString("number").ifBlank{"Sin número"}}",18f,navy,true);label(rc,"${r.optString("cargo_type")} · ${r.optString("kg").takeUnless{it=="null"}?:"—"} kg",14f,muted);if(!r.isNull("object_path"))button(rc,"Ver foto",false){showPhoto(r,"trf-trip-documents")}}
  button(root,"Agregar otro remito",false){openDocument(t,"tripdetail","arrival")}
  button(root,"Actualizar desde el panel",false){detail(t,true)}
  if(refresh)thread{try{mobile.detail(t,true);mobile.route(t,true);runOnUiThread{if(screen=="tripdetail"&&historyTrip?.optString("id")==t.optString("id"))detail(t)}}catch(_:Exception){runOnUiThread{toast("No se pudo actualizar. Se mantienen los datos guardados.")}}}
 }
 private fun showPhoto(r:JSONObject,bucket:String){
  toast("Abriendo foto…");thread{try{val local=r.optString("local_path").takeIf{it.isNotBlank()}?.let{File(it)};val bytes=if(local?.exists()==true)local.readBytes() else mobile.photo(r.getString("object_path"),bucket);val bitmap=BitmapFactory.decodeByteArray(bytes,0,bytes.size)?:error("Imagen no disponible");runOnUiThread{val image=ImageView(this).apply{setImageBitmap(bitmap);adjustViewBounds=true;contentDescription="Comprobante adjunto"};AlertDialog.Builder(this).setView(image).setPositiveButton("Cerrar",null).show()}}catch(_:Exception){runOnUiThread{toast("No se pudo abrir la foto. Revisá la conexión.")}}}
 }
 private fun date(s:String)=try{java.time.Instant.parse(s).atZone(java.time.ZoneId.systemDefault()).format(java.time.format.DateTimeFormatter.ofPattern("dd/MM/yyyy HH:mm"))}catch(_:Exception){s}
 private fun preparePhoto(uri:Uri){val job=++photoJob;val target=photoMode;photoBusy=true;toast("Preparando foto…");thread{try{
  val original=File(cacheDir,"receipt-original-${UUID.randomUUID()}");contentResolver.openInputStream(uri)?.use{input->original.outputStream().use{out->val buf=ByteArray(8192);var total=0L;while(true){val n=input.read(buf);if(n<0)break;total+=n;check(total<=40*1024*1024);out.write(buf,0,n)}}}?:error("Sin imagen")
  val bounds=BitmapFactory.Options().apply{inJustDecodeBounds=true};BitmapFactory.decodeFile(original.path,bounds);var sample=1;while(max(bounds.outWidth,bounds.outHeight)/sample>2400)sample*=2;val bitmap=BitmapFactory.decodeFile(original.path,BitmapFactory.Options().apply{inSampleSize=sample})?:error("Formato no compatible");val exif=ExifInterface(original);val matrix=Matrix();matrix.postRotate(exif.rotationDegrees.toFloat());if(exif.isFlipped)matrix.postScale(-1f,1f);val rotated=Bitmap.createBitmap(bitmap,0,0,bitmap.width,bitmap.height,matrix,true);val out=File(File(filesDir,"draft-photos").apply{mkdirs()},"receipt-${UUID.randomUUID()}.jpg");out.outputStream().use{rotated.compress(Bitmap.CompressFormat.JPEG,88,it)};if(rotated!==bitmap)rotated.recycle();bitmap.recycle();original.delete();check(out.length()<=10*1024*1024);runOnUiThread{if(job==photoJob){photoBusy=false;photo=out;if(screen==target){if(target=="document")document() else fuel()}}else out.delete()}
 }catch(_:Exception){runOnUiThread{if(job==photoJob)photoBusy=false;toast("No se pudo preparar la foto. Probá con otra imagen.")}}}}
 private fun toast(s:String)=Toast.makeText(this,s,Toast.LENGTH_LONG).show()
}
