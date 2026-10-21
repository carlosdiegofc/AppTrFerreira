package uy.transportesferreira.gps

import kotlin.random.Random

/**
 * The phone's side of a chess game: an alpha-beta search over material and the usual piece-square tables, following
 * the captures to the end so it does not leave pieces hanging. Easy looks one move ahead and picks among the moves that
 * lose little, and now and then looks only at its own move, as a beginner does; medium looks two moves ahead; hard
 * looks as far as it gets in about two seconds. Pure Kotlin, unit tested.
 */
object ChessAi {
    /** careless: the share of moves, in percent, played looking only at the move itself. */
    enum class Level(val depth:Int,val millis:Long,val slack:Int,val careless:Int){EASY(1,800,120,35),MEDIUM(2,1500,30,0),HARD(6,2000,0,0)}

    private const val MATE=100_000
    private val VALUE=intArrayOf(0,100,320,330,500,900,0)

    // The usual tables, from white's side with rank 8 first, in hundredths of a pawn.
    private val PAWN_T=intArrayOf(0,0,0,0,0,0,0,0, 50,50,50,50,50,50,50,50, 10,10,20,30,30,20,10,10, 5,5,10,25,25,10,5,5, 0,0,0,20,20,0,0,0, 5,-5,-10,0,0,-10,-5,5, 5,10,10,-20,-20,10,10,5, 0,0,0,0,0,0,0,0)
    private val KNIGHT_T=intArrayOf(-50,-40,-30,-30,-30,-30,-40,-50, -40,-20,0,0,0,0,-20,-40, -30,0,10,15,15,10,0,-30, -30,5,15,20,20,15,5,-30, -30,0,15,20,20,15,0,-30, -30,5,10,15,15,10,5,-30, -40,-20,0,5,5,0,-20,-40, -50,-40,-30,-30,-30,-30,-40,-50)
    private val BISHOP_T=intArrayOf(-20,-10,-10,-10,-10,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,10,10,5,0,-10, -10,5,5,10,10,5,5,-10, -10,0,10,10,10,10,0,-10, -10,10,10,10,10,10,10,-10, -10,5,0,0,0,0,5,-10, -20,-10,-10,-10,-10,-10,-10,-20)
    private val ROOK_T=intArrayOf(0,0,0,0,0,0,0,0, 5,10,10,10,10,10,10,5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, -5,0,0,0,0,0,0,-5, 0,0,0,5,5,0,0,0)
    private val QUEEN_T=intArrayOf(-20,-10,-10,-5,-5,-10,-10,-20, -10,0,0,0,0,0,0,-10, -10,0,5,5,5,5,0,-10, -5,0,5,5,5,5,0,-5, 0,0,5,5,5,5,0,-5, -10,5,5,5,5,5,0,-10, -10,0,5,0,0,0,0,-10, -20,-10,-10,-5,-5,-10,-10,-20)
    private val KING_T=intArrayOf(-30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -30,-40,-40,-50,-50,-40,-40,-30, -20,-30,-30,-40,-40,-30,-30,-20, -10,-20,-20,-20,-20,-20,-20,-10, 20,20,0,0,0,0,20,20, 20,30,10,0,0,10,30,20)
    // With little material left the king comes to the centre.
    private val KING_END_T=intArrayOf(-50,-40,-30,-20,-20,-30,-40,-50, -30,-20,-10,0,0,-10,-20,-30, -30,-10,20,30,30,20,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,30,40,40,30,-10,-30, -30,-10,20,30,30,20,-10,-30, -30,-30,0,0,0,0,-30,-30, -50,-30,-30,-30,-30,-30,-30,-50)

    /** The position for the side to move: positive when it is better. */
    fun evaluate(p:Chess.Position):Int{
        var queens=0;var heavy=0
        for(sq in 0 until 64){val k=kotlin.math.abs(p[sq]);if(k==Chess.QUEEN)queens++;if(k in Chess.KNIGHT..Chess.QUEEN)heavy+=VALUE[k]}
        val endgame=queens==0||heavy<=2600
        var score=0
        for(sq in 0 until 64){
            val piece=p[sq];if(piece==0)continue
            val kind=kotlin.math.abs(piece);val white=piece>0
            val i=if(white)(7-Chess.rank(sq))*8+Chess.file(sq) else Chess.rank(sq)*8+Chess.file(sq)
            val table=when(kind){Chess.PAWN->PAWN_T;Chess.KNIGHT->KNIGHT_T;Chess.BISHOP->BISHOP_T;Chess.ROOK->ROOK_T;Chess.QUEEN->QUEEN_T;else->if(endgame)KING_END_T else KING_T}
            val v=VALUE[kind]+table[i]
            score+=if(white)v else -v
        }
        return if(p.whiteToMove)score else -score
    }

