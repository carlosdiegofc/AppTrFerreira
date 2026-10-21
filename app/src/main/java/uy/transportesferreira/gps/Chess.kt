package uy.transportesferreira.gps

/**
 * Chess for the waits (decision of 21/10/2026): every rule (castling, en passant, promotion, check, mate, stalemate and
 * the draws by material, fifty moves and threefold repetition) and a rival of three levels. Pure Kotlin, without
 * Android, so the rules are unit tested against the standard move counts (perft).
 *
 * Squares go from 0 (a1) to 63 (h8), rank by rank. Pieces are numbers: positive for white, negative for black.
 */
object Chess {
    const val PAWN=1;const val KNIGHT=2;const val BISHOP=3;const val ROOK=4;const val QUEEN=5;const val KING=6
    private const val WK=1;private const val WQ=2;private const val BK=4;private const val BQ=8
    const val START_FEN="rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
    private val KNIGHT_JUMPS=arrayOf(intArrayOf(1,2),intArrayOf(2,1),intArrayOf(2,-1),intArrayOf(1,-2),intArrayOf(-1,-2),intArrayOf(-2,-1),intArrayOf(-2,1),intArrayOf(-1,2))
    private val KING_STEPS=arrayOf(intArrayOf(1,0),intArrayOf(1,1),intArrayOf(0,1),intArrayOf(-1,1),intArrayOf(-1,0),intArrayOf(-1,-1),intArrayOf(0,-1),intArrayOf(1,-1))
    private val DIAGONALS=arrayOf(intArrayOf(1,1),intArrayOf(-1,1),intArrayOf(-1,-1),intArrayOf(1,-1))
    private val LINES=arrayOf(intArrayOf(1,0),intArrayOf(0,1),intArrayOf(-1,0),intArrayOf(0,-1))

    fun file(sq:Int)=sq and 7
    fun rank(sq:Int)=sq shr 3
    private fun at(f:Int,r:Int)=if(f in 0..7&&r in 0..7)r*8+f else -1
    fun square(name:String):Int=if(name.length==2&&name[0] in 'a'..'h'&&name[1] in '1'..'8')at(name[0]-'a',name[1]-'1') else -1
    fun name(sq:Int)="${'a'+file(sq)}${'1'+rank(sq)}"

    /** A move; promo is the piece a pawn becomes (KNIGHT..QUEEN), 0 otherwise. As text it is UCI: "e2e4", "e7e8q". */
    data class Move(val from:Int,val to:Int,val promo:Int=0){
        val uci:String get()=name(from)+name(to)+when(promo){KNIGHT->"n";BISHOP->"b";ROOK->"r";QUEEN->"q";else->""}
        companion object{
            fun parse(s:String):Move?{
                if(s.length!=4&&s.length!=5)return null
                val f=square(s.substring(0,2));val t=square(s.substring(2,4));if(f<0||t<0)return null
                val p=if(s.length==5)when(s[4]){'n'->KNIGHT;'b'->BISHOP;'r'->ROOK;'q'->QUEEN;else->return null} else 0
                return Move(f,t,p)
            }
        }
    }

    /** A position: the board, who moves, castling rights, the en passant square (-1 without one) and the move clocks. */
    class Position(val board:IntArray,val whiteToMove:Boolean,val castling:Int,val ep:Int,val halfmove:Int,val fullmove:Int){
        operator fun get(sq:Int)=board[sq]
        private val side get()=if(whiteToMove)1 else -1

