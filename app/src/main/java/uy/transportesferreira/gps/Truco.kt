package uy.transportesferreira.gps

import kotlin.random.Random

/**
 * Uruguayan truco for two (decisions of 21 and 22/10/2026): the muestra and its piezas, flor with contraflor, to 30
 * points (15 malas and 15 buenas). Pure Kotlin: the rules are unit tested, and the phone plays through the same actions
 * as the person. A hand is its deal plus the actions taken in it, so a game is saved as text and played again to load.
 */
object Truco {
    enum class Suit(val letter:Char){ESPADA('E'),BASTO('B'),ORO('O'),COPA('C')}

    data class Card(val rank:Int,val suit:Suit){
        override fun toString()="$rank${suit.letter}"
        companion object{
            fun parse(s:String):Card?{
                val suit=Suit.entries.firstOrNull{it.letter==s.lastOrNull()}?:return null
                val rank=s.dropLast(1).toIntOrNull()?.takeIf{it in RANKS}?:return null
                return Card(rank,suit)
            }
        }
    }
    val RANKS=listOf(1,2,3,4,5,6,7,10,11,12)
    val DECK=Suit.entries.flatMap{s->RANKS.map{Card(it,s)}}

    /** Points a game is played to; the first half are the malas and the second the buenas. */
    const val TARGET=30

    /**
     * What the muestra (the card turned up after the deal) decides. The 2, 4, 5, 11 and 10 of its suit are the piezas,
     * highest first; when the muestra itself is one of them, the 12 of its suit takes its place.
     */
    class Muestra(val card:Card){
        private val piezas=listOf(2,4,5,11,10)
        /** 0 for the highest pieza to 4 for the lowest; -1 for a card that is not a pieza. */
        fun pieza(c:Card):Int{
            if(c.suit!=card.suit||c==card)return -1
            val rank=if(c.rank==12&&card.rank in piezas)card.rank else c.rank
            return piezas.indexOf(rank)
        }
        fun isPieza(c:Card)=pieza(c)>=0

        /**
         * Strength for the truco: the higher card wins the round, equal ones tie (parda). Piezas, then the matas (1 of
         * espada, 1 of basto, 7 of espada, 7 of oro), then the 3s, 2s, the other 1s, 12s, 11s, 10s, the other 7s, 6s,
         * 5s and 4s.
         */
        fun power(c:Card):Int{
            val p=pieza(c);if(p>=0)return 100-p
            return when{
                c.rank==1&&c.suit==Suit.ESPADA->90
                c.rank==1&&c.suit==Suit.BASTO->89
                c.rank==7&&c.suit==Suit.ESPADA->88
                c.rank==7&&c.suit==Suit.ORO->87
                else->when(c.rank){3->80;2->79;1->78;12->77;11->76;10->75;7->74;6->73;5->72;else->71}
            }
        }

        /** Value for the envido and the flor: piezas 10, 9, 8, 7 and 7 (with the 20, 30 down to 27); 10, 11 and 12, nothing. */
        fun points(c:Card):Int{val p=pieza(c);return if(p>=0)intArrayOf(10,9,8,7,7)[p] else if(c.rank>=10)0 else c.rank}

        /** Flor: three cards of a suit, a pieza with two of a suit, or two or three piezas (a pieza goes with any suit). */
        fun hasFlor(hand:List<Card>):Boolean{
            if(hand.size!=3)return false
            val others=hand.filter{!isPieza(it)}
            return others.size<=1||others.map{it.suit}.distinct().size==1
        }
        fun flor(hand:List<Card>)=20+hand.sumOf{points(it)}

        /** The envido: two cards of a suit (a pieza goes with any card) count 20 and their values; else the best card. */
        fun envido(hand:List<Card>):Int{
            var best=hand.maxOf{if(isPieza(it))20+points(it) else points(it)}
            for(i in hand.indices)for(j in i+1 until hand.size){
                val a=hand[i];val b=hand[j]
                if(isPieza(a)||isPieza(b)||a.suit==b.suit)best=maxOf(best,20+points(a)+points(b))
            }
            return best
        }
    }

    /** What can be sung: the envido chain, the flor and its answers, and the truco and its raises. */
    enum class Call(val text:String){
        ENVIDO("Envido"),REAL_ENVIDO("Real envido"),FALTA_ENVIDO("Falta envido"),
        FLOR("Flor"),CONTRAFLOR("Contraflor"),CONTRAFLOR_AL_RESTO("Contraflor al resto"),
        TRUCO("Truco"),RETRUCO("Retruco"),VALE_CUATRO("Vale cuatro")
    }

