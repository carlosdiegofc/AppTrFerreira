package uy.transportesferreira.gps
import org.junit.Test
import org.junit.Assert.*
class InputRulesTest {
 @Test fun missingMetadataNeverBlocksStart(){assertEquals("Sin camión asignado",InputRules.vehicle("  "));assertNull(InputRules.optionalNumber(""));assertNull(InputRules.optionalNumber("."));assertNull(InputRules.optionalNumber("-2"));assertNull(InputRules.optionalNumber("Infinity"))}
 @Test fun acceptsLocalDecimalsAndZero(){assertEquals(1234.5,InputRules.optionalNumber("1234,5")!!,.001);assertEquals(0.0,InputRules.optionalNumber("0")!!,.001)}
}
