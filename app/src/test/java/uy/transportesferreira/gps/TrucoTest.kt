package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test
import kotlin.random.Random
import uy.transportesferreira.gps.Truco.Action
import uy.transportesferreira.gps.Truco.Call

/** Uruguayan truco: the cards and the muestra, the tantos, the rounds and the pardas, what is sung, saving, and the phone. */
class TrucoTest {
    private fun c(s:String)=Truco.Card.parse(s)!!
    private fun cards(s:String)=s.split(' ').map{c(it)}
    private fun muestra(s:String)=Truco.Muestra(c(s))
    /** A hand with the muestra and both players' cards; player 0 is mano unless said otherwise. */
    private fun hand(m:String,a:String,b:String,mano:Int=0,score:IntArray=IntArray(2))=Truco.Hand(muestra(m),listOf(cards(a),cards(b)),mano,score)
    private fun Truco.Hand.does(p:Int,vararg actions:String)=actions.forEach{assertTrue("$p:$it ${actions(p)}",act(p,Action.parse(it)!!))}

    @Test fun thePiezasAndTheOrderOfTheCards(){
        val m=muestra("3O")
        val order=cards("2O 4O 5O 11O 10O 1E 1B 7E 7O 3E 2E 1C 12E 11E 10E 7C 6E 5E 4E")
        assertEquals(order,order.sortedByDescending{m.power(it)})
        // The 1 of copa ties the 1 of oro, and the 7 of copa the 7 of basto.
        assertEquals(m.power(c("1C")),m.power(c("1O")));assertEquals(m.power(c("7C")),m.power(c("7B")))
        assertFalse(m.isPieza(c("3O")));assertFalse(m.isPieza(c("6O")));assertFalse(m.isPieza(c("2E")))
        // When the muestra is a pieza, the 12 of its suit takes its place.
        val four=muestra("4C")
        assertEquals(1,four.pieza(c("12C")));assertEquals(-1,muestra("3C").pieza(c("12C")))
        assertEquals(four.power(c("2C"))-1,four.power(c("12C")))
        assertNull(Truco.Card.parse("8E"));assertNull(Truco.Card.parse("7X"));assertEquals("10B",c("10B").toString())
    }
    @Test fun theTantosOfTheEnvidoAndTheFlor(){
        val m=muestra("3O")
        assertEquals(37,m.envido(cards("2O 7E 1B")))      // the pieza goes with any card: 30 and 7
        assertEquals(33,m.envido(cards("7E 6E 1B")))
        assertEquals(7,m.envido(cards("7C 5E 3B")))
        assertEquals(0,m.envido(cards("10E 11B 12C")))
        assertEquals(27,m.envido(cards("10O 11B 12C")))   // the sota of the muestra, 27 like the caballo
        assertEquals(27,m.envido(cards("11O 12B 10C")))
        assertTrue(m.hasFlor(cards("2O 4O 7E")));assertTrue(m.hasFlor(cards("5O 3E 6E")));assertTrue(m.hasFlor(cards("3B 5B 7B")))
        assertFalse(m.hasFlor(cards("5O 3E 6B")));assertFalse(m.hasFlor(cards("3B 5B 7E")))
        assertEquals(20+10+9+8,m.flor(cards("2O 4O 5O")))
        assertEquals(20+3+5+7,m.flor(cards("3B 5B 7B")))
    }
    @Test fun twoRoundsWinAndThePardasGoOn(){
        // 0 wins the first two rounds.
        val h=hand("3O","1E 7E 4C","5C 6C 12B");h.does(0,"1E");h.does(1,"5C");h.does(0,"7E");h.does(1,"6C")
        assertTrue(h.over);assertEquals(0,h.winner);assertArrayEquals(intArrayOf(0,0),h.roundWinners.toIntArray())
        // A parda, then 1 wins the second: the hand is 1's.
        val p=hand("3O","3E 4C 5C","3B 6E 4E");p.does(0,"3E");p.does(1,"3B");assertEquals(0,p.turn)
        p.does(0,"4C");p.does(1,"6E");assertEquals(1,p.winner)
        // 0 wins the first, then a parda: 0 wins.
        val q=hand("3O","1E 4C 5C","3B 4E 6E");q.does(0,"1E");q.does(1,"3B");q.does(0,"4C");q.does(1,"4E");assertEquals(0,q.winner)
        // Three pardas: the mano wins.
        val r=hand("3O","3E 4C 5C","3B 4E 5E",mano=1);r.does(1,"3B");r.does(0,"3E");r.does(1,"4E");r.does(0,"4C");r.does(1,"5E");r.does(0,"5C")
        assertEquals(1,r.winner)
    }
    @Test fun theEnvidoChain(){
        // Envido, envido, real envido accepted: 7 to the better tantos (0 has 33, 1 has 25).
        val h=hand("3O","7E 6E 1B","5C 12C 4B")
        h.does(0,"ENVIDO");h.does(1,"ENVIDO");h.does(0,"REAL_ENVIDO");h.does(1,"Q")
        assertEquals(7,h.events.last{it.kind==Truco.Kind.POINTS}.value);assertEquals(0,h.events.last{it.kind==Truco.Kind.POINTS}.player)
        // The same, declined: the one who sang the real envido gets the 4 accepted before it.
        val score=IntArray(2)
        val d=hand("3O","7E 6E 1B","5C 12C 4B",score=score);d.does(0,"ENVIDO");d.does(1,"ENVIDO");d.does(0,"REAL_ENVIDO");d.does(1,"N")
        assertArrayEquals(intArrayOf(4,0),score)
        // A lone envido declined is 1; equal tantos go to the mano.
        val one=IntArray(2);val o=hand("3O","7E 4C 1B","7B 2E 3C",mano=1,score=one);o.does(1,"ENVIDO");o.does(0,"N");assertArrayEquals(intArrayOf(0,1),one)
        val tie=IntArray(2);val t=hand("3O","7E 4C 1B","7B 2E 3C",mano=1,score=tie);t.does(1,"ENVIDO");t.does(0,"Q");assertArrayEquals(intArrayOf(0,2),tie)
        // The falta envido is what the one ahead still needs: 30 minus 10.
        val falta=intArrayOf(10,5);val f=hand("3O","7E 6E 1B","5C 12C 4B",score=falta);f.does(0,"FALTA_ENVIDO");f.does(1,"Q")
        assertArrayEquals(intArrayOf(30,5),falta);assertTrue(f.over)
        // Only in the first round, before playing.
        val late=hand("3O","7E 6E 1B","5C 12C 4B");late.does(0,"1B");assertFalse(Action.Sing(Call.ENVIDO) in late.actions(0))
        assertTrue(Action.Sing(Call.ENVIDO) in late.actions(1));late.does(1,"4B")
        assertFalse(late.actions(0).any{it is Action.Sing&&it.call==Call.ENVIDO})
    }
    @Test fun theTrucoAndItsRaises(){
        val score=IntArray(2)
        val h=hand("3O","1E 7E 4C","5C 6C 12B",score=score)
        h.does(0,"TRUCO");assertEquals(1,h.actor)
        // Retruco answering accepts the truco; once it is accepted, only 0 may raise, and the envido is closed.
        h.does(1,"RETRUCO");assertEquals(2,h.stake);h.does(0,"Q");assertEquals(3,h.stake)
        assertTrue(Action.Sing(Call.VALE_CUATRO) in h.actions(0));assertFalse(Action.Sing(Call.ENVIDO) in h.actions(0))
        h.does(0,"1E");assertFalse(Action.Sing(Call.VALE_CUATRO) in h.actions(1));h.does(1,"5C")
        h.does(0,"VALE_CUATRO");h.does(1,"N")
        // Declined: the one who sang gets what was accepted before.
        assertEquals(0,h.winner);assertArrayEquals(intArrayOf(3,0),score)
        // A truco declined at once is worth 1.
        val one=IntArray(2);val d=hand("3O","1E 7E 4C","5C 6C 12B",score=one);d.does(0,"TRUCO");d.does(1,"N");assertArrayEquals(intArrayOf(1,0),one)
        // To the deck: the other one gets what the hand is worth.
        val m=IntArray(2);val z=hand("3O","1E 7E 4C","5C 6C 12B",score=m);z.does(0,"TRUCO");z.does(1,"Q");z.does(0,"M");assertArrayEquals(intArrayOf(0,2),m)
    }
    @Test fun theEnvidoComesBeforeTheTruco(){
        val score=IntArray(2)
        val h=hand("3O","7E 6E 1B","5C 12C 4B",score=score)
        h.does(0,"TRUCO")
        assertTrue(Action.Sing(Call.ENVIDO) in h.actions(1))
        h.does(1,"ENVIDO");assertEquals(0,h.actor);h.does(0,"Q")
        assertArrayEquals(intArrayOf(2,0),score)
        // Back to the truco: 1 still has to answer it.
        assertEquals(Call.TRUCO,h.asked);assertEquals(1,h.actor);h.does(1,"Q");assertEquals(2,h.stake);assertEquals(0,h.actor)
    }
    @Test fun theFlor(){
        // Only one flor: 3 points as soon as its owner has to act, and no envido for anybody.
        val score=IntArray(2)
        val h=hand("3O","3B 5B 7B","1E 2C 6E",score=score)
        assertEquals(listOf<Action>(Action.Sing(Call.FLOR)),h.actions(0));h.does(0,"FLOR");assertArrayEquals(intArrayOf(3,0),score)
        h.does(0,"3B");assertFalse(h.actions(1).any{it is Action.Sing&&it.call==Call.ENVIDO})
        // An envido sung against a hidden flor: the flor answers it and takes it away.
        val e=IntArray(2);val g=hand("3O","1E 2C 6E","3B 5B 7B",score=e)
        g.does(0,"ENVIDO");assertEquals(listOf<Action>(Action.Sing(Call.FLOR)),g.actions(1));g.does(1,"FLOR")
        assertArrayEquals(intArrayOf(0,3),e);assertNull(g.asked)
        // Flor against flor: contraflor accepted, 6 to the better one (1 has 20+5+6+7, 0 has 20+3+4+5).
        val both=IntArray(2);val f=hand("3O","3B 4B 5B","5E 6E 7E",score=both)
        f.does(0,"FLOR");assertEquals(1,f.actor);f.does(1,"CONTRAFLOR");f.does(0,"Q");assertArrayEquals(intArrayOf(0,6),both)
        // Con flor me achico: 4 to the first.
        val a=IntArray(2);val x=hand("3O","3B 4B 5B","5E 6E 7E",score=a);x.does(0,"FLOR");x.does(1,"A");assertArrayEquals(intArrayOf(4,0),a)
        // Contraflor al resto declined after a contraflor: 6 to the one who sang it.
        val r=IntArray(2);val y=hand("3O","3B 4B 5B","5E 6E 7E",score=r);y.does(0,"FLOR");y.does(1,"CONTRAFLOR");y.does(0,"CONTRAFLOR_AL_RESTO");y.does(1,"N")
        assertArrayEquals(intArrayOf(6,0),r)
    }
    @Test fun aGameIsKeptAsTextAndPlayedAgain(){
        val g=Truco.Match(Random(4)).also{it.deal()}
        var steps=0
        while(!g.hand.over&&steps<4){val p=g.hand.actor;g.hand.act(p,g.hand.actions(p).first());steps++}
        val back=Truco.Match.load(g.save())!!
        assertArrayEquals(g.score,back.score);assertEquals(g.dealer,back.dealer)
        assertEquals(g.hand.dealt,back.hand.dealt);assertEquals(g.hand.log,back.hand.log);assertEquals(g.hand.actor,back.hand.actor)
        assertNull(Truco.Match.load("1|0|0|0|1E 1E 2E 3E 4E 5E 6E|"));assertNull(Truco.Match.load("2|0|0|0||"));assertNull(Truco.Match.load(null))
    }
    @Test fun thePhoneAlwaysDoesSomethingAllowedAndGamesEnd(){
        // Phone against phone, many games: every action is allowed and every game reaches 30.
        for(seed in 0 until 20){
            val r=Random(seed);val g=Truco.Match(r).also{it.deal()}
            var guard=0
            while(g.winner<0&&guard++<2000){
                if(g.hand.over){assertTrue(g.next());continue}
                val p=g.hand.actor;val a=TrucoAi.act(g.hand,p,r)!!
                assertTrue("$seed $a ${g.hand.actions(p)}",g.hand.act(p,a))
            }
            assertTrue("seed $seed",g.winner>=0)
        }
    }
    @Test fun thePhoneWeighsTheTruco(){
        // With the three best matas and few tantos it takes the truco (or raises it).
        for(seed in 0 until 5){
            val q=hand("3O","5C 6C 12B","1E 1B 7O");q.does(0,"TRUCO")
            assertTrue("$seed",TrucoAi.act(q,1,Random(seed)) in listOf(Action.Quiero,Action.Sing(Call.RETRUCO)))
        }
        // Having lost the first round with the two weakest cards left, it lets the truco go.
        for(seed in 0 until 5){
            val h=hand("3O","1E 1B 7E","4E 5B 6C");h.does(0,"1E");h.does(1,"4E");h.does(0,"TRUCO")
            assertEquals("$seed",Action.NoQuiero,TrucoAi.act(h,1,Random(seed)))
        }
    }
}
