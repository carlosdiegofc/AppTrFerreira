package uy.transportesferreira.gps

/**
 * The chess pieces, drawn for the app: no font glyphs (each phone draws them its own way) and no third-party art. Each
 * piece is a few shapes in a 100 × 100 box, painted back to front with the colour of the piece and an outline; the
 * detail lines go on top in the outline colour, or a light one on the black pieces. The shapes are written as SVG path
 * data with absolute M, L, H, V, C and Z only (round corners and circles as curves), so steps() reads them without a
 * library and a browser draws the same thing for a review.
 */
object ChessArt {
    class Art(val parts:List<String>,val details:List<String> =emptyList())

    /** A step of a shape: M (move), L (line), C (curve: two control points and the end) or Z (close), absolute. */
    class Step(val op:Char,val xy:FloatArray)

    fun steps(d:String):List<Step>{
        val tokens=Regex("[MLHVCZ]|-?\\d*\\.?\\d+").findAll(d).map{it.value}.toList()
        val out=ArrayList<Step>();var i=0;var op=' ';var x=0f;var y=0f
        fun num():Float=tokens.getOrNull(i++)?.toFloatOrNull()?:throw IllegalArgumentException("A number is missing in: $d")
        while(i<tokens.size){
            val t=tokens[i]
            if(t[0].isLetter()){op=t[0];i++;if(op=='Z')out.add(Step('Z',FloatArray(0)));continue}
            when(op){
                'M'->{x=num();y=num();out.add(Step('M',floatArrayOf(x,y)));op='L'}
                'L'->{x=num();y=num();out.add(Step('L',floatArrayOf(x,y)))}
                'H'->{x=num();out.add(Step('L',floatArrayOf(x,y)))}
                'V'->{y=num();out.add(Step('L',floatArrayOf(x,y)))}
                'C'->{val a=FloatArray(6){num()};x=a[4];y=a[5];out.add(Step('C',a))}
                else->throw IllegalArgumentException("Unknown step $op in: $d")
            }
        }
        return out
    }

    private fun n(v:Double)=Math.round(v*100)/100.0
    private fun f(v:Double)=n(v).let{if(it==Math.floor(it))it.toInt().toString() else it.toString()}
    /** How far the control points of a quarter circle go: the usual cubic approximation. */
    private const val K=0.5523

    /** A rectangle with rounded corners. */
    fun box(x1:Double,y1:Double,x2:Double,y2:Double,r:Double=0.0):String{
        if(r<=0)return "M${f(x1)},${f(y1)} H${f(x2)} V${f(y2)} H${f(x1)} Z"
        val k=r*K
        return "M${f(x1+r)},${f(y1)} H${f(x2-r)} C${f(x2-r+k)},${f(y1)} ${f(x2)},${f(y1+r-k)} ${f(x2)},${f(y1+r)} V${f(y2-r)} "+
            "C${f(x2)},${f(y2-r+k)} ${f(x2-r+k)},${f(y2)} ${f(x2-r)},${f(y2)} H${f(x1+r)} C${f(x1+r-k)},${f(y2)} ${f(x1)},${f(y2-r+k)} ${f(x1)},${f(y2-r)} "+
            "V${f(y1+r)} C${f(x1)},${f(y1+r-k)} ${f(x1+r-k)},${f(y1)} ${f(x1+r)},${f(y1)} Z"
    }
    fun circle(cx:Double,cy:Double,r:Double):String{
        val k=r*K
        return "M${f(cx-r)},${f(cy)} C${f(cx-r)},${f(cy-k)} ${f(cx-k)},${f(cy-r)} ${f(cx)},${f(cy-r)} C${f(cx+k)},${f(cy-r)} ${f(cx+r)},${f(cy-k)} ${f(cx+r)},${f(cy)} "+
            "C${f(cx+r)},${f(cy+k)} ${f(cx+k)},${f(cy+r)} ${f(cx)},${f(cy+r)} C${f(cx-k)},${f(cy+r)} ${f(cx-r)},${f(cy+k)} ${f(cx-r)},${f(cy)} Z"
    }

    private val BASE=box(20.0,77.0,80.0,88.0,4.0)

    val PIECES:Map<Int,Art> =mapOf(
        Chess.PAWN to Art(listOf(
            "M40,50 C40,61 33,69 27,77 H73 C67,69 60,61 60,50 Z",
            box(34.0,44.0,66.0,51.0,3.5),
            circle(50.0,30.0,12.5),
            BASE)),
        Chess.ROOK to Art(listOf(
            "M34,70 L36,38 H64 L66,70 Z",
            box(27.0,69.0,73.0,77.0,2.0),
            "M28,39 V14 H39 V21 H45 V14 H55 V21 H61 V14 H72 V39 Z",
            BASE),
            listOf("M29,31 H71")),
        Chess.KNIGHT to Art(listOf(
            "M33,77 C32,67 37,61 43,56 C38,54 33,56 28,58 C22,60 15,57 15,51 C15,46 21,40 27,34 C33,28 39,22 45,19 L47,9 L54,17 C68,21 79,35 79,52 C79,63 76,71 74,77 Z",
            BASE),
            listOf(circle(35.0,33.0,1.6),circle(21.5,51.0,1.0),"M56,23 C66,29 71,41 71,56")),
        Chess.BISHOP to Art(listOf(
            "M38,66 L32,77 H68 L62,66 Z",
            "M50,21 C62,30 68,44 63,56 C62,59 60,60 58,60 H42 C40,60 38,59 37,56 C32,44 38,30 50,21 Z",
            box(34.0,59.0,66.0,67.0,3.0),
            circle(50.0,15.5,5.5),
            BASE),
            listOf("M44,47 L57,34")),
        Chess.QUEEN to Art(listOf(
            "M30,70 L18,31 L32,52 L36,24 L46,50 L50,20 L54,50 L64,24 L68,52 L82,31 L70,70 Z",
            circle(18.0,29.0,5.0),circle(36.0,22.0,5.0),circle(50.0,18.0,5.0),circle(64.0,22.0,5.0),circle(82.0,29.0,5.0),
            box(26.0,67.0,74.0,77.0,3.0),
            BASE)),
        Chess.KING to Art(listOf(
            "M47,7 H53 V15 H61 V21 H53 V48 H47 V21 H39 V15 H47 Z",
            "M30,70 C16,54 26,33 50,45 C74,33 84,54 70,70 Z",
            box(26.0,67.0,74.0,77.0,3.0),
            BASE),
            listOf("M50,47 V67")),
    )
}