        /** Whether a piece of that colour attacks the square. */
        fun attacked(sq:Int,byWhite:Boolean):Boolean{
            val s=if(byWhite)1 else -1;val f=file(sq);val r=rank(sq)
            // A pawn attacks from one rank behind, diagonally.
            for(df in intArrayOf(-1,1)){val p=at(f+df,r-s);if(p>=0&&board[p]==s*PAWN)return true}
            for(j in KNIGHT_JUMPS){val p=at(f+j[0],r+j[1]);if(p>=0&&board[p]==s*KNIGHT)return true}
            for(k in KING_STEPS){val p=at(f+k[0],r+k[1]);if(p>=0&&board[p]==s*KING)return true}
            for(d in DIAGONALS)if(slides(f,r,d,s*BISHOP,s*QUEEN))return true
            for(d in LINES)if(slides(f,r,d,s*ROOK,s*QUEEN))return true
            return false
        }
        private fun slides(f:Int,r:Int,d:IntArray,a:Int,b:Int):Boolean{
            var x=f+d[0];var y=r+d[1]
            while(x in 0..7&&y in 0..7){val p=board[y*8+x];if(p!=0)return p==a||p==b;x+=d[0];y+=d[1]}
            return false
        }
        fun king(white:Boolean)=board.indexOf(if(white)KING else -KING)
        val inCheck:Boolean get()=king(whiteToMove).let{it>=0&&attacked(it,!whiteToMove)}

        /** The moves of the side to move that follow the rules but may leave its own king attacked. */
        fun pseudoMoves(capturesOnly:Boolean=false):List<Move>{
            val out=ArrayList<Move>(48);val s=side
            for(sq in 0 until 64){
                val p=board[sq];if(p==0||(p>0)!=whiteToMove)continue
                val f=file(sq);val r=rank(sq)
                when(p*s){
                    PAWN->{
                        val last=if(s>0)7 else 0;val home=if(s>0)1 else 6
                        fun add(to:Int){if(rank(to)==last)for(q in intArrayOf(QUEEN,ROOK,BISHOP,KNIGHT))out.add(Move(sq,to,q)) else out.add(Move(sq,to))}
                        val one=at(f,r+s)
                        if(one>=0&&board[one]==0&&(!capturesOnly||rank(one)==last)){add(one);val two=at(f,r+2*s);if(r==home&&two>=0&&board[two]==0&&!capturesOnly)out.add(Move(sq,two))}
                        for(df in intArrayOf(-1,1)){val t=at(f+df,r+s);if(t>=0&&(board[t]*s<0||t==ep))add(t)}
                    }
                    KNIGHT->for(j in KNIGHT_JUMPS){val t=at(f+j[0],r+j[1]);if(t>=0&&board[t]*s<=0&&(!capturesOnly||board[t]!=0))out.add(Move(sq,t))}
                    BISHOP->for(d in DIAGONALS)ray(sq,d,out,capturesOnly)
                    ROOK->for(d in LINES)ray(sq,d,out,capturesOnly)
                    QUEEN->{for(d in DIAGONALS)ray(sq,d,out,capturesOnly);for(d in LINES)ray(sq,d,out,capturesOnly)}
                    KING->{
                        for(k in KING_STEPS){val t=at(f+k[0],r+k[1]);if(t>=0&&board[t]*s<=0&&(!capturesOnly||board[t]!=0))out.add(Move(sq,t))}
                        if(!capturesOnly)castles(sq,out)
                    }
                }
            }
            return out
        }
        private fun ray(sq:Int,d:IntArray,out:MutableList<Move>,capturesOnly:Boolean){
            var x=file(sq)+d[0];var y=rank(sq)+d[1]
            while(x in 0..7&&y in 0..7){
                val t=y*8+x;val p=board[t]
                if(p==0){if(!capturesOnly)out.add(Move(sq,t))}else{if(p*side<0)out.add(Move(sq,t));return}
                x+=d[0];y+=d[1]
            }
        }
        /** Castling: the right kept, the squares between empty, and the king neither in check nor passing an attacked square. */
        private fun castles(sq:Int,out:MutableList<Move>){
            val home=if(whiteToMove)4 else 60;if(sq!=home||attacked(sq,!whiteToMove))return
            val (short,long)=if(whiteToMove)WK to WQ else BK to BQ
            if(castling and short!=0&&board[sq+1]==0&&board[sq+2]==0&&board[sq+3]==side*ROOK&&!attacked(sq+1,!whiteToMove)&&!attacked(sq+2,!whiteToMove))out.add(Move(sq,sq+2))
            if(castling and long!=0&&board[sq-1]==0&&board[sq-2]==0&&board[sq-3]==0&&board[sq-4]==side*ROOK&&!attacked(sq-1,!whiteToMove)&&!attacked(sq-2,!whiteToMove))out.add(Move(sq,sq-2))
        }

