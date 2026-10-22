package uy.transportesferreira.gps

import uy.transportesferreira.gps.ChessArt.box
import uy.transportesferreira.gps.ChessArt.circle

/**
 * The truco cards, drawn for the app like the chess pieces (ChessArt): no font glyphs and no third-party art. Each of the
 * four Spanish suits is a few shapes in a 100 × 100 box, painted back to front with their colours and outlined in the
 * suit's ink; the detail lines go on top in the same ink. Espada blue, basto green, oro gold and copa red, as in the deck.
 */
object TrucoArt {
    class Shape(val d:String,val fill:Long)
    /** ink: the outline, the details and the card's number. */
    class Art(val shapes:List<Shape>,val details:List<String>,val ink:Long)

    private const val GOLD=0xFFE9AE24
    private const val GOLD_LIGHT=0xFFF8D766

    /** Lines from the centre out, every turn/count, between two radii. */
    private fun rays(count:Int,from:Double,to:Double,turn:Double=0.0)=(0 until count).map{
        val a=Math.PI*2*it/count+turn;val c=Math.cos(a);val s=Math.sin(a)
        "M${f(50+from*c)},${f(50+from*s)} L${f(50+to*c)},${f(50+to*s)}"
    }
    private fun f(v:Double)=(Math.round(v*100)/100.0).let{if(it==Math.floor(it))it.toInt().toString() else it.toString()}
    /** The same shape turned around the centre of the box, clockwise. */
    private fun turned(d:String,degrees:Double):String{
        val a=Math.toRadians(degrees);val c=Math.cos(a);val s=Math.sin(a)
        return ChessArt.steps(d).joinToString(" "){st->
            if(st.op=='Z')"Z" else st.op+st.xy.toList().chunked(2).joinToString(" "){(x,y)->"${f(50+(x-50)*c-(y-50)*s)},${f(50+(x-50)*s+(y-50)*c)}"}
        }
    }
    /** The basto: a club with knots, head up and to the right like in the deck. */
    private fun basto(d:String)=turned(d,35.0)

    /** A five-pointed star, for the piezas. */
    fun star(cx:Double,cy:Double,r:Double):String{
        val points=(0 until 10).map{val a=-Math.PI/2+Math.PI*it/5;val d=if(it%2==0)r else r*0.45;"${f(cx+d*Math.cos(a))},${f(cy+d*Math.sin(a))}"}
        return "M"+points.first()+" "+points.drop(1).joinToString(" "){"L$it"}+" Z"
    }

    val SUITS:Map<Truco.Suit,Art> =mapOf(
        Truco.Suit.ORO to Art(listOf(
            Shape(circle(50.0,50.0,42.0),GOLD),
            Shape(circle(50.0,50.0,29.0),GOLD_LIGHT),
            Shape(circle(50.0,50.0,10.0),GOLD)),
            rays(8,14.0,24.0)+rays(16,33.0,38.0,Math.PI/16),0xFF7A5200),
        Truco.Suit.COPA to Art(listOf(
            Shape("M18,20 H82 C82,44 68,58 50,58 C32,58 18,44 18,20 Z",0xFFD33F3F),
            Shape(box(14.0,13.0,86.0,22.0,4.0),GOLD),
            Shape("M45,57 H55 V81 H45 Z",0xFFD33F3F),
            Shape(circle(50.0,68.0,7.5),GOLD),
            Shape("M27,92 C27,84 37,79 50,79 C63,79 73,84 73,92 Z",0xFFD33F3F),
            Shape(box(24.0,89.0,76.0,95.0,3.0),GOLD)),
            listOf("M23,31 C40,36 60,36 77,31"),0xFF6E1A1A),
        Truco.Suit.ESPADA to Art(listOf(
            Shape("M50,4 L58,17 V65 H42 V17 Z",0xFF3E7BD6),
            Shape(circle(20.0,67.0,6.0),GOLD),
            Shape(circle(80.0,67.0,6.0),GOLD),
            Shape(box(20.0,63.0,80.0,71.0,4.0),GOLD),
            Shape(box(44.5,70.0,55.5,88.0,2.0),0xFF2D5FB0),
            Shape(circle(50.0,91.0,6.5),GOLD)),
            listOf("M50,19 V60","M44.5,76 H55.5","M44.5,82 H55.5"),0xFF142F66),
        Truco.Suit.BASTO to Art(listOf(
            Shape(basto(circle(64.0,29.0,5.5)),0xFF3F9150),
            Shape(basto(circle(36.5,43.0,5.0)),0xFF3F9150),
            Shape(basto(circle(60.5,55.0,4.0)),0xFF3F9150),
            Shape(basto("M37,23 C37,7 63,7 63,23 C63,40 58,56 57,74 C57,82 57,87 56,90 C55,96 45,96 44,90 C43,87 43,82 43,74 C42,56 37,40 37,23 Z"),0xFF3F9150),
            Shape(basto(box(41.5,80.0,58.5,85.0,2.0)),0xFF2C6B3A)),
            listOf(basto("M46,17 C45,36 47,56 48,76"),basto("M55,15 C55,28 54,40 53,52")),0xFF133F22),
    )
}
