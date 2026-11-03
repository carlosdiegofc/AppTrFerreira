package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test
class DriveTest {
    private val t0=1_000_000_000L
    /** Readings every 2 seconds at this speed, for this long, from start. */
    private fun feed(d:Drive.Detector,kmh:Double?,fromS:Int,toS:Int,lng0:Double=-56.0):Long?{
        var found:Long?=null
        for(s in fromS until toS step 2){
            // At 108 km/h, 60 m every 2 s: 0.00065° of longitude here.
            val lng=lng0+s*0.000325*(if(kmh==null)1.0 else kmh/108.0)
            val r=d.add(-34.5,lng,kmh,t0+s*1000L);if(r!=null&&found==null)found=r
        }
        return found
    }
    @Test fun fiveMinutesAtSpeedStartsATripFromWhereItStartedToMove(){
        val d=Drive.Detector()
        assertNull(feed(d,60.0,0,298))
        assertEquals(t0,feed(d,60.0,298,310))
        assertEquals(-34.5,d.origin!![0],0.0)
    }
    @Test fun aTrafficLightDoesNotBreakTheMovement(){
        val d=Drive.Detector()
        assertNull(feed(d,60.0,0,120))
        assertNull(feed(d,0.0,120,200))
        assertEquals(t0,feed(d,60.0,200,320))
    }
    @Test fun aLongStopStartsAgain(){
        val d=Drive.Detector()
        assertNull(feed(d,60.0,0,200))
        assertNull(feed(d,0.0,200,400))
        assertNull(feed(d,60.0,400,600))
        assertEquals(t0+400_000L,feed(d,60.0,600,720))
    }
    @Test fun walkingOrCityCrawlIsNotATrip(){
        val d=Drive.Detector()
        assertNull(feed(d,8.0,0,900))
    }
    @Test fun withoutSpeedItUsesTheDistanceBetweenReadings(){
        val d=Drive.Detector()
        assertEquals(t0+2000L,feed(d,null,0,320))
    }
    @Test fun withoutReadingsForAWhileItStartsAgain(){
        val d=Drive.Detector()
        assertNull(feed(d,60.0,0,200))
        assertNull(feed(d,60.0,500,700))
        assertEquals(t0+500_000L,feed(d,60.0,700,820))
    }
    @Test fun theGraceAndThePause(){
        assertTrue(Drive.inGrace(t0+Drive.GRACE_MS,t0+60_000))
        assertFalse(Drive.inGrace(t0+Drive.GRACE_MS,t0+Drive.GRACE_MS))
        assertFalse(Drive.inGrace(0,t0))
        assertTrue(Drive.paused(t0+Drive.PAUSE_MS,t0+3_600_000))
        assertFalse(Drive.paused(t0+Drive.PAUSE_MS,t0+Drive.PAUSE_MS+1))
    }
}
