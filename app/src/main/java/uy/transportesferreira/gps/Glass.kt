package uy.transportesferreira.gps
import android.graphics.*
import android.graphics.drawable.Drawable

/**
 * The room behind the glass (decision of 28/10/2026), the panel's: a photo already out of focus that fills the screen
 * without stretching, cut at 32 % from the left as the panel does. The screens slide over it and it stays put.
 */
class Room(private val photo:Bitmap):Drawable(){
 private val paint=Paint(Paint.FILTER_BITMAP_FLAG or Paint.DITHER_FLAG)
 private val part=Rect()
 override fun onBoundsChange(b:Rect){
  if(b.isEmpty)return
  val scale=maxOf(b.width().toFloat()/photo.width,b.height().toFloat()/photo.height)
  val w=(b.width()/scale).toInt().coerceIn(1,photo.width);val h=(b.height()/scale).toInt().coerceIn(1,photo.height)
  val x=((photo.width-w)*0.32f).toInt();val y=(photo.height-h)/2
  part.set(x,y,x+w,y+h)
 }
 override fun draw(c:Canvas){if(!part.isEmpty)c.drawBitmap(photo,part,bounds,paint)}
 override fun setAlpha(a:Int){paint.alpha=a;invalidateSelf()}
 override fun setColorFilter(f:ColorFilter?){paint.colorFilter=f;invalidateSelf()}
 @Deprecated("Deprecated in Java") override fun getOpacity()=if(paint.alpha==255)PixelFormat.OPAQUE else PixelFormat.TRANSLUCENT
}

/**
 * The chosen option of a row of options (the bar at the bottom, the switches of a list): a pill behind one of the slots
 * that slides to the next one chosen. at is the slot, fractional while it moves.
 */
class Slider(private val fill:Int,private val slots:Int,private val inset:Float,private val shade:Int=0):Drawable(){
 private val paint=Paint(Paint.ANTI_ALIAS_FLAG).apply{color=fill;if(shade!=0)setShadowLayer(inset*.6f,0f,inset*.2f,shade)}
 private val box=RectF()
 var at=0f;set(v){field=v;invalidateSelf()}
 override fun draw(c:Canvas){
  val b=bounds;if(b.isEmpty||slots<1)return
  val w=(b.width()-2*inset)/slots;val left=b.left+inset+at*w
  box.set(left,b.top+inset,left+w,b.bottom-inset)
  val r=box.height()/2;c.drawRoundRect(box,r,r,paint)
 }
 override fun setAlpha(a:Int){paint.alpha=a;invalidateSelf()}
 override fun setColorFilter(f:ColorFilter?){paint.colorFilter=f;invalidateSelf()}
 @Deprecated("Deprecated in Java") override fun getOpacity()=PixelFormat.TRANSLUCENT
}
