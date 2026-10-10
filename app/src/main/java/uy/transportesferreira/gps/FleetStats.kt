package uy.transportesferreira.gps
/**
 * Month totals per truck or per driver for the owner, with the rules of the web panel summary (web/js/trips.js):
 * what the office typed in the panel wins, deleted trips are left out and money is never added across currencies.
 * Pure Kotlin: no Android and no JSON, so the sums can be unit tested.
 */
object FleetStats {
    /** Litres per 100 km only mean something with enough kilometres in the month. */
    const val MIN_KM_FOR_RATIO=300.0
    const val NO_TRUCK="Sin camión asignado"
    const val NO_DRIVER="Sin chofer"
    private val noTruck=Regex("^sin cami[oó]n",RegexOption.IGNORE_CASE)
    private val blanks=Regex("\\s+")
    private val allowed=Regex("^[0-9.,]+$")
    private val dotGroups=Regex("^\\d{1,3}(\\.\\d{3})*$")
    private val commaGroups=Regex("^\\d{1,3}(,\\d{3})*$")
    private val commaThousands=Regex("^\\d{1,3}(,\\d{3})+$")
    private val dotThousands=Regex("^\\d{1,3}(\\.\\d{3})+$")
    private val oneDotGroup=Regex("^\\d{1,3}\\.\\d{3}$")

    /** loaded is null for trips typed by hand in the panel: they have no GPS kilometres to split. */
    class Trip(val vehicle:String?,val driver:String?,val gpsKm:Double,val loaded:Boolean?,val billableKm:Double,val kg:Double,val amount:Double,val usd:Boolean,val deleted:Boolean)
    class Fuel(val vehicle:String?,val driver:String?,val liters:Double,val total:Double,val usd:Boolean)
    class Row(val name:String){
        var trips=0;var gpsKm=0.0;var loadedKm=0.0;var emptyKm=0.0;var billableKm=0.0;var kg=0.0
        var billedUyu=0.0;var billedUsd=0.0
        /** Trips with cargo that still have no amount in the panel. */
        var unbilled=0
        var liters=0.0;var fuelUyu=0.0;var fuelUsd=0.0
        /** Litres per 100 km, or null with too few kilometres or no fuel in the month. */
        val litersPer100:Double? get()=if(gpsKm>=MIN_KM_FOR_RATIO&&liters>0)liters/gpsKm*100 else null
        /** Share of the GPS kilometres driven with cargo, from 0 to 1; null without kilometres. */
        val loadedShare:Double? get()=(loadedKm+emptyKm).let{if(it>0)loadedKm/it else null}
        fun add(o:Row){trips+=o.trips;gpsKm+=o.gpsKm;loadedKm+=o.loadedKm;emptyKm+=o.emptyKm;billableKm+=o.billableKm;kg+=o.kg;billedUyu+=o.billedUyu;billedUsd+=o.billedUsd;unbilled+=o.unbilled;liters+=o.liters;fuelUyu+=o.fuelUyu;fuelUsd+=o.fuelUsd}
    }
    class Summary(val rows:List<Row>,val total:Row)

