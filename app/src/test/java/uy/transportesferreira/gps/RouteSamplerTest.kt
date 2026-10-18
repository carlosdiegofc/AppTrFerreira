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

    @Test fun aNewSegmentStartsWithAPoint() {
        val s=RouteSampler()
        assertTrue(s.keep(-34.9,-56.2,0,0))
        assertFalse(s.keep(-34.9,-56.2,2000,0))
        assertTrue(s.keep(-34.9,-56.2,4000,1))
        s.reset()
        assertTrue(s.keep(-34.9,-56.2,6000,1))
    }
}
