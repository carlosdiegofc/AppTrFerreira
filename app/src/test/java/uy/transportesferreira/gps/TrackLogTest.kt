package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test
class TrackLogTest {
    @Test fun roundTripsPoints(){
        val text=TrackLog.line(-34.9,-56.1,0,1000L)+TrackLog.line(-34.91,-56.11,1,2000L)
        val (points,used)=TrackLog.parse(text.toByteArray())
        assertEquals(2,points.size);assertEquals(text.length,used)
        assertEquals(-34.91,points[1][0],1e-9);assertEquals(1.0,points[1][2],0.0);assertEquals(2000.0,points[1][3],0.0)
    }
    @Test fun ignoresHalfWrittenLastLineAndReadsItLater(){
        val first=TrackLog.line(-34.9,-56.1,0,1000L);val partial="-34.91,-56.1"
        val (points,used)=TrackLog.parse((first+partial).toByteArray())
        assertEquals(1,points.size);assertEquals(first.length,used)
        val rest=partial+",0,2000\n"
        assertEquals(1,TrackLog.parse(rest.toByteArray()).first.size)
    }
    @Test fun skipsCorruptLinesAndEmptyInput(){
        val (points,_)=TrackLog.parse("basura\n-34.9,-56.1,0,1000\n1,2,3\nx,y,z,w\n".toByteArray())
        assertEquals(1,points.size)
        assertEquals(0,TrackLog.parse(ByteArray(0)).first.size);assertEquals(0,TrackLog.parse("sin salto".toByteArray()).second)
    }
}
