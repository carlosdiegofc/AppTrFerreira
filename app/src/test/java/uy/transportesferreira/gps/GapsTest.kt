package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test
class GapsTest {
    private val min=60_000L
    @Test fun aCutOfMoreThan90SecondsAndMoreThan300MetresIsAStretchWithoutSignal(){
        assertNull("90 seconds is still the same line",Gaps.kind(0,90_000,2000.0))
        assertNull("the truck did not go anywhere",Gaps.kind(0,10*min,299.0))
        assertEquals(Gaps.Kind.FILL,Gaps.kind(0,10*min,9000.0))
        assertEquals("three hours is still filled",Gaps.Kind.FILL,Gaps.kind(0,180*min,150_000.0))
    }
    @Test fun aLongerCutOrAnImpossibleJumpStaysToBeChecked(){
        assertEquals(Gaps.Kind.UNFILLED,Gaps.kind(0,180*min+1,150_000.0))
        assertEquals("21 km in 10 minutes is 126 km/h",Gaps.Kind.UNFILLED,Gaps.kind(0,10*min,21_000.0))
        assertEquals("20 km in 10 minutes is 120 km/h",Gaps.Kind.FILL,Gaps.kind(0,10*min,20_000.0))
    }
    @Test fun aRoadIsTakenWhenItCouldBeTheOneDriven(){
        assertTrue(Gaps.routeOk(11_800.0,10_050.0,10*min))
        assertFalse("shorter than the straight line",Gaps.routeOk(9_000.0,10_050.0,10*min))
        assertFalse("more than 130 km/h on average",Gaps.routeOk(22_000.0,15_000.0,10*min))
        assertFalse(Gaps.routeOk(Double.NaN,10_050.0,10*min))
    }
    @Test fun withoutTheRoadTheStraightLineAndAFifthMore(){
        assertEquals(12_000.0,Gaps.straight(10_000.0),1e-9)
        val line=Gaps.line(-34.70,-56.20,-34.62,-56.25)
        assertEquals("about 10 km: a point every 500 m, without the ends",19,line.size)
        assertTrue(line.all{it[0] > -34.70&&it[0] < -34.62})
        assertEquals("a short one has its middle point",1,Gaps.line(-34.70,-56.20,-34.703,-56.20).size)
    }
    @Test fun readsGooglesEncodedPolyline(){
        // The example of Google's documentation.
        val p=Gaps.decode("_p~iF~ps|U_ulLnnqC_mqNvxq`@")
        assertEquals(3,p.size)
        assertArrayEquals(doubleArrayOf(38.5,-120.2),p[0],1e-9)
        assertArrayEquals(doubleArrayOf(40.7,-120.95),p[1],1e-9)
        assertArrayEquals(doubleArrayOf(43.252,-126.453),p[2],1e-9)
        assertTrue("a cut text gives what it could read",Gaps.decode("_p~iF~ps|U_ul").size==1)
    }
    @Test fun theEstimatedReadingsKeepTheOrderOfTheTrip(){
        val path=listOf(doubleArrayOf(-34.70,-56.20),doubleArrayOf(-34.68,-56.21),doubleArrayOf(-34.66,-56.22),doubleArrayOf(-34.62,-56.25))
        val t=Gaps.timed(path,1_000_000,1_000_000+10*min)
        assertEquals("without the two readings at the ends",2,t.size)
        assertTrue(t[0].second > 1_000_000&&t[0].second < t[1].second&&t[1].second < 1_000_000+10*min)
        val two=Gaps.timed(path.take(2),0,10*min)
        assertEquals("a road of two points gets its middle one",1,two.size)
        assertEquals(-34.69,two[0].first[0],1e-9)
        val long=(0..1000).map{doubleArrayOf(-34.0-it*0.001,-56.0)}
        assertTrue("thinned to 200 at most",Gaps.timed(long,0,60*min).size<=200)
    }
    @Test fun aStretchTakesTheRoadOrTheStraightLineOrWaits(){
        val day=Gaps.WAIT_ROUTE_MS
        assertEquals(Gaps.Method.ROUTE,Gaps.settle(10_050.0,10*min,11_800.0,true,0))
        assertEquals("a road no truck could drive",Gaps.Method.STRAIGHT,Gaps.settle(15_000.0,10*min,22_000.0,true,0))
        assertEquals("Google answered without a road",Gaps.Method.STRAIGHT,Gaps.settle(10_050.0,10*min,null,true,0))
        assertNull("no answer yet: it waits",Gaps.settle(10_050.0,10*min,null,false,day-1))
        assertEquals("a day without an answer",Gaps.Method.STRAIGHT,Gaps.settle(10_050.0,10*min,null,false,day))
        assertEquals("sin_rellenar",Gaps.Method.UNFILLED.db)
    }
    @Test fun theMapJoinsAStretchWithoutSignalDashedAndLeavesAPauseOpen(){
        fun r(lat:Double,seconds:Long,segment:Int=0,estimated:Boolean=false)=Gaps.Reading(lat,-56.2,segment,seconds*1000,estimated)
        // 0.02° of latitude is about 2.2 km.
        val trip=listOf(r(-34.70,0),r(-34.69,30),r(-34.67,600,estimated=true),r(-34.65,1200),r(-34.64,1230),r(-34.62,1800),r(-34.61,1830,segment=1),r(-34.60,1860,segment=1))
        assertEquals(listOf(Triple(0,1,false),Triple(1,3,true),Triple(3,4,false),Triple(4,5,true),Triple(6,7,false)),Gaps.runs(trip))
        assertEquals("more than 3 hours stays open",Gaps.Link.NONE,Gaps.link(r(-34.70,0),r(-34.60,3*3600+1)))
        assertEquals("21 km in 10 minutes stays open",Gaps.Link.NONE,Gaps.link(r(-34.70,0),r(-34.511,600)))
        assertEquals("without times, as before, joined",Gaps.Link.SOLID,Gaps.link(Gaps.Reading(-34.7,-56.2,0,null),Gaps.Reading(-34.6,-56.2,0,5000)))
        assertTrue(Gaps.runs(listOf(r(-34.7,0))).isEmpty())
    }
}
