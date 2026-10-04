package uy.transportesferreira.gps
/** Optional metadata never prevents the trip from starting. Invalid optional numbers remain pending. */
object InputRules {
 fun optionalNumber(value:String):Double?=value.trim().replace(',','.').toDoubleOrNull()?.takeIf{it.isFinite()&&it>=0}
 fun vehicle(value:String)=value.trim().ifBlank{"Sin camión asignado"}
}
