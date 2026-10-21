package uy.transportesferreira.gps

/**
 * A chess game on the phone: against the phone at a level, or between two people passing the phone. It is kept as text
 * in the phone's preferences, one per account, and nothing of it leaves the phone.
 */
class ChessMatch(val vsPhone:Boolean,val level:ChessAi.Level,val humanWhite:Boolean,val game:Chess.Game,var flipped:Boolean=vsPhone&&!humanWhite){
    /** Whether the move at that index was white's. */
    private fun whiteMoved(i:Int)=(i%2==0)==game.start.whiteToMove
    val playing:Boolean get()=game.outcome==Chess.Outcome.PLAYING
    /** The phone has to answer. */
    val phoneToMove:Boolean get()=vsPhone&&playing&&game.position.whiteToMove!=humanWhite
    /** Against the phone, a move of the person to take back; between two people, any move. */
    val canUndo:Boolean get()=if(vsPhone)game.moves.indices.any{whiteMoved(it)==humanWhite} else game.moves.isNotEmpty()

    /** Takes back the last move; against the phone, the person's last move and the phone's answers after it. */
    fun undo():Boolean{
        if(!canUndo)return false
        if(!vsPhone)return game.undo()
        while(game.moves.isNotEmpty()){val mine=whiteMoved(game.moves.size-1)==humanWhite;game.undo();if(mine)break}
        return true
    }

    fun save()="1|${if(vsPhone)"phone" else "two"}|${level.name}|${if(humanWhite)"w" else "b"}|${if(flipped)1 else 0}|${game.save()}"

    companion object{
        fun load(text:String?):ChessMatch?{
            val p=text?.split('|',limit=6)?:return null
            if(p.size!=6||p[0]!="1")return null
            val level=ChessAi.Level.entries.firstOrNull{it.name==p[2]}?:return null
            val game=Chess.Game.load(p[5])?:return null
            return ChessMatch(p[1]=="phone",level,p[3]=="w",game,p[4]=="1")
        }
    }
}
