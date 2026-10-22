package uy.transportesferreira.gps

import kotlin.random.Random
import uy.transportesferreira.gps.Truco.Action
import uy.transportesferreira.gps.Truco.Call
import uy.transportesferreira.gps.Truco.Card

/**
 * The phone's side of a truco hand. It looks only at its own cards, the muestra, the cards on the table and what was
 * sung: to weigh a card or an answer it plays the rest of the hand many times with cards the other one could have, and
 * counts how often it wins. It sings the envido and the flor by its tantos, and bluffs now and then.
 */
object TrucoAi {
    private const val SAMPLES=120

    fun act(h:Truco.Hand,me:Int,random:Random=Random.Default):Action?{
        val options=h.actions(me);if(options.isEmpty())return null
        if(options.size==1)return options[0]
        val m=h.muestra
        fun sing(c:Call)=Action.Sing(c)
        fun has(a:Action)=a in options
        val flor=m.flor(h.dealt[me]);val envido=m.envido(h.dealt[me])
        val chance by lazy{winChance(h,me,random)}
        when(h.asked){
            // Flor against flor: by how good its own is.
            Call.FLOR->return when{flor>=38->sing(Call.CONTRAFLOR_AL_RESTO);flor>=31->sing(Call.CONTRAFLOR);else->Action.Achico}
            Call.CONTRAFLOR->return when{flor>=38->sing(Call.CONTRAFLOR_AL_RESTO);flor>=31->Action.Quiero;else->Action.NoQuiero}
            Call.CONTRAFLOR_AL_RESTO->return if(flor>=34)Action.Quiero else Action.NoQuiero
            Call.ENVIDO,Call.REAL_ENVIDO,Call.FALTA_ENVIDO->{
                val need=when(h.asked){Call.ENVIDO->26;Call.REAL_ENVIDO->28;else->if(h.faltaPoints<=4)26 else 30}+random.nextInt(-1,2)
                if(envido>=need+4&&has(sing(Call.REAL_ENVIDO))&&random.nextInt(3)==0)return sing(Call.REAL_ENVIDO)
                if(envido>=33&&has(sing(Call.FALTA_ENVIDO))&&random.nextInt(3)==0)return sing(Call.FALTA_ENVIDO)
                return if(envido>=need)Action.Quiero else Action.NoQuiero
            }
            Call.TRUCO,Call.RETRUCO,Call.VALE_CUATRO->{
                // «El envido está primero», with good tantos.
                if(has(sing(Call.ENVIDO))&&envido>=28&&random.nextInt(4)!=0)return sing(if(envido>=31)Call.REAL_ENVIDO else Call.ENVIDO)
                val raise=options.firstOrNull{it is Action.Sing&&it.call in listOf(Call.RETRUCO,Call.VALE_CUATRO)}
                val bar=when(h.asked){Call.TRUCO->0.42;Call.RETRUCO->0.5;else->0.55}
                return when{
                    raise!=null&&chance>=0.8&&random.nextInt(3)!=0->raise
                    chance>=bar->Action.Quiero
                    // Sometimes it holds on with a weak hand, as people do.
                    chance>=bar-0.15&&random.nextInt(5)==0->Action.Quiero
                    else->Action.NoQuiero
                }
            }
            else->{}
        }
        // Its turn: the envido first, then maybe the truco, then a card.
        if(has(sing(Call.ENVIDO))){
            val r=random.nextInt(100)
            when{
                envido>=33&&r<35->return sing(Call.FALTA_ENVIDO)
                envido>=30&&r<45->return sing(Call.REAL_ENVIDO)
                envido>=27&&r<70->return sing(Call.ENVIDO)
                r<5->return sing(Call.ENVIDO)
            }
        }
        val truco=options.firstOrNull{it is Action.Sing&&it.call in listOf(Call.TRUCO,Call.RETRUCO,Call.VALE_CUATRO)}
        if(truco!=null){
            val r=random.nextInt(100)
            if((chance>=0.72&&r<55)||(chance in 0.25..0.5&&r<7))return truco
        }
        val plays=options.filterIsInstance<Action.Play>()
        if(plays.isEmpty())return options.first{it !is Action.Mazo}
        return bestCard(h,me,plays.map{it.card},random)
    }

    /** The card that wins the hand most often; among equal ones, the weakest, to keep the good ones. */
    private fun bestCard(h:Truco.Hand,me:Int,cards:List<Card>,random:Random):Action{
        val m=h.muestra
        val ranked=cards.sortedBy{m.power(it)}
        if(ranked.size==1)return Action.Play(ranked[0])
        var best=ranked[0];var bestRate=-1.0
        for(c in ranked){
            val rate=winChance(h,me,random,c)
            if(rate>bestRate+0.03){best=c;bestRate=rate}
        }
        return Action.Play(best)
    }

    /**
     * How often it wins the rest of the hand, playing first the card given (or the best one): the other one gets cards
     * it could have, from those not seen, and both play the simple way (beat the card on the table with the least card
     * that does, or else throw the least one; lead with the best one after the first round).
     */
    fun winChance(h:Truco.Hand,me:Int,random:Random,first:Card?=null):Double{
        val m=h.muestra;val them=1-me
        val seen=h.dealt[me]+m.card+h.rounds.mapNotNull{it[them]}
        val unknown=Truco.DECK.filter{it !in seen}
        val theirs=h.cards[them].size
        var wins=0
        repeat(SAMPLES){
            val opp=unknown.shuffled(random).take(theirs).toMutableList()
            val mine=h.cards[me].toMutableList()
            if(simulate(h,me,mine,opp,first)==me)wins++
        }
        return wins.toDouble()/SAMPLES
    }

    private fun simulate(h:Truco.Hand,me:Int,mine:MutableList<Card>,opp:MutableList<Card>,first:Card?):Int{
        val m=h.muestra;val them=1-me
        val winners=h.roundWinners.toMutableList()
        var table=h.rounds.last().copyOf()
        var turn=h.turn
        var forced=first
        fun pick(hand:MutableList<Card>,against:Card?,round:Int):Card{
            val sorted=hand.sortedBy{m.power(it)}
            if(against!=null)return sorted.firstOrNull{m.power(it)>m.power(against)}?:sorted.first()
            // Leading the first round, a middle card; after it, the best.
            return if(round==0&&sorted.size==3)sorted[1] else sorted.last()
        }
        while(true){
            val p=turn;val hand=if(p==me)mine else opp
            val against=table[1-p]
            val card=if(p==me&&forced!=null){val c=forced;forced=null;c} else pick(hand,against,winners.size)
            hand.remove(card);table[p]=card
            if(table[1-p]==null){turn=1-p;continue}
            val a=m.power(table[0]!!);val b=m.power(table[1]!!)
            val w=if(a==b)-1 else if(a>b)0 else 1
            winners.add(w)
            val decided=decide(winners,h.mano)
            if(decided>=0)return decided
            table=arrayOfNulls(2);turn=if(w>=0)w else h.mano
            if(mine.isEmpty()&&opp.isEmpty())return h.mano
        }
    }

    /** Same rules as Truco.Hand for who wins the hand from the rounds' winners (-1: not yet). */
    private fun decide(w:List<Int>,mano:Int):Int{
        if(w.count{it==0}>=2)return 0
        if(w.count{it==1}>=2)return 1
        if(w.size==2){if(w[0]==-1&&w[1]>=0)return w[1];if(w[0]>=0&&w[1]==-1)return w[0]}
        if(w.size==3)return if(w[2]>=0)w[2] else if(w[0]>=0)w[0] else mano
        return -1
    }
}
