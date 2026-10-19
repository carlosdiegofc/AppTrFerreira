package uy.transportesferreira.gps

import java.util.Locale

/** The short login is the existing company email's local part, never a new account. */
object LoginIdentity {
    fun email(value: String): String {
        val login = value.trim().lowercase(Locale.ROOT)
        require(login.isNotEmpty()) { "Ingresá tu nombre de usuario" }
        if ('@' in login) return login
        require(Regex("[a-z0-9][a-z0-9._-]*").matches(login)) { "Revisá tu nombre de usuario" }
        return "$login@trferreira.com"
    }
}
