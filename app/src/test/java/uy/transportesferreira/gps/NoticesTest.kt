package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate
class NoticesTest {
    private val today=LocalDate.of(2026,10,28)
    private val truck="Ford Cargo 1722 · ATP 2231"
    private fun paper(id:String,days:Long?,scope:String="driver",driver:String="yo",vehicle:String="")=Notices.Paper(id,scope,driver,"Diego Rodríguez",vehicle,"Licencia de conducir",days?.let{today.plusDays(it)})
    private fun service(id:String,days:Long?,vehicle:String=truck,done:Long?=null)=Notices.Service(id,vehicle,"Cambio de aceite",days?.let{today.plusDays(it)},done?.let{today.plusDays(it)})

    @Test fun papersUseThePanelThresholds(){
        assertEquals("late",Notices.paperState(today.minusDays(1),today))
        assertEquals("soon",Notices.paperState(today,today))
        assertEquals("soon",Notices.paperState(today.plusDays(30),today))
        assertNull(Notices.paperState(today.plusDays(31),today))
        assertNull(Notices.paperState(null,today))
    }
    @Test fun servicesUseThePanelThresholds(){
        assertEquals("late",Notices.serviceState(today.minusDays(1),null,today))
        assertEquals("soon",Notices.serviceState(today.plusDays(15),null,today))
        assertNull(Notices.serviceState(today.plusDays(16),null,today))
        assertNull("a service done is not due",Notices.serviceState(today.minusDays(5),today.minusDays(2),today))
        assertNull("without a date there is nothing to tell",Notices.serviceState(null,null,today))
    }
    @Test fun aDriverHearsOfItsOwnPapersAndItsTrucks(){
        val items=Notices.due(listOf(paper("p1",10),paper("p2",-3,driver="otro"),paper("p3",-1,"vehicle",vehicle="Ford Cargo 1722 · ATP 2231"),paper("p4",5,"vehicle",vehicle="Scania · ATS 1187")),
            listOf(service("s1",6),service("s2",-2,"Scania · ATS 1187"),service("s3",3,"ford cargo · atp 2231")),today,"yo",truck,false)
        assertEquals(listOf("paper:p3","service:s3","service:s1","paper:p1"),items.map{it.key})
        assertEquals("SOA o licencia del camión van con su matrícula","ATP 2231",items[0].owner)
        assertEquals("Venció el 27/10/2026",items[0].detail)
        assertEquals("Licencia de conducir · Vence el 07/11/2026 · en 10 días",items[3].line)
    }
    @Test fun aDriverWithoutATruckHearsOnlyOfItsPapers(){
        val items=Notices.due(listOf(paper("p1",10),paper("p3",-1,"vehicle",vehicle=truck)),listOf(service("s1",6)),today,"yo","",false)
        assertEquals(listOf("paper:p1"),items.map{it.key})
    }
    @Test fun anOwnerHearsOfTheWholeFleet(){
        val items=Notices.due(listOf(paper("p2",-3,driver="otro"),paper("p4",5,"vehicle",vehicle="Scania · ATS 1187")),listOf(service("s2",-2,"Scania · ATS 1187")),today,"yo","",true)
        assertEquals(listOf("paper:p2","service:s2","paper:p4"),items.map{it.key})
        assertEquals("another driver's paper says whose it is","Diego",items[0].owner)
    }
    @Test fun eachThingIsToldOnlyWhenItChanges(){
        val soon=Notices.due(listOf(paper("p1",10)),emptyList(),today,"yo",truck,false)
        assertEquals(1,Notices.fresh(soon,emptyMap()).size)
        val seen=soon.associate{it.key to it.mark}
        assertTrue("the next day it is still close: nothing new",Notices.fresh(Notices.due(listOf(paper("p1",10)),emptyList(),today.plusDays(1),"yo",truck,false),seen).isEmpty())
        val late=Notices.due(listOf(paper("p1",10)),emptyList(),today.plusDays(11),"yo",truck,false)
        assertEquals("when it expires it is told again","late",Notices.fresh(late,seen).single().state)
        val renewed=Notices.due(listOf(Notices.Paper("p1","driver","yo","","","Licencia de conducir",today.plusDays(20))),emptyList(),today,"yo",truck,false)
        assertEquals("renewed with a new date, it is told again",1,Notices.fresh(renewed,seen).size)
    }
    @Test fun aTripLooksLeftOpenAfter14HoursOr2StoppedWithoutAPause(){
        val h=3600_000L;val start=1_000_000_000L
        assertNull(Notices.open(start,start+h,start+3*h-1,false))
        assertEquals(Notices.Open.STOPPED,Notices.open(start,start+h,start+3*h,false))
        assertNull("paused, a stop is a wait",Notices.open(start,start+h,start+5*h,true))
        assertEquals("14 hours in progress, paused or not",Notices.Open.LONG,Notices.open(start,start+13*h,start+14*h,true))
        assertNull("never moved: the stop counts from the start",Notices.open(start,0L,start+h,false))
        assertEquals(Notices.Open.STOPPED,Notices.open(start,0L,start+2*h,false))
    }
    @Test fun daysAreSaidInWords(){
        assertEquals("hoy",Notices.inDays(today,today));assertEquals("mañana",Notices.inDays(today.plusDays(1),today))
        assertEquals("en 6 días",Notices.inDays(today.plusDays(6),today));assertEquals("ayer",Notices.inDays(today.minusDays(1),today))
        assertEquals("hace 3 días",Notices.inDays(today.minusDays(3),today))
    }
}
