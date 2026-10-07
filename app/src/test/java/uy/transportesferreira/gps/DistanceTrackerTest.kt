package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test
class DistanceTrackerTest {
 @Test fun countsValidMovementButNotPauseGap(){val d=DistanceTracker();val now=100000L;assertEquals(0.0,d.add(DistanceTracker.Fix(-34.0,-56.0,3.0,now),now),.01);val meters=d.add(DistanceTracker.Fix(-34.001,-56.0,3.0,now+10000),now+10000);assertTrue(meters in 110.0..112.0);d.reset();assertEquals(0.0,d.add(DistanceTracker.Fix(-35.0,-56.0,3.0,now+20000),now+20000),.01)}
 @Test fun rejectsNoiseStaleAndImpossibleJumps(){val d=DistanceTracker();val n=100000L;d.add(DistanceTracker.Fix(-34.0,-56.0,5.0,n),n);assertEquals(0.0,d.add(DistanceTracker.Fix(-34.000001,-56.0,5.0,n+5000),n+5000),.01);assertEquals(0.0,d.add(DistanceTracker.Fix(-35.0,-56.0,5.0,n+10000),n+10000),.01);assertEquals(0.0,d.add(DistanceTracker.Fix(-34.0,-56.0,200.0,n+15000),n+15000),.01);assertEquals(0.0,d.add(DistanceTracker.Fix(-34.0,-56.0,5.0,1),n+20000),.01)}
 private fun fix(lat:Double,time:Long,acc:Double=3.0)=DistanceTracker.Fix(lat,-56.0,acc,time)
 @Test fun accumulatesAlongARoute(){val d=DistanceTracker();var total=0.0;listOf(0L,10000L,20000L).forEachIndexed{i,t->total+=d.add(fix(-34.0-0.001*i,100000+t),100000+t)};assertTrue(total in 220.0..225.0)}
 @Test fun longGapRestartsTheAnchorInsteadOfCountingTheJump(){val d=DistanceTracker();val n=100000L;d.add(fix(-34.0,n),n);assertEquals(0.0,d.add(fix(-34.5,n+100000),n+100000),.01);assertTrue(d.add(fix(-34.501,n+110000),n+110000) in 110.0..112.0)}
 @Test fun poorAccuracyFixIsIgnoredAndKeepsTheAnchor(){val d=DistanceTracker();val n=100000L;d.add(fix(-34.0,n),n);assertEquals(0.0,d.add(fix(-34.001,n+10000,50.1),n+10000),.01);assertTrue(d.add(fix(-34.002,n+20000),n+20000) in 220.0..225.0)}
 @Test fun acceptsAccuracyExactlyAtTheLimit(){val d=DistanceTracker();val n=100000L;d.add(fix(-34.0,n,50.0),n);assertTrue(d.add(fix(-34.001,n+10000,50.0),n+10000) in 110.0..112.0)}
 @Test fun impossibleSpeedIsDiscardedAndKeepsTheAnchor(){val d=DistanceTracker();val n=100000L;d.add(fix(-34.0,n),n);assertEquals(0.0,d.add(fix(-34.001,n+2000),n+2000),.01);assertFalse(d.accepted);assertTrue(d.add(fix(-34.002,n+12000),n+12000) in 220.0..225.0);assertTrue(d.accepted)}
 @Test fun rejectsInvalidCoordinatesAndFutureFixes(){val d=DistanceTracker();val n=100000L;assertEquals(0.0,d.add(fix(Double.NaN,n),n),0.0);assertEquals(0.0,d.add(fix(95.0,n),n),0.0);d.add(fix(-34.0,n),n);assertEquals(0.0,d.add(fix(-34.001,n+60000),n+10000),.01)}
 @Test fun impossibleFixDoesNotBecomeMapPositionOrResetAnchor(){
 val d=DistanceTracker();val n=100000L
 d.add(DistanceTracker.Fix(-34.0,-56.0,3.0,n),n);assertTrue(d.accepted)
 d.add(DistanceTracker.Fix(-35.0,-56.0,3.0,n+5000),n+5000);assertFalse(d.accepted)
 val meters=d.add(DistanceTracker.Fix(-34.001,-56.0,3.0,n+10000),n+10000)
 assertTrue(d.accepted);assertTrue(meters in 110.0..112.0)
 }
}
