package uy.transportesferreira.gps
import android.content.Context
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.annotation.SuppressLint
import android.view.MotionEvent
import org.json.JSONArray
object TripMap {
 private const val TILES_JS="""const osm='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const styles={streets:['https://tile.openstreetmap.org/{z}/{x}/{y}.png',19,osm],terrain:['https://a.tile.opentopomap.org/{z}/{x}/{y}.png',17,osm+' · SRTM · OpenTopoMap (CC-BY-SA)'],satellite:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',19,'Tiles © Esri · Vantor · Earthstar Geographics · GIS User Community']};let base;let references=[];
  function changeStyle(){if(base)map.removeLayer(base);references.forEach(layer=>map.removeLayer(layer));references=[];const v=styles[document.getElementById('style').value];document.getElementById('notice').textContent='';base=L.tileLayer(v[0],{maxNativeZoom:v[1],maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',attribution:v[2]}).on('tileerror',()=>{document.getElementById('notice').textContent='Vista no disponible. Probá Rutas y ciudades.'}).addTo(map);base.bringToBack();if(document.getElementById('style').value==='satellite')references=['World_Transportation','World_Boundaries_and_Places'].map((name,index)=>L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/'+name+'/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,zIndex:2+index,referrerPolicy:'strict-origin-when-cross-origin',attribution:'References © Esri, HERE, Garmin, OpenStreetMap contributors'}).on('tileerror',()=>{document.getElementById('notice').textContent='No se pudieron cargar algunas rutas o nombres. Probá Rutas y ciudades.'}).addTo(map))}document.getElementById('style').onchange=changeStyle;changeStyle();"""