        /** The position after a move (taken as given: check it is legal first). */
        fun after(m:Move):Position{
            val b=board.copyOf();val p=b[m.from];val s=side;val kind=p*s;val captured=b[m.to]
            b[m.to]=if(m.promo!=0)s*m.promo else p;b[m.from]=0
            // En passant takes the pawn beside, behind the square it lands on.
            if(kind==PAWN&&m.to==ep&&captured==0)b[m.to-8*s]=0
            // Castling moves the rook over the king.
            if(kind==KING&&m.to-m.from==2){b[m.from+1]=b[m.from+3];b[m.from+3]=0}
            if(kind==KING&&m.from-m.to==2){b[m.from-1]=b[m.from-4];b[m.from-4]=0}
            var c=castling
            fun lose(sq:Int){when(sq){4->c=c and (WK or WQ).inv();60->c=c and (BK or BQ).inv();7->c=c and WK.inv();0->c=c and WQ.inv();63->c=c and BK.inv();56->c=c and BQ.inv()}}
            lose(m.from);lose(m.to)
            val nextEp=if(kind==PAWN&&kotlin.math.abs(m.to-m.from)==16)(m.from+m.to)/2 else -1
            val reset=kind==PAWN||captured!=0
            return Position(b,!whiteToMove,c,nextEp,if(reset)0 else halfmove+1,if(whiteToMove)fullmove else fullmove+1)
        }

        /** The legal moves: the pseudo moves that do not leave the mover's king attacked. */
        fun moves(capturesOnly:Boolean=false):List<Move> =pseudoMoves(capturesOnly).filter{m->after(m).let{n->val k=n.king(whiteToMove);k<0||!n.attacked(k,!whiteToMove)}}
        /** The legal moves, worked out once: a position does not change. */
        val legal:List<Move> get()=legalOnce?:moves().also{legalOnce=it}
        private var legalOnce:List<Move>?=null

        fun isCapture(m:Move)=board[m.to]!=0||(kotlin.math.abs(board[m.from])==PAWN&&m.to==ep)

        /** Neither side can mate: kings alone, or with one knight or bishop, or with bishops all on squares of one colour. */
        fun insufficientMaterial():Boolean{
            var minors=0;var knights=0;val bishopColours=HashSet<Int>()
            for(sq in 0 until 64){when(kotlin.math.abs(board[sq])){PAWN,ROOK,QUEEN->return false;KNIGHT->{minors++;knights++};BISHOP->{minors++;bishopColours.add((file(sq)+rank(sq)) and 1)}}}
            return minors<=1||(knights==0&&bishopColours.size==1)
        }

        /** What makes two positions the same for repetition: pieces, who moves, castling, and an en passant capture that can be made. */
        val key:String get()=keyOnce?:run{
            val epKey=if(ep>=0&&pseudoMoves(true).any{kotlin.math.abs(board[it.from])==PAWN&&it.to==ep})ep else -1
            (board.joinToString(",")+"|$whiteToMove|$castling|$epKey").also{keyOnce=it}
        }
        private var keyOnce:String?=null

        val fen:String get(){
            val rows=(7 downTo 0).joinToString("/"){r->
                val sb=StringBuilder();var empty=0
                for(f in 0..7){val p=board[r*8+f];if(p==0)empty++ else{if(empty>0){sb.append(empty);empty=0};sb.append(" pnbrqk"[kotlin.math.abs(p)].let{if(p>0)it.uppercaseChar() else it})}}
                if(empty>0)sb.append(empty);sb.toString()}
            val c=buildString{if(castling and WK!=0)append('K');if(castling and WQ!=0)append('Q');if(castling and BK!=0)append('k');if(castling and BQ!=0)append('q')}.ifEmpty{"-"}
            return "$rows ${if(whiteToMove)"w" else "b"} $c ${if(ep<0)"-" else name(ep)} $halfmove $fullmove"
        }