    /** Something a player does. As text: the card ("7E"), the call's name, or Q (quiero), N (no quiero), A (me achico), M (mazo). */
    sealed class Action{
        data class Play(val card:Card):Action(){override fun toString()=card.toString()}
        data class Sing(val call:Call):Action(){override fun toString()=call.name}
        object Quiero:Action(){override fun toString()="Q"}
        object NoQuiero:Action(){override fun toString()="N"}
        object Achico:Action(){override fun toString()="A"}
        object Mazo:Action(){override fun toString()="M"}
        companion object{
            fun parse(s:String):Action?=when(s){
                "Q"->Quiero;"N"->NoQuiero;"A"->Achico;"M"->Mazo
                else->Call.entries.firstOrNull{it.name==s}?.let{Sing(it)}?:Card.parse(s)?.let{Play(it)}
            }
        }
    }

    /**
     * Something that happened in a hand, for the screen. SAID: what a player sang or answered (text). TANTOS: the points
     * of a player's envido or flor, shown when they are compared (value). POINTS: points a player won (value) and what
     * for (text: envido, flor or truco).
     */
    enum class Kind{SAID,TANTOS,POINTS}
    data class Event(val kind:Kind,val player:Int,val text:String="",val value:Int=0)

    private fun other(p:Int)=1-p

    /**
     * A hand: three cards each and the muestra; player 0 and player 1, and the mano plays first. act() takes the actions
     * in order and only those in actions(); points go to score as they are won, and the hand ends with winner set.
     */
    class Hand(val muestra:Muestra,dealt:List<List<Card>>,val mano:Int,private val score:IntArray){
        /** The three cards each one got: the envido and the flor count them even after they are played. */
        val dealt:List<List<Card>> =dealt.map{it.toList()}
        val cards=Array(2){this.dealt[it].toMutableList()}
        /** The rounds so far: the card of each player (null until played) and, when both played, who won it (-1: parda). */
        val rounds=ArrayList<Array<Card?>>().apply{add(arrayOfNulls(2))}
        val roundWinners=ArrayList<Int>()
        val events=ArrayList<Event>()
        val log=ArrayList<Pair<Int,Action>>()
        /** Who has to play a card when nobody waits for an answer. */
        var turn=mano;private set
        /** Who won the hand (the truco), once it is over. */
        var winner=-1;private set
        val over:Boolean get()=winner>=0||gameOver
        private val gameOver:Boolean get()=score.any{it>=TARGET}

        val hasFlor=BooleanArray(2){muestra.hasFlor(this.dealt[it])}
        private val sangFlor=BooleanArray(2)
        private var florDone=false
        private val envidoChain=ArrayList<Call>()
        private var envidoDone=false
        /** What the hand is worth: 1, or the truco level accepted. */
        var stake=1;private set
        /** Who made the last raise of the truco that was accepted: only the other one raises next. */
        private var raisedBy=-1

        private class Pending(val call:Call,val by:Int)
        private var flor:Pending?=null
        private var envido:Pending?=null
        private var truco:Pending?=null

        private fun played(p:Int)=cards[p].size<3
        private fun mustSingFlor(p:Int)=hasFlor[p]&&!sangFlor[p]&&!florDone&&!played(p)
        /**
         * The envido can be sung in the first round by a player who has not played and has no flor, if nobody sang flor
         * and no truco was accepted yet.
         */
        private fun envidoOpen(p:Int)=!envidoDone&&envidoChain.isEmpty()&&!florDone&&sangFlor.none{it}&&!hasFlor[p]&&!played(p)&&roundWinners.isEmpty()&&stake==1
        private fun falta()=TARGET-score.max()

        /** Who has to act now: the one who answers a call, or the one whose turn it is; -1 when the hand is over. */
        val actor:Int get()=when{
            over->-1
            flor!=null->other(flor!!.by)
            envido!=null->other(envido!!.by)
            truco!=null->other(truco!!.by)
            else->turn
        }