    /** Finite number from a number or from numeric text typed the Uruguayan way ("30.000", "12,5"); anything else is null. */
    fun number(v:Any?):Double?=when(v){
        is Number->v.toDouble().takeIf{it.isFinite()}
        is String->parse(v)
        else->null
    }
    private fun parse(raw:String):Double?{
        val s=raw.trim().replace(blanks,"")
        if(s.isEmpty()||!allowed.matches(s)||s.none{it.isDigit()})return null
        val dots=s.count{it=='.'};val commas=s.count{it==','}
        val plain=when{
            dots>0&&commas>0->{
                val decimalComma=s.lastIndexOf(',')>s.lastIndexOf('.')
                val parts=s.split(if(decimalComma)',' else '.')
                if(parts.size!=2||parts[1].isEmpty()||!(if(decimalComma)dotGroups else commaGroups).matches(parts[0]))return null
                parts[0].replace(".","").replace(",","")+"."+parts[1]
            }
            commas>1->if(commaThousands.matches(s))s.replace(",","") else return null
            commas==1->if(s.startsWith(",")||s.endsWith(","))return null else s.replace(',','.')
            dots>1||oneDotGroup.matches(s)->if(dotThousands.matches(s))s.replace(".","") else return null
            dots==1->if(s.startsWith(".")||s.endsWith("."))return null else s
            else->s
        }
        return plain.toDoubleOrNull()?.takeIf{it.isFinite()}
    }
    /** Trimmed text, or null when there is nothing written. */
    fun text(v:String?):String?=v?.trim()?.takeIf{it.isNotEmpty()}
    /** The app stores "Sin camión asignado" when the driver did not pick a truck: that is not a truck. */
    fun truck(label:String?):String?=text(label)?.takeUnless{noTruck.containsMatchIn(it)}

    /** A truck of the fleet catalog. label is how the app writes it in a trip: "Ford Cargo 1722 · GTP4265". */
    class CatalogTruck(val model:String,val plate:String){
        val label:String get()=listOf(model.trim(),plate.trim()).filter{it.isNotEmpty()}.joinToString(" · ")
    }
    private fun squash(s:String)=s.lowercase().filter{it.isLetterOrDigit()}
    /**
     * The catalog truck a label refers to, so that trips saved with an older label ("Ford Cargo", "Mercedes-Benz 1618")
     * add up with the current one ("Ford Cargo 1722 · GTP4265"). A plate decides on its own; without a plate the model
     * has to point to exactly one truck. Anything else keeps its own label.
     */
    fun canonical(label:String?,fleet:List<CatalogTruck>):String?{
        val text=truck(label)?:return null
        val cut=text.indexOf(" · ");val model=squash(if(cut<0)text else text.substring(0,cut));val plate=squash(if(cut<0)"" else text.substring(cut+3))
        val match=when{
            plate.isNotEmpty()->fleet.filter{squash(it.plate)==plate}
            model.isEmpty()->emptyList()
            else->fleet.filter{squash(it.plate)==model}
                .ifEmpty{fleet.filter{squash(it.model)==model}}
                .ifEmpty{if(model.length<3)emptyList() else fleet.filter{u->squash(u.model).let{it.isNotEmpty()&&(it.startsWith(model)||model.startsWith(it))}}}
        }
        return match.singleOrNull()?.label?.takeIf{it.isNotEmpty()}?:text
    }

    /** Totals per truck, or per driver with byDriver. Rows without a name are grouped at the end. */
    fun summarize(trips:List<Trip>,fuel:List<Fuel>,byDriver:Boolean=false):Summary{
        val none=if(byDriver)NO_DRIVER else NO_TRUCK
        val rows=LinkedHashMap<String,Row>()
        fun row(name:String?)=(name?:none).let{key->rows.getOrPut(key){Row(key)}}
        for(t in trips){
            if(t.deleted)continue
            val r=row(if(byDriver)t.driver else t.vehicle)
            r.trips++;r.gpsKm+=t.gpsKm;r.billableKm+=t.billableKm;r.kg+=t.kg
            when(t.loaded){true->r.loadedKm+=t.gpsKm;false->r.emptyKm+=t.gpsKm;null->{}}
            when{t.amount==0.0->{if(t.loaded!=false)r.unbilled++};t.usd->r.billedUsd+=t.amount;else->r.billedUyu+=t.amount}
        }
        for(f in fuel){
            val r=row(if(byDriver)f.driver else f.vehicle)
            r.liters+=f.liters
            if(f.total!=0.0){if(f.usd)r.fuelUsd+=f.total else r.fuelUyu+=f.total}
        }
        val list=rows.values.sortedWith(compareBy<Row>({it.name==none},{it.name.lowercase()}))
        val total=Row("Total");list.forEach{total.add(it)}
        return Summary(list,total)
    }
}
