package uy.transportesferreira.gps
import org.junit.Assert.assertEquals
import org.junit.Assert.assertThrows
import org.junit.Test
import java.util.Locale

class LoginIdentityTest {
    @Test fun shortNamesAndExistingEmails() {
        assertEquals("operador@trferreira.com", LoginIdentity.email("  Operador  "))
        assertEquals("operador_02@trferreira.com", LoginIdentity.email("OPERADOR_02"))
        assertEquals("oficina@ejemplo.uy", LoginIdentity.email(" Oficina@Ejemplo.uy "))
        assertEquals("operador.2@trferreira.com", LoginIdentity.email("operador.2"))
    }
    @Test fun rejectsAmbiguousNames() {
        listOf("", " ", "dos nombres", "nombre/otro").forEach {
            assertThrows(IllegalArgumentException::class.java) { LoginIdentity.email(it) }
        }
    }
    @Test fun independentOfPhoneLocale() {
        val original = Locale.getDefault()
        try {
            Locale.setDefault(Locale.forLanguageTag("tr-TR"))
            assertEquals("identity@trferreira.com", LoginIdentity.email("IDENTITY"))
        } finally { Locale.setDefault(original) }
    }
}
