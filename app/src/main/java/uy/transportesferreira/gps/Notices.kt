package uy.transportesferreira.gps
import java.time.LocalDate
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit

/**
 * The notices of the phone (decision of 28/10/2026), worked out with what the phone already has: papers and services that
 * expired or are close, with the thresholds of the panel (papers.ts), and a trip that looks left open. Pure functions.
 */
object Notices{
 const val PAPER_SOON_DAYS=30L
 const val SERVICE_SOON_DAYS=15L
 /** A trip this long in progress, paused or not, asks whether it was left open. */
 const val TRIP_LONG_MS=14*3600_000L
 /** So does a truck stopped this long without the trip paused. */
 const val TRIP_STOPPED_MS=2*3600_000L
 /** Below this speed the truck counts as stopped. */
 const val MOVING_KMH=5.0

 class Paper(val id:String,val scope:String,val driverId:String,val driverName:String,val vehicle:String,val kind:String,val expiresOn:LocalDate?)
 class Service(val id:String,val vehicle:String,val kind:String,val dueOn:LocalDate?,val doneOn:LocalDate?)
 /** Something to keep in mind: state is «late» or «soon»; mark changes when it has to be told again. */
 class Item(val key:String,val state:String,val paper:Boolean,val kind:String,val owner:String,val detail:String,val date:LocalDate){
  val mark get()="$state|$date"
  /** One line of the notice: «SOA / Seguro · ATP 2231 · Venció el 25/10/2026». */
  val line get()=listOf(kind,owner,detail).filter{it.isNotBlank()}.joinToString(" · ")
 }

 private val dayFormat=DateTimeFormatter.ofPattern("dd/MM/yyyy")
 private fun fmt(d:LocalDate)=d.format(dayFormat)
 fun inDays(d:LocalDate,today:LocalDate):String{val n=ChronoUnit.DAYS.between(today,d);return when{n==0L->"hoy";n==1L->"mañana";n>1L->"en $n días";n==-1L->"ayer";else->"hace ${-n} días"}}
 fun paperState(expires:LocalDate?,today:LocalDate):String?=when{expires==null->null;expires.isBefore(today)->"late";!expires.isAfter(today.plusDays(PAPER_SOON_DAYS))->"soon";else->null}
 fun serviceState(due:LocalDate?,done:LocalDate?,today:LocalDate):String?=when{done!=null||due==null->null;due.isBefore(today)->"late";!due.isAfter(today.plusDays(SERVICE_SOON_DAYS))->"soon";else->null}

 /** The same truck: by the plates when both have one, else by the whole name. */
 fun sameTruck(a:String,b:String):Boolean{val pa=plate(a);val pb=plate(b);return if(pa.isNotBlank()&&pb.isNotBlank())pa.equals(pb,true) else a.trim().equals(b.trim(),true)}
 private fun plate(v:String)=v.indexOf(" · ").let{if(it<0)"" else v.substring(it+3).trim()}
 private fun plateOrModel(v:String)=plate(v).ifBlank{v.trim()}

 /**
  * What concerns this account, as its start screen shows it: a driver's own papers and the papers and services of the
  * truck it drives; an owner, the whole fleet's.
  */
 fun due(papers:List<Paper>,services:List<Service>,today:LocalDate,uid:String,truck:String,owner:Boolean):List<Item>{
  fun mine(v:String)=owner||(truck.isNotBlank()&&sameTruck(v,truck))
  val out=mutableListOf<Item>()
  for(p in papers){
   if(!(if(p.scope=="vehicle")mine(p.vehicle) else p.scope=="driver"&&(owner||p.driverId==uid)))continue
   val state=paperState(p.expiresOn,today)?:continue;val exp=p.expiresOn!!
   val whose=if(p.scope=="vehicle")plateOrModel(p.vehicle) else if(p.driverId==uid)"" else p.driverName.trim().substringBefore(" ")
   out.add(Item("paper:${p.id}",state,true,p.kind,whose,if(state=="late")"Venció el ${fmt(exp)}" else "Vence el ${fmt(exp)} · ${inDays(exp,today)}",exp))
  }
  for(s in services){
   if(!mine(s.vehicle))continue
   val state=serviceState(s.dueOn,s.doneOn,today)?:continue;val due=s.dueOn!!
   out.add(Item("service:${s.id}",state,false,s.kind,plateOrModel(s.vehicle),if(state=="late")"Era para el ${fmt(due)}" else "${fmt(due)} · ${inDays(due,today)}",due))
  }
  return out.sortedWith(compareBy<Item>({it.date},{it.kind}))
 }
 /** The ones to tell now: new, or changed since they were told (seen holds each key's mark then). */
 fun fresh(items:List<Item>,seen:Map<String,String>)=items.filter{seen[it.key]!=it.mark}

 enum class Open{LONG,STOPPED}
 /** Why a trip looks left open, if it does: in progress for 14 hours, or stopped for 2 without a pause. */
 fun open(startedAt:Long,movedAt:Long,now:Long,paused:Boolean):Open?=when{
  now-startedAt>=TRIP_LONG_MS->Open.LONG
  !paused&&now-maxOf(movedAt,startedAt)>=TRIP_STOPPED_MS->Open.STOPPED
  else->null
 }
}
