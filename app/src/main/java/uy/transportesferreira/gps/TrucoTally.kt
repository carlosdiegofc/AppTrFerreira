package uy.transportesferreira.gps

import android.content.Context
import android.graphics.Canvas
import android.graphics.Paint
import android.view.View

/**
 * The score the way it is kept at the table: the 30 points as six squares of five matches each (the four sides, then the
 * diagonal), the first three squares for the malas and the last three for the buenas. The screen gives the width.
 */
class TrucoTally(context:Context,private val ink:Int,private val empty:Int):View(context){
    var points=0;set(v){field=v.coerceIn(0,Truco.TARGET);invalidate()}

    private val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply{style=Paint.Style.STROKE;strokeCap=Paint.Cap.ROUND}
    // Six squares, a gap of 0.45 between them and 1.4 between the malas and the buenas, and 0.1 at each end, in squares.
    private fun side(w:Float)=w/9.4f

    override fun onMeasure(widthSpec:Int,heightSpec:Int){val w=MeasureSpec.getSize(widthSpec);setMeasuredDimension(w,Math.round(side(w.toFloat())*1.3f))}

    override fun onDraw(c:Canvas){
        val s=side(width.toFloat());val pad=s*0.15f;val y0=pad;val y1=pad+s
        val thick=maxOf(s*0.15f,2f);val thin=maxOf(s*0.06f,1f)
        for(g in 0 until 6){
            val x0=s*0.1f+g*s*1.45f+(if(g>=3)s*0.95f else 0f);val x1=x0+s
            val sticks=listOf(floatArrayOf(x0,y0,x0,y1),floatArrayOf(x0,y0,x1,y0),floatArrayOf(x1,y0,x1,y1),floatArrayOf(x0,y1,x1,y1),floatArrayOf(x0,y0,x1,y1))
            sticks.forEachIndexed{i,l->
                val on=g*5+i<points
                paint.color=if(on)ink else empty;paint.strokeWidth=if(on)thick else thin
                c.drawLine(l[0],l[1],l[2],l[3],paint)
            }
        }
        // Between the malas and the buenas.
        val mid=s*0.1f+3*s*1.45f+s*0.95f/2-s*0.45f/2
        paint.color=empty;paint.strokeWidth=thin;c.drawLine(mid,y0-pad*0.5f,mid,y1+pad*0.5f,paint)
    }
}
