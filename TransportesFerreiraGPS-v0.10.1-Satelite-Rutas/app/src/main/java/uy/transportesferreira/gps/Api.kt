package uy.transportesferreira.gps

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

class Api(private val context: Context) {
    private val prefs = context.getSharedPreferences("session-v7", Context.MODE_PRIVATE)
    private fun key(): SecretKey {
        val store = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (store.getKey("trf-session", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").apply {
            init(KeyGenParameterSpec.Builder("trf-session", KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build())
        }.generateKey()
    }
    fun session(): JSONObject? = synchronized(lock) {
        try {
            val parts = prefs.getString("encrypted", null)?.split(":") ?: return@synchronized null
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, Base64.decode(parts[0], Base64.NO_WRAP)))
            JSONObject(String(cipher.doFinal(Base64.decode(parts[1], Base64.NO_WRAP)), Charsets.UTF_8))
        } catch (_: Exception) { null }
    }
    private fun save(value: JSONObject) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding").apply { init(Cipher.ENCRYPT_MODE, key()) }
        val encrypted = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" + Base64.encodeToString(cipher.doFinal(value.toString().toByteArray()), Base64.NO_WRAP)
        check(prefs.edit().putString("encrypted", encrypted).commit()) { "No se pudo guardar la sesión" }
    }
    fun login(email: String, password: String) = synchronized(lock) {
        val result = request("/auth/v1/token?grant_type=password", "POST", JSONObject().put("email",email).put("password",password).toString().toByteArray(), auth=false)
        val s = JSONObject(result)
        val store=TripStore(context)
        val previous=store.current()
        if(previous!=null && (previous.optBoolean("active") || store.pendingCount()>0)) {
            check(previous.getString("driver_id")==s.getJSONObject("user").getString("id")) { "Usá la cuenta del viaje pendiente" }
        }
        val nextUid=s.getJSONObject("user").getString("id")
        check((store.receipts()+store.documents()+store.details()).none{!it.second.optBoolean("synced")&&it.second.optString("driver_id")!=nextUid}) { "Sincronizá los registros de la otra cuenta primero" }
        save(s)
        context.getSharedPreferences("gps", Context.MODE_PRIVATE).edit().remove("password").putString("email",email).apply()
    }
    fun clear() { synchronized(lock) { prefs.edit().clear().commit() } }
    private fun token(force: Boolean = false): String = synchronized(lock) {
        var s = session() ?: error("Iniciá sesión para sincronizar")
        val expiry = s.optLong("expires_at", 0)
        if (force || expiry <= System.currentTimeMillis()/1000 + 90) {
            s = JSONObject(request("/auth/v1/token?grant_type=refresh_token", "POST", JSONObject().put("refresh_token",s.getString("refresh_token")).toString().toByteArray(),auth=false))
            save(s)
        }
        s.getString("access_token")
    }
    fun request(path: String, method: String = "GET", body: ByteArray? = null, prefer: String? = null, contentType: String = "application/json", auth: Boolean = true, retry: Boolean = true): String {
        val jwt = if(auth) token() else null
        val c = URL(Config.SUPABASE_URL + path).openConnection() as HttpURLConnection
        try {
            c.requestMethod=method;c.connectTimeout=12000;c.readTimeout=20000
            c.setRequestProperty("apikey",Config.SUPABASE_KEY)
            if(jwt!=null)c.setRequestProperty("Authorization","Bearer $jwt")
            if(prefer!=null)c.setRequestProperty("Prefer",prefer)
            if(body!=null){c.doOutput=true;c.setRequestProperty("Content-Type",contentType);c.outputStream.use{it.write(body)}}
            val code=c.responseCode
            val text=(if(code in 200..299)c.inputStream else c.errorStream)?.bufferedReader()?.use{it.readText()} ?: ""
            if(code==401 && auth && retry){token(true);return request(path,method,body,prefer,contentType,auth,false)}
            if(code !in 200..299)throw ApiError(code,text)
            return text
        } finally {c.disconnect()}
    }
    fun json(path:String, value:JSONObject, prefer:String?=null,method:String="POST") = request(path,method,value.toString().toByteArray(),prefer)
    companion object { private val lock=Any() }
}
class ApiError(val status:Int, val response:String):Exception("No se pudo sincronizar (HTTP $status)")
