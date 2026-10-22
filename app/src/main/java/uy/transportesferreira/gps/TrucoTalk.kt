package uy.transportesferreira.gps

import uy.transportesferreira.gps.Truco.Action
import uy.transportesferreira.gps.Truco.Call
import uy.transportesferreira.gps.Truco.Kind

/**
 * What the truco screen says, in the Spanish of Uruguay: the score in malas and buenas, the cards by name, what each one
 * sang and what to do now. Player 0 is the person and 1 the phone.
 */
object TrucoTalk {
    /** Up to 15 are the malas and 16 to 29 the buenas, counted again from 1; 30 ends the game. */
    fun score(points:Int)=when{
        points<=15->"$points ${if(points==1)"mala" else "malas"}"
        points<30->"${points-15} ${if(points==16)"buena" else "buenas"}"
        else->"30"
    }
    fun suitName(s:Truco.Suit)=when(s){Truco.Suit.ESPADA->"espada";Truco.Suit.BASTO->"basto";Truco.Suit.ORO->"oro";Truco.Suit.COPA->"copa"}
    fun figure(rank:Int)=when(rank){10->"Sota";11->"Caballo";12->"Rey";else->null}
    fun cardName(c:Truco.Card)="${c.rank} de ${suitName(c.suit)}"+(figure(c.rank)?.let{", ${it.lowercase()}"}?:"")
    private fun points(n:Int)=if(n==1)"1 punto" else "$n puntos"

    /** What a player's tantos are worth: the flor if the cards make one, or else the envido. */
    fun tantos(m:Truco.Muestra,cards:List<Truco.Card>)=if(m.hasFlor(cards))"Tenés flor: ${m.flor(cards)}." else "Tenés ${m.envido(cards)} de envido."

    /** How an action sounds: the calls are sung, the answers said. Playing a card says nothing. */
    fun said(a:Action):String?=when(a){
        is Action.Sing->"¡${a.call.text}!"
        Action.Quiero->"Quiero";Action.NoQuiero->"No quiero";Action.Achico->"Con flor me achico";Action.Mazo->"Me voy al mazo"
        is Action.Play->null
    }
    /** What a player said last in this hand, until they play a card. */
    fun lastSaid(h:Truco.Hand,p:Int)=h.log.lastOrNull{it.first==p}?.second?.let{said(it)}

    /** The tantos shown and the points won in this hand, as lines for the screen, oldest first. */
    fun news(h:Truco.Hand):List<String>{
        val out=ArrayList<String>();val e=h.events;var i=0
        while(i<e.size){
            val ev=e[i]
            when(ev.kind){
                Kind.TANTOS->{
                    // They come in pairs, the mano's first, and the points they were for come right after.
                    val other=e.getOrNull(i+1)?.takeIf{it.kind==Kind.TANTOS}
                    val what=e.drop(i).firstOrNull{it.kind==Kind.POINTS}?.text
                    val pair=listOfNotNull(ev,other).joinToString(", "){"${if(it.player==0)"vos" else "el teléfono"} ${it.value}"}
                    out.add("${if(what=="flor")"Flor" else "Envido"}: $pair.")
                    if(other!=null)i++
                }
                Kind.POINTS->out.add(when(ev.text){
                    "envido"->if(ev.player==0)"Te llevás el envido: ${points(ev.value)}." else "El teléfono se lleva el envido: ${points(ev.value)}."
                    "flor"->if(ev.player==0)"Te llevás la flor: ${points(ev.value)}." else "El teléfono se lleva la flor: ${points(ev.value)}."
                    else->if(ev.player==0)"Ganaste la mano: ${points(ev.value)}." else "El teléfono ganó la mano: ${points(ev.value)}."
                })
                Kind.SAID->{}
            }
            i++
        }
        return out
    }

    /** What is going on and what the person has to do now. */
    fun status(m:Truco.Match):String{
        val h=m.hand;val s=m.score
        if(m.winner==0)return "¡Ganaste la partida, ${s[0]} a ${s[1]}!"
        if(m.winner==1)return "Ganó el teléfono la partida, ${s[1]} a ${s[0]}."
        if(h.over)return if(h.winner==0)"Ganaste la mano." else "El teléfono ganó la mano."
        if(h.actor==1)return "Juega el teléfono…"
        val actions=h.actions(0)
        if(actions==listOf<Action>(Action.Sing(Call.FLOR)))return "Tenés flor: cantala."
        return when(h.asked){
            null->"Te toca jugar."
            Call.FLOR->"El teléfono cantó flor y vos también tenés."
            Call.FALTA_ENVIDO->"El teléfono cantó falta envido, que vale ${points(h.faltaPoints)}. ¿Querés?"
            Call.CONTRAFLOR_AL_RESTO->"El teléfono cantó contraflor al resto, que vale ${points(h.faltaPoints)}. ¿Querés?"
            else->"El teléfono cantó ${h.asked!!.text.lowercase()}. ¿Querés?"
        }
    }

    /** The rules this table plays by (decisions of 21 and 22/10/2026). */
    const val RULES="Truco uruguayo para dos, a 30: 15 malas y 15 buenas.\n\n"+
        "• La muestra: el 2, el 4, el 5, el 11 y el 10 de su palo son las piezas, de la más alta a la más baja. Si la muestra es una de ellas, el 12 toma su lugar. Las piezas llevan una estrella.\n"+
        "• Después vienen el 1 de espada, el 1 de basto, el 7 de espada y el 7 de oro; luego los 3, los 2, los otros 1, los 12, los 11, los 10, los otros 7, los 6, los 5 y los 4. Dos cartas iguales empatan la ronda (parda).\n"+
        "• Envido: dos cartas del mismo palo suman 20 y sus números; las figuras valen 0. Una pieza va con cualquier carta: el 2 vale 30, el 4 29, el 5 28, el 11 y el 10 27. Envido 2, real envido 3 y falta envido, lo que le falta al que va ganando para llegar a 30.\n"+
        "• Flor: tres cartas del mismo palo, o con piezas. Se canta siempre y vale 3. Contra otra flor: contraflor 6, contraflor al resto, o «con flor me achico», que le da 4 al otro.\n"+
        "• Truco 2, retruco 3 y vale cuatro 4. El envido está primero: se puede cantar en vez de responder el truco, en la primera ronda.\n"+
        "• La mano la gana quien gana dos rondas. Si hay una parda, gana quien ganó la primera ronda; si la primera fue parda, quien gane la siguiente. Con tres pardas, gana el que es mano."
}
