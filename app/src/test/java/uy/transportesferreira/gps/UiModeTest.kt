package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test
class UiModeTest {
    @Test fun driversChooseAModeBeforeAnythingElse(){
        assertEquals("mode",UiMode.start(false,null,false));assertEquals("mode",UiMode.start(false,null,true));assertEquals("mode",UiMode.start(false,"otro",false))
    }
    @Test fun simpleModeHasOnlyTwoScreens(){
        assertEquals("simplehome",UiMode.start(false,UiMode.SIMPLE,false));assertEquals("simpletrip",UiMode.start(false,UiMode.SIMPLE,true))
    }
    @Test fun normalModeKeepsTheFullApp(){
        assertEquals("home",UiMode.start(false,UiMode.NORMAL,false));assertEquals("trip",UiMode.start(false,UiMode.NORMAL,true))
    }
    @Test fun ownersAlwaysOpenTheFleetPanel(){
        for(m in listOf(null,UiMode.SIMPLE,UiMode.NORMAL)){assertEquals("owner",UiMode.start(true,m,false));assertEquals("owner",UiMode.start(true,m,true))}
    }
    @Test fun onlySavedChoicesCount(){
        assertNull(UiMode.parse(null));assertNull(UiMode.parse(""));assertNull(UiMode.parse("Simple"));assertEquals(UiMode.SIMPLE,UiMode.parse("simple"));assertEquals(UiMode.NORMAL,UiMode.parse("normal"))
    }
}
