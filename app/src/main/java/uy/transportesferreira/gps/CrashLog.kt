package uy.transportesferreira.gps
import android.content.Context
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import java.time.Instant

/**
 * The last error that closed the app, kept on the phone (decision of 29/10/2026, after a trip that closed the app when it
 * was finished): Mi cuenta shows it, to copy and send. Nothing goes out by itself. Then Android closes the app as always.
 */
object CrashLog{
 private const val FILE="ultimo-error.txt"
 @Volatile private var installed=false
 fun install(c:Context){
  if(installed)return;installed=true
  val app=c.applicationContext;val previous=Thread.getDefaultUncaughtExceptionHandler()
  Thread.setDefaultUncaughtExceptionHandler{thread,e->
   try{
    val trace=StringWriter().also{e.printStackTrace(PrintWriter(it))}.toString()
    val version=try{app.packageManager.getPackageInfo(app.packageName,0).versionName}catch(_:Exception){"?"}
    File(app.filesDir,FILE).writeText("Versión $version · ${Instant.now()} · hilo ${thread.name}\n\n${trace.take(20_000)}")
   }catch(_:Throwable){}
   previous?.uncaughtException(thread,e)
  }
 }
 fun last(c:Context):String?=File(c.filesDir,FILE).takeIf{it.exists()}?.readText()
 fun clear(c:Context){File(c.filesDir,FILE).delete()}
}