        /** What a player can do now; nothing when it is not their moment. */
        fun actions(p:Int):List<Action>{
            if(p!=actor)return emptyList()
            val f=flor;val e=envido;val t=truco
            // The flor comes first: the one who has it sings it before anything else (also to answer an envido or a truco).
            if(f==null&&mustSingFlor(p))return listOf(Action.Sing(Call.FLOR))
            if(f!=null)return when(f.call){
                Call.FLOR->listOf(Action.Sing(Call.CONTRAFLOR),Action.Sing(Call.CONTRAFLOR_AL_RESTO),Action.Achico)
                Call.CONTRAFLOR->listOf(Action.Quiero,Action.Sing(Call.CONTRAFLOR_AL_RESTO),Action.NoQuiero)
                else->listOf(Action.Quiero,Action.NoQuiero)
            }
            if(e!=null)return listOf(Action.Quiero,Action.NoQuiero)+envidoRaises().map{Action.Sing(it)}
            if(t!=null){
                val out=mutableListOf<Action>(Action.Quiero,Action.NoQuiero)
                nextTruco(t.call)?.let{out.add(Action.Sing(it))}
                // «El envido está primero»: the first truco can be answered with the envido.
                if(t.call==Call.TRUCO&&envidoOpen(p))out.addAll(listOf(Call.ENVIDO,Call.REAL_ENVIDO,Call.FALTA_ENVIDO).map{Action.Sing(it)})
                return out
            }
            val out=mutableListOf<Action>()
            cards[p].forEach{out.add(Action.Play(it))}
            if(envidoOpen(p))out.addAll(listOf(Call.ENVIDO,Call.REAL_ENVIDO,Call.FALTA_ENVIDO).map{Action.Sing(it)})
            if(stake<4&&raisedBy!=p)out.add(Action.Sing(levelCall(stake+1)))
            out.add(Action.Mazo)
            return out
        }
        private fun levelCall(level:Int)=when(level){2->Call.TRUCO;3->Call.RETRUCO;else->Call.VALE_CUATRO}
        private fun level(call:Call)=when(call){Call.TRUCO->2;Call.RETRUCO->3;else->4}
        private fun nextTruco(call:Call)=when(call){Call.TRUCO->Call.RETRUCO;Call.RETRUCO->Call.VALE_CUATRO;else->null}
        /** The call waiting for an answer, if any: the flor's first, then the envido, then the truco. */
        val asked:Call? get()=(flor?:envido?:truco)?.call
        /** The points the one ahead still needs: what the falta envido and the contraflor al resto are worth. */
        val faltaPoints:Int get()=falta()
        private fun envidoRaises():List<Call>{
            val last=envidoChain.lastOrNull()
            return when(last){
                Call.ENVIDO->if(envidoChain.count{it==Call.ENVIDO}<2)listOf(Call.ENVIDO,Call.REAL_ENVIDO,Call.FALTA_ENVIDO) else listOf(Call.REAL_ENVIDO,Call.FALTA_ENVIDO)
                Call.REAL_ENVIDO->listOf(Call.FALTA_ENVIDO)
                else->emptyList()
            }
        }
        private fun value(call:Call)=when(call){Call.ENVIDO->2;Call.REAL_ENVIDO->3;else->falta()}

        private fun award(p:Int,points:Int,what:String){
            if(points<=0)return
            score[p]+=points;events.add(Event(Kind.POINTS,p,what,points))
        }

        /** Does it, if it is allowed; false otherwise. */
        fun act(p:Int,a:Action):Boolean{
            if(a !in actions(p))return false
            log.add(p to a)
            when(a){
                is Action.Play->play(p,a.card)
                is Action.Sing->sing(p,a.call)
                Action.Quiero->quiero(p)
                Action.NoQuiero->noQuiero(p)
                Action.Achico->{say(p,"Con flor me achico");flor=null;florDone=true;award(other(p),4,"flor")}
                Action.Mazo->{say(p,"Me voy al mazo");end(other(p))}
            }
            return true
        }
        private fun say(p:Int,text:String)=events.add(Event(Kind.SAID,p,text))

        private fun sing(p:Int,call:Call){
            say(p,call.text)
            when(call){
                Call.FLOR->{
                    sangFlor[p]=true
                    // The flor takes the envido away.
                    envido=null;envidoChain.clear();envidoDone=true
                    if(hasFlor[other(p)]&&!sangFlor[other(p)]&&!played(other(p)))flor=Pending(Call.FLOR,p)
                    else{florDone=true;award(p,3,"flor")}
                }
                Call.CONTRAFLOR,Call.CONTRAFLOR_AL_RESTO->{if(flor?.call==Call.FLOR)sangFlor[p]=true;flor=Pending(call,p)}
                Call.ENVIDO,Call.REAL_ENVIDO,Call.FALTA_ENVIDO->{envidoChain.add(call);envido=Pending(call,p)}
                else->{
                    // A raise answering a truco accepts it first.
                    truco?.let{t->if(t.by==other(p)){stake=level(t.call);raisedBy=t.by}}
                    truco=Pending(call,p)
                }
            }
        }

        private fun quiero(p:Int){
            say(p,"Quiero")
            val f=flor;val e=envido;val t=truco
            when{
                f!=null->{
                    flor=null;florDone=true
                    val best=bestOf(muestra.flor(dealt[0]),muestra.flor(dealt[1]),Kind.TANTOS)
                    award(best,if(f.call==Call.CONTRAFLOR)6 else falta(),"flor")
                }
                e!=null->{
                    envido=null;envidoDone=true
                    val points=if(Call.FALTA_ENVIDO in envidoChain)falta() else envidoChain.sumOf{value(it)}
                    award(bestOf(muestra.envido(dealt[0]),muestra.envido(dealt[1]),Kind.TANTOS),points,"envido")
                }
                t!=null->{truco=null;stake=level(t.call);raisedBy=t.by}
            }
        }

