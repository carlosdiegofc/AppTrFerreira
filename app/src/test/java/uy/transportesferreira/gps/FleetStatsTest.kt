package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test
/** Same cases as the web panel tests (web/tests/unit), so the phone and the panel add up alike. */
class FleetStatsTest {
    private fun trip(vehicle:String?,gpsKm:Double,loaded:Boolean?=true,billableKm:Double=0.0,kg:Double=0.0,amount:Double=0.0,usd:Boolean=false,deleted:Boolean=false,driver:String?=null)=
        FleetStats.Trip(vehicle,driver,gpsKm,loaded,billableKm,kg,amount,usd,deleted)
    private fun fuel(vehicle:String?,liters:Double,total:Double,usd:Boolean=false,driver:String?=null)=FleetStats.Fuel(vehicle,driver,liters,total,usd)

    @Test fun summaryPerTruckNeverMixesCurrencies(){
        val trips=listOf(trip("A",100.0,billableKm=110.0,kg=1000.0,amount=500.0),trip("A",50.0,amount=100.0,usd=true),trip("B",999.0,amount=1.0,deleted=true))
        val s=FleetStats.summarize(trips,listOf(fuel("A",30.0,300.0),fuel(null,10.0,10.0,usd=true)))
        assertEquals(listOf("A",FleetStats.NO_TRUCK),s.rows.map{it.name})
        val a=s.rows[0]
        assertEquals(500.0,a.billedUyu,.001);assertEquals(100.0,a.billedUsd,.001);assertEquals(150.0,a.gpsKm,.001);assertEquals(110.0,a.billableKm,.001);assertEquals(1000.0,a.kg,.001)
        assertEquals(2,s.total.trips);assertEquals(300.0,s.total.fuelUyu,.001);assertEquals(10.0,s.total.fuelUsd,.001);assertEquals(40.0,s.total.liters,.001)
    }
    @Test fun deletedTripsAreLeftOut(){
        val s=FleetStats.summarize(listOf(trip("B",999.0,amount=1.0,deleted=true)),emptyList())
        assertTrue(s.rows.isEmpty());assertEquals(0,s.total.trips);assertEquals(0.0,s.total.gpsKm,.001)
    }
    @Test fun kilometresAreSplitByCargo(){
        val s=FleetStats.summarize(listOf(trip("A",300.0,loaded=true),trip("A",100.0,loaded=false),trip("A",0.0,loaded=null,billableKm=250.0)),emptyList())
        val a=s.rows.single()
        assertEquals(3,a.trips);assertEquals(400.0,a.gpsKm,.001);assertEquals(300.0,a.loadedKm,.001);assertEquals(100.0,a.emptyKm,.001);assertEquals(.75,a.loadedShare!!,.0001)
        assertNull(FleetStats.Row("x").loadedShare)
    }
    @Test fun consumptionNeedsEnoughKilometres(){
        val few=FleetStats.summarize(listOf(trip("A",299.9)),listOf(fuel("A",90.0,5000.0))).rows.single()
        assertNull(few.litersPer100)
        val enough=FleetStats.summarize(listOf(trip("A",200.0),trip("A",200.0)),listOf(fuel("A",130.0,7000.0))).rows.single()
        assertEquals(32.5,enough.litersPer100!!,.0001)
        assertNull(FleetStats.summarize(listOf(trip("A",900.0)),emptyList()).rows.single().litersPer100)
    }
    @Test fun tripsWithCargoAndNoAmountAreCounted(){
        val a=FleetStats.summarize(listOf(trip("A",10.0,amount=500.0),trip("A",10.0),trip("A",10.0,loaded=false),trip("A",0.0,loaded=null)),emptyList()).rows.single()
        assertEquals(2,a.unbilled);assertEquals(500.0,a.billedUyu,.001)
    }
    @Test fun theSameTripsCanBeAddedPerDriver(){
        val trips=listOf(trip("A",100.0,driver="Hugo Silva"),trip("B",40.0,driver="Hugo Silva"),trip("A",60.0,driver="Immer Sampayo"),trip("A",5.0))
        val s=FleetStats.summarize(trips,listOf(fuel("A",20.0,100.0,driver="Immer Sampayo")),byDriver=true)
        assertEquals(listOf("Hugo Silva","Immer Sampayo",FleetStats.NO_DRIVER),s.rows.map{it.name})
        assertEquals(140.0,s.rows[0].gpsKm,.001);assertEquals(20.0,s.rows[1].liters,.001);assertEquals(205.0,s.total.gpsKm,.001);assertEquals(4,s.total.trips)
    }
    @Test fun rowsAreSortedByNameWithTheUnnamedLast(){
        val s=FleetStats.summarize(listOf(trip(null,1.0),trip("mercedes 1618",1.0),trip("Ford Cargo",1.0),trip("Leyland",1.0)),emptyList())
        assertEquals(listOf("Ford Cargo","Leyland","mercedes 1618",FleetStats.NO_TRUCK),s.rows.map{it.name})
    }
    @Test fun numbersAreReadTheWayTheyAreTypedInUruguay(){
        val ok=mapOf("30000" to 30000.0,"30.000" to 30000.0,"1.234.567" to 1234567.0,"12,5" to 12.5,"1.234,5" to 1234.5,"1,234.5" to 1234.5,"12.5" to 12.5,"1234.56" to 1234.56,"0" to 0.0," 184 " to 184.0,"1 500" to 1500.0,"98,2" to 98.2)
        for((text,value) in ok)assertEquals(text,value,FleetStats.number(text)!!,.0001)
        for(text in listOf("","  ","-5","abc","12a","1.2.3","1,2,3,4,5","12,",",5","1.234,5,6","12.",".",",","1.23,4.5","x"))assertNull(text,FleetStats.number(text))
    }
    @Test fun onlyNumbersAndNumericTextCount(){
        assertEquals(12.0,FleetStats.number(12)!!,.0001);assertEquals(7.5,FleetStats.number(7.5)!!,.0001);assertEquals(3.0,FleetStats.number(3L)!!,.0001)
        assertNull(FleetStats.number(null));assertNull(FleetStats.number(Double.NaN));assertNull(FleetStats.number(Double.POSITIVE_INFINITY));assertNull(FleetStats.number(true));assertNull(FleetStats.number(listOf(1)))
    }
    @Test fun oldLabelsAddUpWithTheCatalogTruck(){
        val fleet=listOf(FleetStats.CatalogTruck("Leyland","HTP1545"),FleetStats.CatalogTruck("Ford Cargo 1722","GTP4265"),FleetStats.CatalogTruck("Mercedes Benz 1630","GTP1393"),FleetStats.CatalogTruck("Mercedes Benz 1618","ATM2661"))
        val ford="Ford Cargo 1722 · GTP4265"
        for(label in listOf("Ford Cargo","Ford Cargo 1722","ford cargo 1722 · gtp 4265","Otro nombre · GTP-4265","GTP4265"))assertEquals(label,ford,FleetStats.canonical(label,fleet))
        assertEquals("Mercedes Benz 1618 · ATM2661",FleetStats.canonical("Mercedes-Benz 1618",fleet));assertEquals("Mercedes Benz 1630 · GTP1393",FleetStats.canonical("Mercedes-Benz 1630",fleet));assertEquals("Leyland · HTP1545",FleetStats.canonical(" Leyland ",fleet))
        // Not enough to tell which truck: the label stays as it was written.
        for(label in listOf("Mercedes Benz","Mercedes","Fo","Scania 113","Ford Cargo 1722 · ABC1234"))assertEquals(label,label,FleetStats.canonical(label,fleet))
        assertNull(FleetStats.canonical("Sin camión asignado",fleet));assertNull(FleetStats.canonical(null,fleet));assertNull(FleetStats.canonical("  ",fleet))
        assertEquals("Ford Cargo",FleetStats.canonical("Ford Cargo",emptyList()))
        val twins=listOf(FleetStats.CatalogTruck("Scania 113","AAA1111"),FleetStats.CatalogTruck("Scania 113","BBB2222"))
        assertEquals("Scania 113",FleetStats.canonical("Scania 113",twins));assertEquals("Scania 113 · BBB2222",FleetStats.canonical("Scania · bbb2222",twins))
        assertEquals("Leyland",FleetStats.CatalogTruck("Leyland","").label);assertEquals("HTP1545",FleetStats.CatalogTruck(" ","HTP1545").label)
        val s=FleetStats.summarize(listOf("Ford Cargo","Ford Cargo 1722",ford).map{trip(FleetStats.canonical(it,fleet),10.0)},emptyList())
        assertEquals(listOf(ford),s.rows.map{it.name});assertEquals(3,s.rows[0].trips)
    }
    @Test fun aTripWithoutTruckIsNotATruck(){
        assertNull(FleetStats.truck("Sin camión asignado"));assertNull(FleetStats.truck("sin camion"));assertNull(FleetStats.truck("  "));assertNull(FleetStats.truck(null))
        assertEquals("Ford Cargo 1722 · ITP2187",FleetStats.truck("  Ford Cargo 1722 · ITP2187 "));assertEquals("Leyland",FleetStats.truck("Leyland"))
        assertNull(FleetStats.text(""));assertEquals("Hugo",FleetStats.text(" Hugo "))
    }
}
