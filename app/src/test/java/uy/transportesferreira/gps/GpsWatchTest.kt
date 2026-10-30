package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test
class GpsWatchTest {
    private val start=1_000_000_000L
    @Test fun aReadingAMinuteAgoIsNotACut(){
        assertNull(Watch.silentMinutes(start+60_000,start,start+120_000))
    }
    @Test fun threeMinutesWithoutReadingsIsACut(){
        assertEquals(3L,Watch.silentMinutes(start,start,start+3*60_000))
        assertEquals(17L,Watch.silentMinutes(start+60_000,start,start+18*60_000+30_000))
    }
    @Test fun aTripWithoutReadingsCountsFromItsStart(){
        assertNull(Watch.silentMinutes(null,start,start+2*60_000))
        assertEquals(5L,Watch.silentMinutes(null,start,start+5*60_000))
    }
    @Test fun aReadingOfAnEarlierTripDoesNotCount(){
        // A last reading from before the trip started (a resumed trip keeps it) counts from the start.
        assertNull(Watch.silentMinutes(start-3_600_000,start,start+60_000))
    }
    @Test fun theBrandsWithTheirOwnBatterySavingHaveTheirSteps(){
        assertEquals("Samsung",BatteryGuide.of("samsung")!!.brand)
        assertEquals("Xiaomi",BatteryGuide.of("Xiaomi")!!.brand)
        assertEquals("Xiaomi",BatteryGuide.of("POCO")!!.brand)
        assertEquals("Honor",BatteryGuide.of("HONOR")!!.brand)
        assertEquals("Realme",BatteryGuide.of("realme")!!.brand)
        assertEquals("Motorola",BatteryGuide.of("motorola")!!.brand)
        assertTrue(BatteryGuide.of("samsung")!!.steps.contains("Apps que nunca se suspenden"))
    }
    @Test fun aPhoneWithoutItsOwnSavingHasNoExtraSteps(){
        assertNull(BatteryGuide.of("Google"))
        assertNull(BatteryGuide.of(""))
        assertNull(BatteryGuide.of(null))
    }
}
