package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test

/** When the games open (with the truck stopped) and how a chess game is kept and taken back. */
class GamesTest {
    private fun ChessMatch.play(vararg moves:String)=moves.forEach{assertTrue(it,game.play(Chess.Move.parse(it)!!))}

    @Test fun theGamesOpenWithTheTruckStopped(){
        val now=1_000_000L
        assertEquals(Parked.State.NO_TRIP,Parked.state(false,false,null,null,now))
        assertEquals(Parked.State.PAUSED,Parked.state(true,true,now-600_000,80.0,now))
        assertEquals(Parked.State.STOPPED,Parked.state(true,false,now-3_000,2.5,now))
        assertEquals(Parked.State.MOVING,Parked.state(true,false,now-3_000,5.0,now))
        // Without a recent reading with its speed nobody knows whether the truck is stopped.
        assertEquals(Parked.State.NO_SIGNAL,Parked.state(true,false,now-Parked.FRESH_MS-1,0.0,now))
        assertEquals(Parked.State.NO_SIGNAL,Parked.state(true,false,now-3_000,null,now))
        assertEquals(Parked.State.NO_SIGNAL,Parked.state(true,false,null,0.0,now))
        assertEquals(listOf(true,true,true,false,false),Parked.State.entries.map{it.allowed})
    }
    @Test fun aGameIsKeptAsText(){
        val m=ChessMatch(true,ChessAi.Level.HARD,false,Chess.Game());m.play("e2e4")
        val back=ChessMatch.load(m.save())!!
        assertTrue(back.vsPhone);assertEquals(ChessAi.Level.HARD,back.level);assertFalse(back.humanWhite)
        // Playing black, the board starts turned.
        assertTrue(back.flipped);assertEquals(m.game.position.fen,back.game.position.fen)
        assertNull(ChessMatch.load(null));assertNull(ChessMatch.load(""))
        assertNull(ChessMatch.load("2|phone|EASY|w|0|"+Chess.Game().save()))
        assertNull(ChessMatch.load("1|phone|NINGUNO|w|0|"+Chess.Game().save()))
    }
    @Test fun undoTakesBackThePersonsMoveWithThePhonesAnswer(){
        val m=ChessMatch(true,ChessAi.Level.EASY,true,Chess.Game())
        assertFalse(m.canUndo);assertFalse(m.phoneToMove)
        m.play("e2e4");assertTrue(m.phoneToMove)
        m.play("e7e5","g1f3","b8c6")
        assertTrue(m.undo());assertEquals(2,m.game.moves.size);assertFalse(m.phoneToMove)
        // Playing black, the phone's first move is not one to take back.
        val black=ChessMatch(true,ChessAi.Level.EASY,false,Chess.Game())
        assertTrue(black.phoneToMove);black.play("d2d4")
        assertFalse(black.canUndo);assertFalse(black.undo())
        // Before the phone answers, only the person's move.
        black.play("d7d5");assertTrue(black.phoneToMove)
        assertTrue(black.undo());assertEquals(1,black.game.moves.size);assertFalse(black.phoneToMove)
        // Between two people, one move at a time, and the phone never plays.
        val two=ChessMatch(false,ChessAi.Level.EASY,true,Chess.Game());two.play("e2e4","e7e5")
        assertFalse(two.phoneToMove);assertTrue(two.undo());assertEquals(1,two.game.moves.size)
    }
}
