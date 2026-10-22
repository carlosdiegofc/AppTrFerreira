package uy.transportesferreira.gps

import android.content.Context
import android.graphics.*
import android.view.View

/**
 * A truco card on screen, drawn from TrucoArt in a 100 × 150 box: the face (the number and the suit in the corner, the suit
 * big in the middle, the figure's name, a star on a pieza), the back, or a dashed place for a card still to come. The
 * screen gives the width and the card takes one and a half times it in height.
 */
class TrucoCard(context:Context,private val dark:Boolean):View(context){
    /** null: the dashed place. */
    var card:Truco.Card?=null;set(v){field=v;invalidate()}
    var faceUp=true;set(v){field=v;invalidate()}
    var pieza=false;set(v){field=v;invalidate()}
    /** Chosen to be played: a blue edge. */
    var picked=false;set(v){field=v;invalidate()}

    override fun onMeasure(widthSpec:Int,heightSpec:Int){val w=MeasureSpec.getSize(widthSpec);setMeasuredDimension(w,Math.round(w*1.5f))}

    override fun onDraw(c:Canvas){
        val k=width/100f
        c.save();c.scale(k,k)
        val c0=card
        when{
            c0==null->{line.color=(if(dark)0xFF33415A else 0xFFC9D2DE).toInt();line.strokeWidth=3f;line.pathEffect=dash;c.drawRoundRect(2f,2f,98f,148f,9f,9f,line);line.pathEffect=null}
            !faceUp->back(c)
            else->face(c,c0)
        }
        c.restore()
    }

    private fun face(c:Canvas,card:Truco.Card){
        val art=ARTS.getValue(card.suit)
        fill.color=(if(dark)0xFFF1F4F8 else 0xFFFFFFFF).toInt();c.drawRoundRect(1f,1f,99f,149f,9f,9f,fill)
        line.color=(if(picked)0xFF1663E8 else 0xFFB8C3D3).toInt();line.strokeWidth=if(picked)4.5f else 1.5f;c.drawRoundRect(1f,1f,99f,149f,9f,9f,line)
        number.color=art.ink;c.drawText(card.rank.toString(),8f,31f,number)
        suit(c,art,6f,36f,22f);suit(c,art,18f,50f,64f)
        TrucoTalk.figure(card.rank)?.let{label.color=art.ink;c.drawText(it,50f,139f,label)}
        if(pieza){fill.color=0xFFE9AE24.toInt();c.drawPath(STAR,fill);line.color=0xFF7A5200.toInt();line.strokeWidth=2f;c.drawPath(STAR,line)}
    }

    private fun suit(c:Canvas,art:Drawn,x:Float,y:Float,size:Float){
        c.save();c.translate(x,y);c.scale(size/100f,size/100f)
        line.color=art.ink;line.strokeWidth=3.2f
        for((p,color) in art.shapes){fill.color=color;c.drawPath(p,fill);c.drawPath(p,line)}
        line.strokeWidth=3f;for(p in art.details)c.drawPath(p,line)
        c.restore()
    }

    private fun back(c:Canvas){
        fill.color=0xFF1B3A70.toInt();c.drawRoundRect(1f,1f,99f,149f,9f,9f,fill)
        line.color=0xFF0F2142.toInt();line.strokeWidth=1.5f;c.drawRoundRect(1f,1f,99f,149f,9f,9f,line)
        c.save();c.clipPath(INNER)
        line.color=0xFF2D5396.toInt();line.strokeWidth=3f
        var i=-150f;while(i<150f){c.drawLine(i,0f,i+150f,150f,line);c.drawLine(i+150f,0f,i,150f,line);i+=12f}
        c.restore()
        line.color=0xFFDCE6F5.toInt();line.strokeWidth=2.5f;c.drawPath(INNER,line)
    }

    private val fill=Paint(Paint.ANTI_ALIAS_FLAG)
    private val line=Paint(Paint.ANTI_ALIAS_FLAG).apply{style=Paint.Style.STROKE;strokeJoin=Paint.Join.ROUND;strokeCap=Paint.Cap.ROUND}
    private val number=Paint(Paint.ANTI_ALIAS_FLAG).apply{typeface=Typeface.DEFAULT_BOLD;textSize=30f}
    private val label=Paint(Paint.ANTI_ALIAS_FLAG).apply{textSize=14f;textAlign=Paint.Align.CENTER}
    private val dash=DashPathEffect(floatArrayOf(9f,7f),0f)

    private class Drawn(val shapes:List<Pair<Path,Int>>,val details:List<Path>,val ink:Int)
    companion object{
        private fun path(d:String)=Path().apply{for(s in ChessArt.steps(d))when(s.op){'M'->moveTo(s.xy[0],s.xy[1]);'L'->lineTo(s.xy[0],s.xy[1]);'C'->cubicTo(s.xy[0],s.xy[1],s.xy[2],s.xy[3],s.xy[4],s.xy[5]);'Z'->close()}}
        private val ARTS by lazy{TrucoArt.SUITS.mapValues{(_,a)->Drawn(a.shapes.map{path(it.d) to it.fill.toInt()},a.details.map{path(it)},a.ink.toInt())}}
        private val STAR by lazy{path(TrucoArt.star(86.0,14.0,8.0))}
        private val INNER by lazy{Path().apply{addRoundRect(8f,8f,92f,142f,5f,5f,Path.Direction.CW)}}
    }
}
