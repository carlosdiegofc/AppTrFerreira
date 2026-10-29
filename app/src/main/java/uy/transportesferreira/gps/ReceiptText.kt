package uy.transportesferreira.gps
import java.time.LocalDate

/**
 * What the app reads from the photo of a fuel receipt (decision of 29/10/2026): litres, total, price per litre, the day
 * and the station. The text comes from the phone's own reader first (ReceiptReader) and these rules turn it into
 * numbers; the driver always confirms the fields before saving.
 */
object ReceiptText{
 class Reading(val liters:Double?,val total:Double?,val price:Double?,val date:LocalDate?){
  /** Litres and total, the two numbers the receipt is for, were both found. */
  val complete get()=liters!=null&&total!=null
 }
 /** A receipt whose litres times price differ from the total by more than this is not trusted (decision of 29/10/2026). */
 const val TOLERANCE=0.05

 /** Whether litres times price give the total, within the tolerance; null when the three are not all there to check. */
 fun consistent(liters:Double?,price:Double?,total:Double?):Boolean?{
  if(liters==null||price==null||total==null||total<=0.0)return null
  return Math.abs(liters*price-total)/total<=TOLERANCE
 }
 /** True when the reading has what is needed and the numbers agree with each other (or cannot be compared). */
 fun clear(r:Reading)=r.complete&&consistent(r.liters,r.price,r.total)!=false

 private val LITERS=Regex("(LITROS|LTS|LTR|LT\\.|VOLUMEN|CANTIDAD|CANT\\.)")
 private val TOTAL=Regex("(TOTAL|IMPORTE|A PAGAR|MONTO)")
 private val PRICE=Regex("(PRECIO|P\\.?\\s?UNIT|P/LT|\\$/L|\\$ ?/ ?LT)")
 private val NUMBER=Regex("\\d{1,3}(?:[.,]\\d{3})+(?:[.,]\\d{1,3})?|\\d+(?:[.,]\\d{1,3})?")
 private val DAY=Regex("(\\d{1,2})[/\\-.](\\d{1,2})[/\\-.](\\d{4}|\\d{2})")

 /**
  * One number as the receipt writes it: «2.853,80», «2853.80», «45,230». A comma or a dot followed by one to three digits
  * at the end is the decimal mark, unless thousands is true and it is the only mark with exactly three digits after it.
  */
 fun number(raw:String,thousands:Boolean):Double?{
  val s=raw.trim();if(s.isEmpty())return null
  val comma=s.lastIndexOf(',');val dot=s.lastIndexOf('.')
  val last=maxOf(comma,dot)
  if(last<0)return s.toDoubleOrNull()
  val after=s.length-last-1
  val marks=s.count{it==','||it=='.'}
  val decimal=when{
   comma>=0&&dot>=0->true
   marks>1->false
   after==3->!thousands
   else->true
  }
  return if(decimal){
   val whole=s.substring(0,last).replace(".","").replace(",","")
   "$whole.${s.substring(last+1)}".toDoubleOrNull()
  }else s.replace(".","").replace(",","").toDoubleOrNull()
 }

 private fun numbersOf(line:String,thousands:Boolean)=NUMBER.findAll(line).mapNotNull{number(it.value,thousands)}.toList()
 /** The numbers next to a word of the receipt: on its line, or on the next one when the line has none. */
 private fun near(lines:List<String>,key:Regex,thousands:Boolean,skip:Regex?=null):List<Double>{
  val found=mutableListOf<Double>()
  for((i,l) in lines.withIndex()){
   if(!key.containsMatchIn(l)||(skip!=null&&skip.containsMatchIn(l)))continue
   val here=numbersOf(l.substring(key.find(l)!!.range.last+1),thousands)
   found+=if(here.isNotEmpty())here else lines.getOrNull(i+1)?.let{numbersOf(it,thousands)}.orEmpty()
  }
  return found
 }
 fun parse(text:String,today:LocalDate=LocalDate.now()):Reading{
  val lines=text.uppercase().lines().map{it.trim()}.filter{it.isNotEmpty()}
  val liters=near(lines,LITERS,false).firstOrNull{it in 1.0..2000.0}
  // The total is the largest figure next to TOTAL or IMPORTE: IVA and the like are on lines of their own and are smaller.
  val total=near(lines,TOTAL,true,Regex("SUB ?TOTAL|IVA")).filter{it>0.0}.maxOrNull()
  val price=near(lines,PRICE,false).firstOrNull{it in 5.0..500.0}
  return Reading(liters,total,price,date(text,today))
 }
 /** The first date in the text that is a real day, in the last five years, and not after today. */
 fun date(text:String,today:LocalDate):LocalDate?{
  for(m in DAY.findAll(text)){
   val d=m.groupValues[1].toInt();val mo=m.groupValues[2].toInt();var y=m.groupValues[3].toInt();if(y<100)y+=2000
   val day=try{LocalDate.of(y,mo,d)}catch(_:Exception){continue}
   if(!day.isAfter(today)&&day.isAfter(today.minusYears(5)))return day
  }
  return null
 }
 /** The catalog station the receipt names: the one with a word of at least four letters found in the text, if only one. */
 fun station(text:String,names:List<String>):String?{
  val up=text.uppercase()
  val generic=setOf("ESTACION","ESTACIÓN","SERVICIO","SERVICIOS","RUTA","KM","SERVICENTRO","COMBUSTIBLES")
  val hits=names.filter{n->n.uppercase().split(Regex("[^A-ZÁÉÍÓÚÑ0-9]+")).any{w->w.length>=4&&w !in generic&&!w.all{it.isDigit()}&&up.contains(w)}}
  return hits.singleOrNull()
 }
}
