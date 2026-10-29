package uy.transportesferreira.gps
import org.json.JSONObject
import org.junit.Assert.*
import org.junit.Test
class StopsTest {
    private fun stop(pos:Int,client:String="",arrived:String?=null,finished:String?=null)=JSONObject().put("position",pos).put("client",client).put("place","")
        .put("arrived_at",arrived?:JSONObject.NULL).put("finished_at",finished?:JSONObject.NULL)
    @Test fun aStopIsWaitingThenBeingUnloadedThenDone(){
        assertEquals(Stops.State.WAITING,Stops.state(stop(1)))
        assertEquals(Stops.State.UNLOADING,Stops.state(stop(1,arrived="2026-10-29T10:00:00Z")))
        assertEquals(Stops.State.DONE,Stops.state(stop(1,arrived="2026-10-29T10:00:00Z",finished="2026-10-29T10:30:00Z")))
    }
    @Test fun theNextStopIsTheFirstWaitingOneInTheOrderOfTheTrip(){
        val list=listOf(stop(3,"C"),stop(1,"A",arrived="2026-10-29T10:00:00Z",finished="2026-10-29T10:30:00Z"),stop(2,"B"))
        assertEquals("B",Stops.next(list)!!.getString("client"))
        assertNull(Stops.unloading(list))
        assertEquals("B",Stops.unloading(listOf(stop(2,"B",arrived="2026-10-29T10:00:00Z")))!!.getString("client"))
        assertNull(Stops.next(listOf(stop(1,"A",arrived="2026-10-29T10:00:00Z"))))
    }
    @Test fun theTitleAndTheButtonNameTakeWhatThereIs(){
        assertEquals("Molino San José · San José",Stops.title(JSONObject().put("position",1).put("client","Molino San José").put("place","San José")))
        assertEquals("Parada 2",Stops.title(JSONObject().put("position",2).put("client","").put("place","")))
        assertEquals("San José",Stops.short(JSONObject().put("position",1).put("client","").put("place","San José")))
    }
    @Test fun minutesAreCountedFromTheArrivalToTheEndOrToNow(){
        val s=stop(1,arrived="2026-10-29T10:00:00Z",finished="2026-10-29T10:25:40Z")
        assertEquals(25L,Stops.minutes(s,0))
        val open=stop(1,arrived="2026-10-29T10:00:00Z")
        assertEquals(10L,Stops.minutes(open,java.time.Instant.parse("2026-10-29T10:10:30Z").toEpochMilli()))
        assertNull(Stops.minutes(stop(1),0))
    }
    @Test fun theTruckMovingOffIsOnlyAfter15KmhFor30SecondsInARow(){
        val m=Stops.Mover();val t0=1_000_000L
        assertNull("stopped",m.add(0.0,t0))
        assertNull("starts to move",m.add(20.0,t0+2_000))
        assertNull("15 s is not enough",m.add(25.0,t0+17_000))
        assertEquals("30 s after it started: the time it started",t0+2_000,m.add(30.0,t0+32_000))
    }
    @Test fun aSlowReadingStartsTheCountAgainAndOneWithoutSpeedChangesNothing(){
        val m=Stops.Mover();val t0=1_000_000L
        m.add(20.0,t0);assertNull(m.add(null,t0+20_000));assertNull(m.add(10.0,t0+25_000))
        assertNull("it began again at "+(t0+30_000),m.add(20.0,t0+30_000))
        assertEquals(t0+30_000,m.add(20.0,t0+60_000))
        m.reset();assertNull(m.add(20.0,t0+70_000))
    }
}
