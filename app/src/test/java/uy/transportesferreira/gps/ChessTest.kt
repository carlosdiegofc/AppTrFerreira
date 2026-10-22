package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test
import kotlin.random.Random

/** The rules against the standard move counts (perft) of the usual test positions, the ends of a game and the rival. */
class ChessTest {
    private fun fen(s:String)=Chess.Position.fromFen(s)!!
    private fun game(vararg moves:String)=Chess.Game().also{g->moves.forEach{assertTrue(it,g.play(Chess.Move.parse(it)!!))}}

    @Test fun theStartingPositionHasTheKnownMoveCounts(){
        val p=Chess.Position.start()
        assertEquals(listOf(20L,400L,8902L,197281L),(1..4).map{Chess.perft(p,it)})
    }
    @Test fun castlingEnPassantAndPromotionsCountRight(){
        // «Kiwipete», position 3, 4 and 5 of the usual perft suite: castling through checks, pins, en passant, promotions.
        assertEquals(listOf(48L,2039L,97862L),(1..3).map{Chess.perft(fen("r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1"),it)})
        assertEquals(listOf(14L,191L,2812L,43238L),(1..4).map{Chess.perft(fen("8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1"),it)})
        assertEquals(listOf(6L,264L,9467L),(1..3).map{Chess.perft(fen("r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1"),it)})
        assertEquals(listOf(44L,1486L,62379L),(1..3).map{Chess.perft(fen("rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8"),it)})
    }
    @Test fun fenAndMovesAsText(){
        assertEquals(Chess.START_FEN,Chess.Position.start().fen)
        val after=game("e2e4").position
        assertEquals("rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",after.fen)
        assertEquals("e7e8q",Chess.Move.parse("e7e8q")!!.uci)
        assertNull(Chess.Move.parse("e9e4"));assertNull(Chess.Move.parse("e7e8k"))
    }
    @Test fun aPawnGoesTwoSquaresOnlyFromHomeAndIsTakenEnPassantOnlyAtOnce(){
        val g=game("e2e4","a7a6","e4e5","d7d5")
        assertTrue(g.play(Chess.Move.parse("e5d6")!!))
        assertEquals(0,g.position[Chess.square("d5")])
        val late=game("e2e4","a7a6","e4e5","d7d5","h2h3","h7h6")
        assertFalse(late.play(Chess.Move.parse("e5d6")!!))
    }
    @Test fun castlingNeedsTheRightsAndNoCheckOnTheWay(){
        val p=fen("r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1")
        assertTrue(p.moves().any{it.uci=="e1g1"});assertTrue(p.moves().any{it.uci=="e1c1"})
        val castled=p.after(Chess.Move.parse("e1g1")!!)
        assertEquals(Chess.ROOK,castled[Chess.square("f1")]);assertEquals(0,castled[Chess.square("h1")])
        // A rook on f8 attacks f1: no castling short through it; long is still fine.
        val attacked=fen("5r1k/8/8/8/8/8/8/R3K2R w KQ - 0 1")
        assertFalse(attacked.moves().any{it.uci=="e1g1"});assertTrue(attacked.moves().any{it.uci=="e1c1"})
        // A rook taken in its corner takes its castling with it.
        val taken=fen("r3k2r/8/8/8/8/8/6b1/R3K2R b KQkq - 0 1").after(Chess.Move.parse("g2h1")!!)
        assertFalse(taken.moves().any{it.uci=="e1g1"});assertEquals("Qkq",taken.fen.split(' ')[2])
    }
    @Test fun aPawnOnTheLastRankChoosesItsPiece(){
        val g=Chess.Game(fen("8/4P3/8/8/8/8/k7/4K3 w - - 0 1"))
        assertEquals(4,g.position.moves().count{it.from==Chess.square("e7")})
        assertTrue(g.play(Chess.Move.parse("e7e8n")!!))
        assertEquals(Chess.KNIGHT,g.position[Chess.square("e8")])
        // Without a piece chosen, a queen.
        val q=Chess.Game(fen("8/4P3/8/8/8/8/k7/4K3 w - - 0 1"));assertTrue(q.play(Chess.Move(Chess.square("e7"),Chess.square("e8"))))
        assertEquals(Chess.QUEEN,q.position[Chess.square("e8")])
    }
    @Test fun theEndsOfAGame(){
        assertEquals(Chess.Outcome.BLACK_MATES,game("f2f3","e7e5","g2g4","d8h4").outcome)
        assertEquals(Chess.Outcome.STALEMATE,Chess.Game(fen("7k/5Q2/6K1/8/8/8/8/8 b - - 0 1")).outcome)
        assertEquals(Chess.Outcome.MATERIAL,Chess.Game(fen("8/8/4k3/8/8/3NK3/8/8 w - - 0 1")).outcome)
        assertEquals(Chess.Outcome.MATERIAL,Chess.Game(fen("8/8/2b1k3/8/8/4KB2/8/8 w - - 0 1")).outcome)
        assertEquals(Chess.Outcome.PLAYING,Chess.Game(fen("8/8/1b2k3/8/8/4KB2/8/8 w - - 0 1")).outcome)
        val fifty=Chess.Game(fen("8/8/4k3/8/8/4K3/4R3/8 w - - 99 80"));assertTrue(fifty.play(Chess.Move.parse("e2a2")!!))
        assertEquals(Chess.Outcome.FIFTY_MOVES,fifty.outcome)
        // The knights go out and back twice: the starting position comes a third time.
        val again=game("g1f3","g8f6","f3g1","f6g8","g1f3","g8f6","f3g1","f6g8")
        assertEquals(Chess.Outcome.REPETITION,again.outcome)
        assertFalse(again.play(Chess.Move.parse("e2e4")!!))
    }
    @Test fun aGameIsSavedAndTakenBackAMoveAtATime(){
        val g=game("e2e4","e7e5","g1f3")
        val back=Chess.Game.load(g.save())!!
        assertEquals(g.position.fen,back.position.fen);assertEquals(3,back.moves.size)
        assertTrue(back.undo());assertEquals("rnbqkbnr/pppp1ppp/8/4p3/4P3/8/PPPP1PPP/RNBQKBNR w KQkq e6 0 2",back.position.fen)
        assertNull(Chess.Game.load("no es una partida"));assertNull(Chess.Game.load(Chess.START_FEN+";e2e5"))
    }
    @Test fun thePhoneMatesWhenItCanAtEveryLevel(){
        val backRank=fen("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 0 1")
        for(level in ChessAi.Level.entries)assertEquals(level.name,"d1d8",ChessAi.choose(backRank,level,Random(7))?.uci)
    }
    @Test fun thePhoneDoesNotLeaveItsQueenToAPawn(){
        val p=fen("4k3/8/8/3p4/4Q3/8/8/4K3 w - - 0 1")
        for(level in listOf(ChessAi.Level.MEDIUM,ChessAi.Level.HARD)){
            val m=ChessAi.choose(p,level,Random(3))!!
            val next=p.after(m);val queen=next.board.indexOf(Chess.QUEEN)
            assertTrue("${level.name} ${m.uci}",queen>=0&&!next.attacked(queen,false))
        }
        assertNull(ChessAi.choose(game("f2f3","e7e5","g2g4","d8h4").position,ChessAi.Level.EASY))
    }
    @Test fun aMateOnTheHundredthHalfMoveIsStillAMate(){
        // The mate is the hundredth half-move without a capture or a pawn move: it counts as a mate, not as a draw.
        val p=fen("6k1/5ppp/8/8/8/8/5PPP/3R2K1 w - - 99 80")
        for(level in ChessAi.Level.entries)assertEquals(level.name,"d1d8",ChessAi.choose(p,level,Random(7))?.uci)
        val g=Chess.Game(p);assertTrue(g.play(Chess.Move.parse("d1d8")!!));assertEquals(Chess.Outcome.WHITE_MATES,g.outcome)
    }
    @Test fun thePhoneDoesNotWalkAWonGameBackIntoARepetition(){
        // The queen takes the loose rook, unless the position after it was already in the game: then it counts as a draw.
        val p=fen("6k1/8/8/3r4/8/8/8/3Q2K1 w - - 0 1")
        val seen=mapOf(p.after(Chess.Move.parse("d1d5")!!).key to 1)
        for(level in listOf(ChessAi.Level.MEDIUM,ChessAi.Level.HARD)){
            assertEquals(level.name,"d1d5",ChessAi.choose(p,level,Random(5))?.uci)
            assertNotEquals(level.name,"d1d5",ChessAi.choose(p,level,Random(5),seen)?.uci)
        }
        assertEquals(mapOf(Chess.Position.start().key to 2),game("g1f3","g8f6","f3g1","f6g8").seen().filterValues{it>1})
    }
    @Test fun aPinnedPawnLeavesNoEnPassantSquare(){
        // After e2-e4 the pawn on d4 could take on e3, but the rook on h4 pins it to its king: the same position as without it.
        assertEquals(fen("8/8/8/8/k2pP2R/8/8/4K3 b - e3 0 1").key,fen("8/8/8/8/k2pP2R/8/8/4K3 b - - 0 1").key)
        assertNotEquals(fen("8/8/8/8/k2pP3/8/8/4K2R b - e3 0 1").key,fen("8/8/8/8/k2pP3/8/8/4K2R b - - 0 1").key)
    }
    @Test fun thePiecesAreShapesThatRead(){
        val s=ChessArt.steps("M10,20 H30 V40 C30,45 25,50 20,50 Z")
        assertEquals("MLLCZ",s.joinToString(""){it.op.toString()})
        assertArrayEquals(floatArrayOf(30f,20f),s[1].xy,0f);assertArrayEquals(floatArrayOf(30f,40f),s[2].xy,0f)
        assertEquals(setOf(Chess.PAWN,Chess.KNIGHT,Chess.BISHOP,Chess.ROOK,Chess.QUEEN,Chess.KING),ChessArt.PIECES.keys)
        for((kind,art) in ChessArt.PIECES){
            for(d in art.parts){val steps=ChessArt.steps(d);assertEquals("$kind $d",'M',steps.first().op);assertEquals("$kind $d",'Z',steps.last().op)}
            for(d in art.parts+art.details)for(st in ChessArt.steps(d))for(v in st.xy)assertTrue("$kind $d",v in 0f..100f)
        }
        try{ChessArt.steps("M10");fail()}catch(_:IllegalArgumentException){}
    }
    @Test fun aCarelessMoveOfEasyMayTakeAGuardedPawn(){
        // Looking only at its own move, the queen takes the pawn and the other pawn takes the queen: a beginner's mistake.
        val p=fen("4k3/8/2p5/3p4/8/8/3Q4/4K3 w - - 0 1")
        val first=object:Random(){override fun nextBits(bitCount:Int)=0}
        assertEquals("d2d5",ChessAi.choose(p,ChessAi.Level.EASY,first)?.uci)
        assertNotEquals("d2d5",ChessAi.choose(p,ChessAi.Level.MEDIUM,first)?.uci)
    }
}