        private fun noQuiero(p:Int){
            say(p,"No quiero")
            val f=flor;val e=envido;val t=truco
            when{
                f!=null->{flor=null;florDone=true;award(f.by,if(f.call==Call.CONTRAFLOR_AL_RESTO&&florSawContraflor)6 else 4,"flor")}
                e!=null->{
                    envido=null;envidoDone=true
                    // The one who sang last gets what was accepted before: 1 if nothing was.
                    val before=envidoChain.dropLast(1)
                    award(e.by,if(before.isEmpty())1 else before.sumOf{value(it)},"envido")
                }
                t!=null->{truco=null;end(t.by)}
            }
        }
        private val florSawContraflor:Boolean get()=log.any{(_,a)->a==Action.Sing(Call.CONTRAFLOR)}

        /** Shows both tantos (the mano's first) and gives the better one; a tie goes to the mano. */
        private fun bestOf(t0:Int,t1:Int,kind:Kind):Int{
            val tantos=intArrayOf(t0,t1)
            events.add(Event(kind,mano,value=tantos[mano]));events.add(Event(kind,other(mano),value=tantos[other(mano)]))
            return if(tantos[0]==tantos[1])mano else if(tantos[0]>tantos[1])0 else 1
        }

        private fun play(p:Int,card:Card){
            cards[p].remove(card)
            val round=rounds.last();round[p]=card
            val q=other(p)
            if(round[q]==null){turn=q;return}
            val a=muestra.power(round[0]!!);val b=muestra.power(round[1]!!)
            val w=if(a==b)-1 else if(a>b)0 else 1
            roundWinners.add(w)
            val decided=handWinner()
            if(decided>=0){end(decided);return}
            rounds.add(arrayOfNulls(2))
            turn=if(w>=0)w else mano
        }

        /** Two rounds win; a parda goes to whoever wins the next one, or to the first round's winner; three pardas, to the mano. */
        private fun handWinner():Int{
            val w=roundWinners
            if(w.count{it==0}>=2)return 0
            if(w.count{it==1}>=2)return 1
            if(w.size==2){
                if(w[0]==-1&&w[1]>=0)return w[1]
                if(w[0]>=0&&w[1]==-1)return w[0]
            }
            if(w.size==3)return if(w[2]>=0)w[2] else if(w[0]>=0)w[0] else mano
            return -1
        }

        private fun end(w:Int){
            winner=w;flor=null;envido=null;truco=null
            award(w,stake,"truco")
        }
    }

    /** A game to 30: the scores, who deals, and the hand being played, saved as text as its deals and actions. */
    class Match(private val random:Random=Random.Default){
        val score=IntArray(2)
        var dealer=random.nextInt(2);private set
        lateinit var hand:Hand;private set
        /** Who reached 30 first, or -1. */
        val winner:Int get()=if(score[0]>=TARGET)0 else if(score[1]>=TARGET)1 else -1

        fun deal(cards:List<Card> =DECK.shuffled(random)){
            hand=Hand(Muestra(cards[6]),listOf(cards.subList(0,3),cards.subList(3,6)),other(dealer),score)
        }
        /** The next hand, dealt by the other player, once this one is over and nobody reached 30. */
        fun next():Boolean{
            if(!hand.over||winner>=0)return false
            dealer=other(dealer);deal();return true
        }

        /** The scores as they were before this hand, the dealer, the hand's cards and the actions taken in it. */
        fun save():String{
            val before=IntArray(2){score[it]-hand.events.filter{e->e.kind==Kind.POINTS&&e.player==it}.sumOf{e->e.value}}
            val cards=hand.dealt[0]+hand.dealt[1]+hand.muestra.card
            return "1|${before[0]}|${before[1]}|$dealer|${cards.joinToString(" ")}|${hand.log.joinToString(" "){(p,a)->"$p:$a"}}"
        }
        companion object{
            fun load(text:String?,random:Random=Random.Default):Match?{
                val parts=text?.split('|')?:return null
                if(parts.size!=6||parts[0]!="1")return null
                val m=Match(random)
                m.score[0]=parts[1].toIntOrNull()?:return null;m.score[1]=parts[2].toIntOrNull()?:return null
                m.dealer=parts[3].toIntOrNull()?.takeIf{it in 0..1}?:return null
                val cards=parts[4].split(' ').map{Card.parse(it)?:return null}
                if(cards.size!=7||cards.distinct().size!=7)return null
                m.deal(cards)
                for(t in parts[5].split(' ').filter{it.isNotBlank()}){
                    val p=t.substringBefore(':').toIntOrNull()?:return null
                    val a=Action.parse(t.substringAfter(':'))?:return null
                    if(!m.hand.act(p,a))return null
                }
                return m
            }
        }
    }
}
