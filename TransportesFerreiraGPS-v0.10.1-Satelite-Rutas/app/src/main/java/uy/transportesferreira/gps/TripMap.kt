package uy.transportesferreira.gps
import android.content.Context
import android.webkit.WebView
import android.webkit.WebViewClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import org.json.JSONArray
object TripMap {
 @Suppress("SetJavaScriptEnabled") fun view(c:Context,points:JSONArray):WebView{
  val safe=JSONArray();for(i in 0 until points.length()){val p=points.getJSONObject(i);val lat=p.optDouble("latitude");val lng=p.optDouble("longitude");if(lat.isFinite()&&lng.isFinite()&&lat in -90.0..90.0&&lng in -180.0..180.0)safe.put(JSONArray().put(lat).put(lng).put(p.optInt("segment")).put(p.optString("recorded_at")))}
  val js=c.assets.open("map/leaflet.js").bufferedReader().use{it.readText()};val css=c.assets.open("map/leaflet.css").bufferedReader().use{it.readText()}
  val html="""<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="referrer" content="strict-origin-when-cross-origin"><style>$css html,body{height:100%;margin:0}body{display:flex;flex-direction:column;font-family:sans-serif}#map{flex:1;min-height:0}header{padding:8px;background:white;color:#172b45}select{font-size:16px;padding:8px;border:1px solid #bbb;border-radius:6px;max-width:100%}#notice{font-size:12px;color:#9a3010}</style></head><body><header><select id="style" aria-label="Vista del mapa"><option value="streets">Rutas y ciudades</option><option value="terrain">Relieve</option><option value="satellite">Satélite + rutas</option></select><div id="notice" role="status"></div></header><div id="map"></div><script>$js</script><script>
  const points=${safe.toString().replace("<","\\u003c")};const map=L.map('map').setView([-32.2,-56],6);
  const osm='© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
  const styles={streets:['https://tile.openstreetmap.org/{z}/{x}/{y}.png',19,osm],terrain:['https://a.tile.opentopomap.org/{z}/{x}/{y}.png',17,osm+' · SRTM · OpenTopoMap (CC-BY-SA)'],satellite:['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',19,'Tiles © Esri · Vantor · Earthstar Geographics · GIS User Community']};let base;let references=[];
  function changeStyle(){if(base)map.removeLayer(base);references.forEach(layer=>map.removeLayer(layer));references=[];const v=styles[document.getElementById('style').value];document.getElementById('notice').textContent='';base=L.tileLayer(v[0],{maxNativeZoom:v[1],maxZoom:19,referrerPolicy:'strict-origin-when-cross-origin',attribution:v[2]}).on('tileerror',()=>{document.getElementById('notice').textContent='Vista no disponible. Probá Rutas y ciudades.'}).addTo(map);base.bringToBack();if(document.getElementById('style').value==='satellite')references=['World_Transportation','World_Boundaries_and_Places'].map((name,index)=>L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/Reference/'+name+'/MapServer/tile/{z}/{y}/{x}',{maxZoom:19,zIndex:2+index,referrerPolicy:'strict-origin-when-cross-origin',attribution:'References © Esri, HERE, Garmin, OpenStreetMap contributors'}).on('tileerror',()=>{document.getElementById('notice').textContent='No se pudieron cargar algunas rutas o nombres. Probá Rutas y ciudades.'}).addTo(map))}document.getElementById('style').onchange=changeStyle;changeStyle();
  let segment=[];function draw(){if(segment.length>1)L.polyline(segment,{color:'#1c64f2',weight:4}).addTo(map)}
  points.forEach((p,i)=>{if(i&&(p[2]!==points[i-1][2]||Date.parse(p[3])-Date.parse(points[i-1][3])>90000)){draw();segment=[]}segment.push([p[0],p[1]])});draw();
  if(points.length){const first=points[0],last=points[points.length-1];L.circleMarker([first[0],first[1]],{color:'#0c775a'}).addTo(map).bindPopup('Inicio GPS');L.circleMarker([last[0],last[1]],{color:'#b62f34'}).addTo(map).bindPopup('Última ubicación');map.fitBounds(points.map(p=>[p[0],p[1]]),{padding:[25,25],maxZoom:15})}
  </script></body></html>"""
  return WebView(c).apply{settings.javaScriptEnabled=true;settings.allowFileAccess=false;settings.allowContentAccess=false;settings.mixedContentMode=WebSettings.MIXED_CONTENT_NEVER_ALLOW;webViewClient=object:WebViewClient(){override fun shouldOverrideUrlLoading(view:WebView?,request:WebResourceRequest?)=true};loadDataWithBaseURL("https://transportes-ferreira-gestion.carlosdiegofc2001.chatgpt.site/",html,"text/html","UTF-8",null)}
 }
}
