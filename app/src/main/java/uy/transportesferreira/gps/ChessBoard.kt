package uy.transportesferreira.gps

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.*
import android.view.MotionEvent
import android.view.View

/**
 * The chess board on screen: the position with its last move, the chosen piece and where it can go, and a king in check
 * in red. A tap on a square goes to onSquare. Square and highlight colours are the ones of the review in light and dark;
 * the pieces are ChessArt.
 */
class ChessBoard(context:Context,dark:Boolean):View(context){
    var position:Chess.Position=Chess.Position.start();set(v){field=v;invalidate()}
    var lastMove:Chess.Move?=null;set(v){field=v;invalidate()}
    var selected=-1;set(v){field=v;invalidate()}
    var targets:Set<Int> =emptySet();set(v){field=v;invalidate()}
    /** With black at the bottom. */
    var flipped=false;set(v){field=v;invalidate()}
    var onSquare:((Int)->Unit)?=null

    private val lightSquare=(if(dark)0xFFC3CEDC else 0xFFDEE5EE).toInt()
    private val darkSquare=(if(dark)0xFF6F86A6 else 0xFF8AA0BD).toInt()
    private val paint=Paint(Paint.ANTI_ALIAS_FLAG)
    private val stroke=Paint(Paint.ANTI_ALIAS_FLAG).apply{style=Paint.Style.STROKE;strokeJoin=Paint.Join.ROUND;strokeCap=Paint.Cap.ROUND}
    private val label=Paint(Paint.ANTI_ALIAS_FLAG).apply{typeface=Typeface.DEFAULT_BOLD}
    private fun path(d:String)=Path().apply{for(s in ChessArt.steps(d))when(s.op){'M'->moveTo(s.xy[0],s.xy[1]);'L'->lineTo(s.xy[0],s.xy[1]);'C'->cubicTo(s.xy[0],s.xy[1],s.xy[2],s.xy[3],s.xy[4],s.xy[5]);'Z'->close()}}
    private val art=ChessArt.PIECES.mapValues{(_,a)->a.parts.map{path(it)} to a.details.map{path(it)}}
    private var scaled:Map<Int,Pair<List<Path>,List<Path>>> =emptyMap();private var scaledTo=0f

    /** Square: the screen decides its size (MainActivity.chess) and the board takes the smaller side it is given. */
    override fun onMeasure(widthSpec:Int,heightSpec:Int){
        val w=MeasureSpec.getSize(widthSpec)
        val h=if(MeasureSpec.getMode(heightSpec)==MeasureSpec.UNSPECIFIED)w else MeasureSpec.getSize(heightSpec)
        val size=minOf(w,h);setMeasuredDimension(size,size)
    }

    /** The square under a column and a row of the screen, counted from the top left. */
    private fun squareAt(col:Int,row:Int)=if(flipped)row*8+(7-col) else (7-row)*8+col

    override fun onDraw(c:Canvas){
        val s=width/8f
        if(s!=scaledTo){val m=Matrix().apply{setScale(s/100f,s/100f)};scaled=art.mapValues{(_,v)->v.first.map{p->Path().also{p.transform(m,it)}} to v.second.map{p->Path().also{p.transform(m,it)}}};scaledTo=s}
        val check=if(position.inCheck)position.king(position.whiteToMove) else -1
        label.textSize=s*0.22f
        for(row in 0..7)for(col in 0..7){
            val sq=squareAt(col,row);val x=col*s;val y=row*s
            val light=(Chess.file(sq)+Chess.rank(sq))%2==1
            paint.shader=null;paint.style=Paint.Style.FILL
            paint.color=if(light)lightSquare else darkSquare;c.drawRect(x,y,x+s,y+s,paint)
            lastMove?.let{if(sq==it.from||sq==it.to){paint.color=0x7AD6C43A;c.drawRect(x,y,x+s,y+s,paint)}}
            if(sq==selected){paint.color=0xC7D6C43A.toInt();c.drawRect(x,y,x+s,y+s,paint)}
            if(sq==check){paint.shader=RadialGradient(x+s/2,y+s/2,s*0.58f,intArrayOf(0xFFE83034.toInt(),0xBFE83034.toInt(),0x00E83034),floatArrayOf(0f,0.42f,1f),Shader.TileMode.CLAMP);c.drawRect(x,y,x+s,y+s,paint);paint.shader=null}
            // The coordinates in the colour of the other squares: ranks down the left side, files along the bottom.
            label.color=if(light)darkSquare else lightSquare
            if(col==0){label.textAlign=Paint.Align.LEFT;c.drawText("${Chess.rank(sq)+1}",x+s*0.06f,y+s*0.24f,label)}
            if(row==7){label.textAlign=Paint.Align.RIGHT;c.drawText("${'a'+Chess.file(sq)}",x+s*0.94f,y+s*0.95f,label)}
            val piece=position[sq]
            if(piece!=0)drawPiece(c,piece,x,y,s)
            // A dot where the chosen piece can go; a ring where it takes (en passant too).
            if(sq in targets){
                paint.color=0x4D121C2E
                val takes=piece!=0||(sq==position.ep&&selected>=0&&kotlin.math.abs(position[selected])==Chess.PAWN)
                if(takes){paint.style=Paint.Style.STROKE;paint.strokeWidth=s*0.09f;c.drawCircle(x+s/2,y+s/2,s/2-s*0.06f,paint)}
                else c.drawCircle(x+s/2,y+s/2,s*0.16f,paint)
            }
        }
    }

    private fun drawPiece(c:Canvas,piece:Int,x:Float,y:Float,s:Float){
        val (parts,details)=scaled[kotlin.math.abs(piece)]?:return
        val white=piece>0
        c.save();c.translate(x,y)
        paint.style=Paint.Style.FILL;stroke.strokeWidth=s*0.034f;stroke.color=0xFF1B1F27.toInt()
        for(p in parts){paint.color=if(white)Color.WHITE else 0xFF2B303A.toInt();c.drawPath(p,paint);c.drawPath(p,stroke)}
        stroke.strokeWidth=s*0.03f;stroke.color=if(white)0xFF1B1F27.toInt() else 0xFFE3E8EF.toInt()
        for(p in details)c.drawPath(p,stroke)
        c.restore()
    }

    @SuppressLint("ClickableViewAccessibility")
    override fun onTouchEvent(e:MotionEvent):Boolean{
        if(!isEnabled)return false
        when(e.actionMasked){
            MotionEvent.ACTION_DOWN->return true
            MotionEvent.ACTION_UP->{
                val s=width/8f;val col=(e.x/s).toInt();val row=(e.y/s).toInt()
                if(col in 0..7&&row in 0..7){performClick();onSquare?.invoke(squareAt(col,row))}
                return true
            }
        }
        return super.onTouchEvent(e)
    }
    override fun performClick():Boolean=super.performClick()
}
