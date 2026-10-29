package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test
import java.time.LocalDate
class ReceiptTextTest {
    private val today=LocalDate.of(2026,10,29)
    @Test fun numbersAreReadAsTheReceiptWritesThem(){
        assertEquals(2853.80,ReceiptText.number("2.853,80",true)!!,1e-9)
        assertEquals(2853.80,ReceiptText.number("2853.80",true)!!,1e-9)
        assertEquals(45.23,ReceiptText.number("45,23",false)!!,1e-9)
        assertEquals("three decimals are litres, not thousands",45.230,ReceiptText.number("45.230",false)!!,1e-9)
        assertEquals("three digits after the mark are thousands in a total",12620.0,ReceiptText.number("12.620",true)!!,1e-9)
        assertEquals(1234567.0,ReceiptText.number("1.234.567",true)!!,1e-9)
        assertNull(ReceiptText.number("",true))
    }
    @Test fun aReceiptWithItsWordsOnTheSameLine(){
        val r=ReceiptText.parse("""
            ANCAP ESTACION RUTA 8 KM 120
            FECHA 28/10/2026 10:31
            GASOIL 50-S
            LITROS: 180,000
            PRECIO/LT: 63,10
            SUBTOTAL 11.358,00
            IVA 22% 2.081,45
            TOTAL $ 11.358,00
        """.trimIndent(),today)
        assertEquals(180.0,r.liters!!,1e-9);assertEquals(11358.0,r.total!!,1e-9);assertEquals(63.10,r.price!!,1e-9)
        assertEquals(LocalDate.of(2026,10,28),r.date)
        assertTrue(ReceiptText.clear(r))
    }
    @Test fun aNumberOnTheNextLineIsTheirs(){
        val r=ReceiptText.parse("LITROS\n95,50\nTOTAL\n6.026,00",today)
        assertEquals(95.5,r.liters!!,1e-9);assertEquals(6026.0,r.total!!,1e-9)
    }
    @Test fun litresAndTotalThatDoNotAgreeWithThePriceAreNotClear(){
        assertEquals(true,ReceiptText.consistent(100.0,63.0,6300.0))
        assertEquals("4 % off is within the tolerance",true,ReceiptText.consistent(100.0,63.0,6050.0))
        assertEquals("6 % off is not",false,ReceiptText.consistent(100.0,63.0,5900.0))
        assertNull("no price to compare",ReceiptText.consistent(100.0,null,6300.0))
        val r=ReceiptText.Reading(100.0,5900.0,63.0,null)
        assertFalse(ReceiptText.clear(r))
        assertTrue(ReceiptText.clear(ReceiptText.Reading(100.0,5900.0,null,null)))
        assertFalse("without the total there is nothing to confirm",ReceiptText.clear(ReceiptText.Reading(100.0,null,63.0,null)))
    }
    @Test fun aTextWithoutNumbersGivesNothing(){
        val r=ReceiptText.parse("GRACIAS POR SU COMPRA",today)
        assertNull(r.liters);assertNull(r.total);assertFalse(r.complete)
    }
    @Test fun datesMustBeRealAndNotInTheFuture(){
        assertEquals(LocalDate.of(2026,10,5),ReceiptText.date("05-10-26",today))
        assertNull("31 of April does not exist",ReceiptText.date("31/04/2026",today))
        assertNull("tomorrow is not a day of a receipt",ReceiptText.date("30/10/2026",today))
        assertEquals("a wrong first date does not hide the right one",LocalDate.of(2026,10,1),ReceiptText.date("99/99/2026 01/10/2026",today))
    }
    @Test fun theStationIsTheOneOfTheCatalogWhoseNameIsInTheText(){
        val names=listOf("ANCAP Ruta 8 km 120","Petrobras Treinta y Tres")
        assertEquals("ANCAP Ruta 8 km 120",ReceiptText.station("ancap - suc. 1234",names))
        assertEquals("Petrobras Treinta y Tres",ReceiptText.station("PETROBRAS URUGUAY",names))
        assertNull("nothing of the catalog",ReceiptText.station("ESTACION SERVICIO RUTA 8",names))
        assertNull("two stations of one brand are not guessed",ReceiptText.station("ANCAP",listOf("ANCAP Norte","ANCAP Sur")))
    }
}
