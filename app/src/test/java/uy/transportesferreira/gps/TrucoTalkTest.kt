package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test
import uy.transportesferreira.gps.Truco.Action

/** What the truco screen says and the drawings of its cards. */
class TrucoTalkTest {
    private fun c(s:String)=Truco.Card.parse(s)!!
    private fun cards(s:String)=s.split(' ').map{c(it)}
    /** A game as saved: the scores before the hand, who dealt (1: the person is mano), the cards (the person's, the phone's, the muestra) and the actions. */
    private fun game(cards:String,log:String="",scores:String="0|0",dealer:Int=1)=Truco.Match.load("1|$scores|$dealer|$cards|$log")!!
    private fun Truco.Hand.does(p:Int,vararg actions:String)=actions.forEach{assertTrue("$p:$it ${actions(p)}",act(p,Action.parse(it)!!))}

    @Test fun theScoreInMalasAndBuenas(){
        assertEquals(listOf("0 malas","1 mala","15 malas","1 buena","2 buenas","14 buenas","30"),listOf(0,1,15,16,17,29,30).map{TrucoTalk.score(it)})
    }
    @Test fun theCardsByName(){
        assertEquals("1 de espada",TrucoTalk.cardName(c("1E")))
        assertEquals("10 de oro, sota",TrucoTalk.cardName(c("10O")))
        assertEquals("11 de basto, caballo",TrucoTalk.cardName(c("11B")))
        assertEquals("12 de copa, rey",TrucoTalk.cardName(c("12C")))
        val m=Truco.Muestra(c("3O"))
        assertEquals("Tenés 33 de envido.",TrucoTalk.tantos(m,cards("7E 6E 1B")))
        assertEquals("Tenés flor: 35.",TrucoTalk.tantos(m,cards("3B 5B 7B")))
    }
    @Test fun whatEachOneSaidUntilTheyPlay(){
        val g=game("7E 6E 1B 5C 12C 4B 3O");val h=g.hand
        assertNull(TrucoTalk.lastSaid(h,0))
        h.does(0,"1B");h.does(1,"TRUCO");assertEquals("¡Truco!",TrucoTalk.lastSaid(h,1));assertNull(TrucoTalk.lastSaid(h,0))
        h.does(0,"Q");assertEquals("Quiero",TrucoTalk.lastSaid(h,0))
        h.does(1,"4B");assertNull(TrucoTalk.lastSaid(h,1));assertEquals("Quiero",TrucoTalk.lastSaid(h,0))
    }
    @Test fun theNewsOfAHand(){
        // Envido accepted: both tantos, the mano's first, and the points.
        val e=game("7E 6E 1B 5C 12C 4B 3O");e.hand.does(0,"ENVIDO");e.hand.does(1,"Q")
        assertEquals(listOf("Envido: vos 33, el teléfono 25.","Te llevás el envido: 2 puntos."),TrucoTalk.news(e.hand))
        // A flor alone shows no tantos; the hand won by the phone ends the news.
        val f=game("3B 5B 7B 1E 1C 6O 3O");f.hand.does(0,"FLOR","M")
        assertEquals(listOf("Te llevás la flor: 3 puntos.","El teléfono ganó la mano: 1 punto."),TrucoTalk.news(f.hand))
        // Flor against flor, contraflor accepted: the phone has the better one.
        val ff=game("3B 4B 5B 5E 6E 7E 3O");ff.hand.does(0,"FLOR");ff.hand.does(1,"CONTRAFLOR");ff.hand.does(0,"Q")
        assertEquals(listOf("Flor: vos 32, el teléfono 38.","El teléfono se lleva la flor: 6 puntos."),TrucoTalk.news(ff.hand))
    }
    @Test fun whatToDoNow(){
        val g=game("7E 6E 1B 5C 12C 4B 3O");val h=g.hand
        assertEquals("Te toca jugar.",TrucoTalk.status(g))
        h.does(0,"1B");assertEquals("Juega el teléfono…",TrucoTalk.status(g))
        h.does(1,"TRUCO");assertEquals("El teléfono cantó truco. ¿Querés?",TrucoTalk.status(g))
        h.does(0,"N");assertEquals("El teléfono ganó la mano.",TrucoTalk.status(g))
        // The falta envido says what it is worth: what the one ahead needs.
        val f=game("7E 6E 1B 5C 12C 4B 3O",scores="12|20",dealer=0);f.hand.does(1,"FALTA_ENVIDO")
        assertEquals("El teléfono cantó falta envido, que vale 10 puntos. ¿Querés?",TrucoTalk.status(f))
        // With flor, first the flor.
        val fl=game("3B 5B 7B 1E 1C 6O 3O");assertEquals("Tenés flor: cantala.",TrucoTalk.status(fl))
        val won=game("7E 6E 1B 5C 12C 4B 3O",scores="28|12");won.hand.does(0,"ENVIDO");won.hand.does(1,"Q")
        assertEquals("¡Ganaste la partida, 30 a 12!",TrucoTalk.status(won))
    }
    @Test fun theSuitsAreShapesThatRead(){
        assertEquals(Truco.Suit.entries.toSet(),TrucoArt.SUITS.keys)
        for((suit,art) in TrucoArt.SUITS){
            assertTrue("$suit",art.shapes.isNotEmpty())
            for(s in art.shapes){val steps=ChessArt.steps(s.d);assertEquals("$suit ${s.d}",'M',steps.first().op);assertEquals("$suit ${s.d}",'Z',steps.last().op)}
            for(d in art.shapes.map{it.d}+art.details)for(st in ChessArt.steps(d))for(v in st.xy)assertTrue("$suit $d",v in 0f..100f)
        }
        val star=ChessArt.steps(TrucoArt.star(86.0,14.0,8.0))
        assertEquals(11,star.size);assertTrue(star.flatMap{it.xy.toList()}.all{it in 0f..100f})
    }
}