    /** Captures first, the most valuable piece taken by the least valuable one; promotions too. */
    private fun ordered(p:Chess.Position,moves:List<Chess.Move>,first:Chess.Move?=null)=moves.sortedByDescending{m->
        when{
            m==first->1_000_000
            m.promo!=0->900_000+m.promo
            p.isCapture(m)->10*VALUE[kotlin.math.abs(p[m.to]).let{if(it==0)Chess.PAWN else it}]-VALUE[kotlin.math.abs(p[m.from])]+100_000
            else->0
        }
    }

    /** A look at the position after a move without the replies: only whether it is mate. For the side to move. */
    private fun glance(p:Chess.Position)=if(p.moves().isEmpty())(if(p.inCheck)-MATE+1 else 0) else evaluate(p)

    private class Stop:RuntimeException()

    private class Search(val deadline:Long){
        var nodes=0
        private fun tick(){if((++nodes and 1023)==0&&System.currentTimeMillis()>deadline)throw Stop()}

        fun negamax(p:Chess.Position,depth:Int,alpha:Int,beta:Int,ply:Int):Int{
            tick()
            if(p.halfmove>=100||p.insufficientMaterial())return 0
            if(depth<=0)return quiesce(p,alpha,beta,ply)
            val moves=p.moves()
            if(moves.isEmpty())return if(p.inCheck)-MATE+ply else 0
            var a=alpha;var best=-MATE*2
            for(m in ordered(p,moves)){
                val s=-negamax(p.after(m),depth-1,-beta,-a,ply+1)
                if(s>best)best=s
                if(s>a)a=s
                if(a>=beta)break
            }
            return best
        }

        /** Only captures (and every move out of a check) until the position is quiet. */
        fun quiesce(p:Chess.Position,alpha:Int,beta:Int,ply:Int):Int{
            tick()
            val check=p.inCheck
            val moves=if(check)p.moves() else p.moves(true)
            if(check&&moves.isEmpty())return -MATE+ply
            var a=alpha
            if(!check){val stand=evaluate(p);if(stand>=beta)return stand;if(stand>a)a=stand}
            for(m in ordered(p,moves)){
                val s=-quiesce(p.after(m),-beta,-a,ply+1)
                if(s>=beta)return s
                if(s>a)a=s
            }
            return a
        }
    }

    /**
     * The move the phone plays, or null when the game is over. Easy and medium score every move and pick at random among
     * those within their slack of the best one; a careless move of easy takes a guarded piece or leaves one hanging if
     * the move looks good. Hard deepens the search while time is left and keeps the best move of the last depth it
     * finished.
     */
    fun choose(p:Chess.Position,level:Level,random:Random=Random.Default):Chess.Move?{
        val moves=p.moves();if(moves.isEmpty())return null
        if(moves.size==1)return moves[0]
        val search=Search(System.currentTimeMillis()+level.millis)
        if(level!=Level.HARD){
            val careless=random.nextInt(100)<level.careless
            val scored=ArrayList<Pair<Chess.Move,Int>>()
            try{for(m in ordered(p,moves)){val next=p.after(m);scored.add(m to -(if(careless)glance(next) else search.negamax(next,level.depth-1,-MATE*2,MATE*2,1)))}}catch(_:Stop){}
            if(scored.isEmpty())return moves[random.nextInt(moves.size)]
            val best=scored.maxOf{it.second}
            // A mate is never given away on purpose.
            val slack=if(best>MATE/2)0 else level.slack
            val near=scored.filter{it.second>=best-slack}
            return near[random.nextInt(near.size)].first
        }
        var chosen=ordered(p,moves).first()
        for(depth in 1..level.depth){
            try{
                var best=-MATE*2;var bestMove=chosen;var a=-MATE*2
                for(m in ordered(p,moves,chosen)){
                    val s=-search.negamax(p.after(m),depth-1,-MATE*2,-a,1)
                    if(s>best){best=s;bestMove=m}
                    if(s>a)a=s
                }
                chosen=bestMove
                if(best>MATE/2)break
            }catch(_:Stop){break}
        }
        return chosen
    }
}