        companion object{
            fun fromFen(fen:String):Position?{
                val parts=fen.trim().split(Regex("\\s+"));if(parts.size<4)return null
                val rows=parts[0].split('/');if(rows.size!=8)return null
                val b=IntArray(64)
                for((i,row) in rows.withIndex()){
                    var f=0;val r=7-i
                    for(ch in row){
                        if(ch.isDigit()){f+=ch-'0';continue}
                        val kind=" pnbrqk".indexOf(ch.lowercaseChar());if(kind<=0||f>7)return null
                        b[r*8+f]=if(ch.isUpperCase())kind else -kind;f++
                    }
                    if(f!=8)return null
                }
                val c=parts[2].fold(0){acc,ch->acc or when(ch){'K'->WK;'Q'->WQ;'k'->BK;'q'->BQ;else->0}}
                return Position(b,parts[1]=="w",c,if(parts[3]=="-")-1 else square(parts[3]),parts.getOrNull(4)?.toIntOrNull()?:0,parts.getOrNull(5)?.toIntOrNull()?:1)
            }
            fun start()=fromFen(START_FEN)!!
        }
    }

    /** How a game stands. */
    enum class Outcome{PLAYING,WHITE_MATES,BLACK_MATES,STALEMATE,MATERIAL,FIFTY_MOVES,REPETITION}

    /** A game from the start: its moves (to undo and to save) and the positions it went through (for repetition). */
    class Game(val start:Position=Position.start()){
        private val played=ArrayList<Move>();private val positions=arrayListOf(start)
        val moves:List<Move> get()=played
        val position:Position get()=positions.last()
        val lastMove:Move? get()=played.lastOrNull()
        /** Plays a move if it is legal; a pawn reaching the last rank without a piece chosen becomes a queen. */
        fun play(m:Move):Boolean{
            if(outcome!=Outcome.PLAYING)return false
            val legal=position.legal;val move=legal.firstOrNull{it==m}?:legal.firstOrNull{it.from==m.from&&it.to==m.to&&m.promo==0&&it.promo==QUEEN}?:return false
            played.add(move);positions.add(position.after(move));return true
        }
        fun undo():Boolean{if(played.isEmpty())return false;played.removeAt(played.size-1);positions.removeAt(positions.size-1);return true}
        val outcome:Outcome get(){
            val p=position
            if(p.legal.isEmpty())return if(p.inCheck)(if(p.whiteToMove)Outcome.BLACK_MATES else Outcome.WHITE_MATES) else Outcome.STALEMATE
            if(p.insufficientMaterial())return Outcome.MATERIAL
            if(p.halfmove>=100)return Outcome.FIFTY_MOVES
            val k=p.key;if(positions.count{it.key==k}>=3)return Outcome.REPETITION
            return Outcome.PLAYING
        }
        /** The game as text, to keep it on the phone: the starting position and the moves. */
        fun save()=start.fen+";"+played.joinToString(" "){it.uci}
        companion object{
            fun load(text:String):Game?{
                val cut=text.indexOf(';');if(cut<0)return null
                val g=Game(Position.fromFen(text.substring(0,cut))?:return null)
                for(t in text.substring(cut+1).split(' ').filter{it.isNotBlank()}){val m=Move.parse(t)?:return null;if(!g.play(m))return null}
                return g
            }
        }
    }

    /** Counts the move sequences of a depth: the standard check of a move generator. */
    fun perft(p:Position,depth:Int):Long=if(depth==0)1 else p.moves().let{ms->if(depth==1)ms.size.toLong() else ms.sumOf{perft(p.after(it),depth-1)}}
}
