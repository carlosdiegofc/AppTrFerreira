package uy.transportesferreira.gps

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class RouteSamplerTest {
    // About 50 m north per step: a truck at 90 km/h with a reading every 2 s.
    private fun north(i:Int)=-34.9+i*0.00045

    @Test fun movingKeepsAPointEveryFiveSeconds() {
        val s=RouteSampler()
        val kept=(0..10).count{s.keep(north(it),-56.2,it*2000L,0)}
        // 0 s, 6 s, 12 s, 18 s: one every five seconds or so, not one per reading.
        assertEquals(4,kept)
    }

    @Test fun stoppedKeepsOneEveryThirtySeconds() {
        val s=RouteSampler()
        val kept=(0..30).count{s.keep(-34.9,-56.2,it*2000L,0)}
        assertEquals(3,kept)
    }

    @Test fun slowTrafficKeepsAPointEveryTwentyMetres() {
        val s=RouteSampler()
        assertTrue(s.keep(-34.9,-56.2,0,0))
        // 10 m in 6 s: not yet; 22 m in 10 s: kept.
        assertFalse(s.keep(-34.9+0.00009,-56.2,6000,0))
        assertTrue(s.keep(-34.9+0.0002,-56.2,10000,0))
    }

    // About 15 m east per step at Montevideo's latitude: a truck at 27 km/h with a reading every 2 s.
    private fun east(i:Int)=-56.2+i*0.000165

    @Test fun aTurnKeepsTheCornerReading() {
        val s=RouteSampler()
        assertTrue(s.keep(-34.9,east(0),0,0,27.0,4.0,90.0))
        // At the corner, still heading east: not a point yet.
        assertFalse(s.keep(-34.9,east(1),2000,0,27.0,4.0,90.0))
        // Heading north after the corner: kept at once, before five seconds, with the reading before it (the corner)
        // first, so the line turns where the truck did.
        assertTrue(s.keep(-34.9+0.000135,east(1),4000,0,27.0,4.0,0.0))
        assertTrue(s.corner)
        // Going straight north again: back to one every five seconds.
        assertFalse(s.keep(-34.9+0.00027,east(1),6000,0,27.0,4.0,2.0))
        assertFalse(s.corner)
    }

    @Test fun aTurnRightAfterAPointAddsNoCorner() {
        val s=RouteSampler()
        assertTrue(s.keep(-34.9,east(0),0,0,27.0,4.0,90.0))
        // Kept by the five seconds and twenty metres: the corner is already in the route.
        assertTrue(s.keep(-34.9,east(3),6000,0,27.0,4.0,90.0))
        assertTrue(s.keep(-34.9+0.000135,east(3),8000,0,27.0,4.0,0.0))
        assertFalse(s.corner)
    }

    @Test fun aSlowTruckDoesNotTurnOnHeadingNoise() {
        val s=RouteSampler()
        assertTrue(s.keep(-34.9,-56.2,0,0,4.0,4.0,90.0))
        // At 4 km/h the GPS heading wanders: not a corner.
        assertFalse(s.keep(-34.9,-56.2+0.0001,2000,0,4.0,4.0,200.0))
    }

    @Test fun aParkedPhoneLeavesItsJitterOut() {
        val s=RouteSampler()
        // The trip starts with the truck parked.
        assertTrue(s.keep(-34.9,-56.2,0,0,0.0,4.0,null))
        // 40 m away with the truck stopped: the GPS jumped, or the driver walked off with the phone. If the trip pauses
        // now, that reading does not go in as the last one either.
        assertFalse(s.keep(-34.9+0.00036,-56.2,32000,0,0.0,6.0,null))
        assertFalse(s.keep(-34.9+0.00036,-56.2,64000,0,5.0,6.0,null))
        assertTrue(s.jittery)
        // A poor fix where it stands is left out too.
        assertFalse(s.keep(-34.9,-56.2,96000,0,0.0,30.0,null))
        assertTrue(s.jittery)
        // A poor fix 60 m away does not end the stop: its 30 m of error leave it within 50 m.
        assertFalse(s.keep(-34.9+0.00054,-56.2,97000,0,1.0,30.0,null))
        assertTrue(s.jittery)
        // A good fix where it stands: one every 30 s, as before.
        assertTrue(s.keep(-34.9+0.00002,-56.2,128000,0,0.0,4.0,null))
        assertFalse(s.jittery)
        // It drives off: faster than 8 km/h the readings count again.
        assertTrue(s.keep(-34.9+0.0004,-56.2,134000,0,20.0,4.0,0.0))
        assertFalse(s.jittery)
    }

    @Test fun aStopAlsoEndsByDistanceWithoutSpeed() {
        val s=RouteSampler()
        assertTrue(s.keep(-34.9,-56.2,0,0,0.0,4.0,null))
        // Readings without speed 100 m away, with a good fix: the truck left, so they count again.
        assertTrue(s.keep(-34.9+0.0009,-56.2,10000,0,null,5.0,null))
        assertFalse(s.jittery)
        assertTrue(s.keep(-34.9+0.0018,-56.2,16000,0,null,5.0,null))
    }

    @Test fun aPoorReadingOfATruckThatIsNotMovingStaysOutAtThePause() {
        val s=RouteSampler()
        assertTrue(s.keep(-34.9,-56.2,0,0,30.0,4.0,0.0))
        // Slowing down with a poor fix (30 m): not a point, and not a stop either.
        assertFalse(s.keep(-34.9+0.0002,-56.2,2000,0,1.0,30.0,null))
        // If the trip pauses now, it does not go in as the last reading.
        assertTrue(s.jittery)
        // A good reading at a walking pace is not jitter: at a pause it reaches where the truck is.
        assertFalse(s.keep(-34.9+0.00022,-56.2,4000,0,4.0,5.0,null))
        assertFalse(s.jittery)
    }

    @Test fun theReadingWhereItStopsIsKept() {
        val s=RouteSampler()
        assertTrue(s.keep(-34.9,-56.2,0,0,30.0,4.0,0.0))
        // Slowing down 15 m later, two seconds after: not a point yet.
        assertFalse(s.keep(-34.9+0.000135,-56.2,2000,0,10.0,4.0,0.0))
        // Stopped 25 m further on: where it stopped is kept, so the line reaches it.
        assertTrue(s.keep(-34.9+0.00036,-56.2,4000,0,0.0,4.0,null))
    }

    @Test fun aNewSegmentStartsWithAPoint() {
        val s=RouteSampler()
        assertTrue(s.keep(-34.9,-56.2,0,0))
        assertFalse(s.keep(-34.9,-56.2,2000,0))
        assertTrue(s.keep(-34.9,-56.2,4000,1))
        s.reset()
        assertTrue(s.keep(-34.9,-56.2,6000,1))
    }
}
