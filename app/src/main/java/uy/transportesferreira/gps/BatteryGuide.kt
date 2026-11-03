package uy.transportesferreira.gps

/**
 * What each brand of phone needs so it does not put the app to sleep during a trip (decision of 30/10/2026): on top of
 * Android's «Sin restricciones», several brands have their own battery saving that stops apps in the background.
 */
object BatteryGuide{
 data class Guide(val brand:String,val steps:String)
 /** The steps for this maker (Build.MANUFACTURER), or null for a phone without a battery saving of its own. */
 fun of(manufacturer:String?):Guide?{
  val m=(manufacturer?:"").trim().lowercase()
  return when{
   m.contains("samsung")->Guide("Samsung","En Ajustes › Batería › Límites de uso en segundo plano: apagá «Poner apps sin uso en suspensión» y, en «Apps que nunca se suspenden», agregá Transportes Ferreira GPS.")
   m.contains("xiaomi")||m.contains("redmi")||m.contains("poco")->Guide("Xiaomi","En Ajustes › Apps › Administrar apps › Transportes Ferreira GPS: activá «Inicio automático» y, en «Ahorro de batería», elegí «Sin restricciones». En las apps recientes, mantené apretada la app y tocá el candado.")
   m.contains("huawei")||m.contains("honor")->Guide(if(m.contains("honor"))"Honor" else "Huawei","En Ajustes › Batería › Inicio de apps: buscá Transportes Ferreira GPS, desactivá «Gestionar automáticamente» y dejá activadas las tres opciones.")
   m.contains("oppo")||m.contains("realme")||m.contains("oneplus")->Guide(when{m.contains("realme")->"Realme";m.contains("oneplus")->"OnePlus";else->"OPPO"},"En Ajustes › Batería › Uso de batería de la app › Transportes Ferreira GPS: activá «Permitir actividad en segundo plano» y «Permitir inicio automático».")
   m.contains("vivo")||m.contains("iqoo")->Guide("vivo","En Ajustes › Batería › Consumo de energía en segundo plano: permití a Transportes Ferreira GPS el consumo alto en segundo plano.")
   m.contains("motorola")||m.contains("lenovo")->Guide("Motorola","Con la batería de la app en «Sin restricciones» alcanza. Si usás el «Ahorro de batería» del teléfono, apagalo durante el viaje.")
   else->null
  }
 }
}
