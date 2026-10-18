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
    @Test fun theFleetPanelAccountSkipsTheModes(){
        for(m in listOf(null,UiMode.SIMPLE,UiMode.NORMAL)){assertEquals("owner",UiMode.start(true,m,false));assertEquals("owner",UiMode.start(true,m,true))}
    }
    @Test fun theCompanyAccountOpensOnTheFleetPanel(){
        val company="transportesferreirauy@gmail.com"
        assertTrue(UiMode.owner(company));assertTrue(UiMode.panelFirst(company));assertFalse(UiMode.drivingOwner(company))
    }
    @Test fun anOwnerWhoDrivesStartsLikeADriver(){
        val luis="luis@trferreira.com"
        assertTrue(UiMode.owner(luis));assertTrue(UiMode.drivingOwner(luis));assertFalse(UiMode.panelFirst(luis));assertTrue(UiMode.drivingOwner("  Luis@TRFerreira.com "))
        assertEquals("mode",UiMode.start(UiMode.panelFirst(luis),null,false))
        assertEquals("simplehome",UiMode.start(UiMode.panelFirst(luis),UiMode.SIMPLE,false));assertEquals("simpletrip",UiMode.start(UiMode.panelFirst(luis),UiMode.SIMPLE,true))
        assertEquals("home",UiMode.start(UiMode.panelFirst(luis),UiMode.NORMAL,false));assertEquals("trip",UiMode.start(UiMode.panelFirst(luis),UiMode.NORMAL,true))
    }
    @Test fun driversAreNotOwners(){
        for(e in listOf("hugo@trferreira.com","immer@trferreira.com","",null)){assertFalse(UiMode.owner(e));assertFalse(UiMode.panelFirst(e));assertFalse(UiMode.drivingOwner(e))}
    }
    @Test fun onlySavedChoicesCount(){
        assertNull(UiMode.parse(null));assertNull(UiMode.parse(""));assertNull(UiMode.parse("Simple"));assertEquals(UiMode.SIMPLE,UiMode.parse("simple"));assertEquals(UiMode.NORMAL,UiMode.parse("normal"))
    }
}