 /** Map of the trip in progress: draws the recorded route, follows the truck and, when a destination exists, the road route to it. */
 class Live(val web:WebView){
  private var ready=false;private val queue=mutableListOf<String>()
  fun onReady(){ready=true;queue.forEach{web.evaluateJavascript(it,null)};queue.clear()}
  private fun run(js:String){if(ready)web.evaluateJavascript(js,null) else queue.add(js)}
  fun push(points:List<DoubleArray>){points.chunked(1500).forEach{run("addPoints("+JSONArray(it.map{p->JSONArray(p.toList())}).toString()+")")}}
 }
 @SuppressLint("SetJavaScriptEnabled","ClickableViewAccessibility") fun live(c:Context,destLat:Double,destLng:Double):Live{
  val js=c.assets.open("map/leaflet.js").bufferedReader().use{it.readText()};val css=c.assets.open("map/leaflet.css").bufferedReader().use{it.readText()}
  val dest=if(destLat.isFinite()&&destLng.isFinite()&&destLat in -90.0..90.0&&destLng in -180.0..180.0)"[$destLat,$destLng]" else "null"
  val html="""<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><style>$css html,body{height:100%;margin:0}body{display:flex;flex-direction:column;font-family:sans-serif}#map{flex:1;min-height:0}header{padding:6px 8px;background:white;color:#172b45;display:flex;gap:6px;align-items:center}select{font-size:14px;padding:6px;border:1px solid #bbb;border-radius:6px;flex:1;min-width:0}#notice{font-size:12px;color:#9a3010;padding:0 8px}#eta{font-size:13px;font-weight:bold;color:#172b45;padding:4px 8px;background:#eef4ff}.ctl{position:absolute;right:8px;bottom:28px;z-index:1000;display:flex;flex-direction:column;gap:6px}.ctl button{font-size:14px;padding:10px 12px;border:0;border-radius:10px;background:#1c64f2;color:white;box-shadow:0 1px 4px rgba(0,0,0,.4)}</style></head><body><header><select id="style" aria-label="Vista del mapa"><option value="streets">Rutas y ciudades</option><option value="terrain">Relieve</option><option value="satellite">Satélite + rutas</option></select></header><div id="eta" style="display:none"></div><div id="notice" role="status"></div><div id="map"></div><div class="ctl"><button id="center" style="display:none">Centrar</button><button id="whole">Ver todo</button></div><script>$js</script><script>
  const DEST=$dest;const map=L.map('map').setView([-32.2,-56],6);
  $TILES_JS
  let seg=null,lastT=0,line=null,last=null,follow=true,first=true,marker=null,routeLine=null,routeAt=0,bounds=[];
  function setFollow(v){follow=v;document.getElementById('center').style.display=v?'none':'block'}
  map.on('dragstart',()=>setFollow(false));
  document.getElementById('center').onclick=()=>{setFollow(true);if(last)map.setView(last,Math.max(map.getZoom(),15))};
  document.getElementById('whole').onclick=()=>{const b=bounds.slice();if(last)b.push(last);if(DEST)b.push(DEST);if(b.length){setFollow(false);map.fitBounds(b,{padding:[30,30],maxZoom:16})}};
  if(DEST)L.circleMarker(DEST,{radius:9,color:'#b62f34',weight:3,fillColor:'#fff',fillOpacity:1}).addTo(map).bindTooltip('Destino',{permanent:true,direction:'top'});
  function routeTo(){if(!DEST||!last||Date.now()-routeAt<120000)return;routeAt=Date.now();
   fetch('https://router.project-osrm.org/route/v1/driving/'+last[1]+','+last[0]+';'+DEST[1]+','+DEST[0]+'?overview=full&geometries=geojson').then(r=>r.json()).then(d=>{const r=d.routes&&d.routes[0];if(!r)return;
    if(routeLine)map.removeLayer(routeLine);routeLine=L.polyline(r.geometry.coordinates.map(c=>[c[1],c[0]]),{color:'#e8590c',weight:5,opacity:.75,dashArray:'10 8'}).addTo(map);if(marker)marker.bringToFront();
    const km=r.distance/1000,min=Math.round(r.duration/60);const e=document.getElementById('eta');e.style.display='block';e.textContent='Al destino: '+km.toFixed(1).replace('.',',')+' km · aprox. '+(min>=60?Math.floor(min/60)+' h '+(min%60)+' min':min+' min')}).catch(()=>{routeAt=Date.now()-90000})}
  function addPoints(a){a.forEach(p=>{if(!line||p[2]!==seg||p[3]-lastT>90000){seg=p[2];line=L.polyline([],{color:'#1c64f2',weight:5}).addTo(map)}lastT=p[3];line.addLatLng([p[0],p[1]]);last=[p[0],p[1]];bounds.push(last)});
   if(!last)return;if(!marker)marker=L.circleMarker(last,{radius:8,color:'#fff',weight:3,fillColor:'#1c64f2',fillOpacity:1}).addTo(map);else marker.setLatLng(last);
   if(follow){map.setView(last,first?16:Math.max(map.getZoom(),15),{animate:false});first=false}routeTo()}
  </script></body></html>"""
  val web=WebView(c).apply{settings.javaScriptEnabled=true;settings.allowFileAccess=false;settings.allowContentAccess=false;settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
   setOnTouchListener{v,e->if(e.action==MotionEvent.ACTION_DOWN||e.action==MotionEvent.ACTION_MOVE)v.parent?.requestDisallowInterceptTouchEvent(true);false}}
  val map=Live(web)
  web.webViewClient=object:WebViewClient(){override fun shouldOverrideUrlLoading(view:WebView?,request:WebResourceRequest?)=true;override fun onPageFinished(view:WebView?,url:String?){map.onReady()}}
  web.loadDataWithBaseURL("https://transportes-ferreira-gestion.carlosdiegofc2001.chatgpt.site/",html,"text/html","UTF-8",null)
  return map
 }
 @Suppress("SetJavaScriptEnabled") fun view(c:Context,points:JSONArray):WebView{
  val safe=JSONArray();for(i in 0 until points.length()){val p=points.getJSONObject(i);val lat=p.optDouble("latitude");val lng=p.optDouble("longitude");if(lat.isFinite()&&lng.isFinite()&&lat in -90.0..90.0&&lng in -180.0..180.0)safe.put(JSONArray().put(lat).put(lng).put(p.optInt("segment")).put(p.optString("recorded_at")))}
  val js=c.assets.open("map/leaflet.js").bufferedReader().use{it.readText()};val css=c.assets.open("map/leaflet.css").bufferedReader().use{it.readText()}
  val html="""<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><style>$css html,body{height:100%;margin:0}body{display:flex;flex-direction:column;font-family:sans-serif}#map{flex:1;min-height:0}header{padding:8px;background:white;color:#172b45}select{font-size:16px;padding:8px;border:1px solid #bbb;border-radius:6px;max-width:100%}#notice{font-size:12px;color:#9a3010}</style></head><body><header><select id="style" aria-label="Vista del mapa"><option value="streets">Rutas y ciudades</option><option value="terrain">Relieve</option><option value="satellite">Satélite + rutas</option></select><div id="notice" role="status"></div></header><div id="map"></div><script>$js</script><script>
  const points=${safe.toString().replace("<","\\u003c")};const map=L.map('map').setView([-32.2,-56],6);
  $TILES_JS
  let segment=[];function draw(){if(segment.length>1)L.polyline(segment,{color:'#1c64f2',weight:4}).addTo(map)}
  points.forEach((p,i)=>{if(i&&(p[2]!==points[i-1][2]||Date.parse(p[3])-Date.parse(points[i-1][3])>90000)){draw();segment=[]}segment.push([p[0],p[1]])});draw();
  if(points.length){const first=points[0],last=points[points.length-1];L.circleMarker([first[0],first[1]],{color:'#0c775a'}).addTo(map).bindPopup('Inicio GPS');L.circleMarker([last[0],last[1]],{color:'#b62f34'}).addTo(map).bindPopup('Última ubicación');map.fitBounds(points.map(p=>[p[0],p[1]]),{padding:[25,25],maxZoom:15})}
  </script></body></html>"""
  return WebView(c).apply{settings.javaScriptEnabled=true;settings.allowFileAccess=false;settings.allowContentAccess=false;settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW;webViewClient=object:WebViewClient(){override fun shouldOverrideUrlLoading(view:WebView?,request:WebResourceRequest?)=true};loadDataWithBaseURL("https://transportes-ferreira-gestion.carlosdiegofc2001.chatgpt.site/",html,"text/html","UTF-8",null)}
 }
 /** Owner view: one marker per truck, colored by state. Labels are inserted as text, never as HTML. */
 @SuppressLint("SetJavaScriptEnabled","ClickableViewAccessibility") fun fleet(c:Context,marks:JSONArray):WebView{
  val js=c.assets.open("map/leaflet.js").bufferedReader().use{it.readText()};val css=c.assets.open("map/leaflet.css").bufferedReader().use{it.readText()}
  val html="""<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><style>$css html,body{height:100%;margin:0}body{display:flex;flex-direction:column;font-family:sans-serif}#map{flex:1;min-height:0}header{padding:6px 8px;background:white;color:#172b45}select{font-size:14px;padding:6px;border:1px solid #bbb;border-radius:6px;max-width:100%}#notice{font-size:12px;color:#9a3010}.tag{font:600 11px sans-serif;color:#111c2e;background:#fff;border:1px solid #cbd3df;border-radius:6px;padding:2px 6px;box-shadow:none}.tag:before{display:none}</style></head><body><header><select id="style" aria-label="Vista del mapa"><option value="streets">Rutas y ciudades</option><option value="terrain">Relieve</option><option value="satellite">Satélite + rutas</option></select><div id="notice" role="status"></div></header><div id="map"></div><script>$js</script><script>
  const marks=${marks.toString().replace("<","\\u003c")};const map=L.map('map').setView([-30.9,-57.3],8);
  $TILES_JS
  const pts=[];marks.forEach(m=>{const p=[m.lat,m.lng];pts.push(p);const tag=document.createElement('span');tag.textContent=m.label;
   L.circleMarker(p,{radius:9,color:'#fff',weight:3,fillColor:m.color,fillOpacity:1}).addTo(map).bindTooltip(tag,{permanent:true,direction:'right',offset:[10,0],className:'tag'})});
  if(pts.length>1)map.fitBounds(pts,{padding:[40,40],maxZoom:12});else if(pts.length===1)map.setView(pts[0],11);
  </script></body></html>"""
  return WebView(c).apply{settings.javaScriptEnabled=true;settings.allowFileAccess=false;settings.allowContentAccess=false;settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW
   setOnTouchListener{v,e->if(e.action==MotionEvent.ACTION_DOWN||e.action==MotionEvent.ACTION_MOVE)v.parent?.requestDisallowInterceptTouchEvent(true);false}
   webViewClient=object:WebViewClient(){override fun shouldOverrideUrlLoading(view:WebView?,request:WebResourceRequest?)=true};loadDataWithBaseURL("https://transportes-ferreira-gestion.carlosdiegofc2001.chatgpt.site/",html,"text/html","UTF-8",null)}
 }
}
