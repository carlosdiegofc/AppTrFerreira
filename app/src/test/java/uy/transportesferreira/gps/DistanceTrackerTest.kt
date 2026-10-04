package uy.transportesferreira.gps
import org.junit.Assert.*
import org.junit.Test
class DistanceTrackerTest {
 @Test fun countsValidMovementButNotPauseGap(){val d=DistanceTracker();val now=100000L;assertEquals(0.0,d.add(DistanceTracker.Fix(-34.0,-56.0,3.0,now),now),.01);val meters=d.add(DistanceTracker.Fix(-34.001,-56.0,3.0,now+10000),now+10000);assertTrue(meters in 110.0..112.0);d.reset();assertEquals(0.0,d.add(DistanceTracker.Fix(-35.0,-56.0,3.0,now+20000),now+20000),.01)}
 @Test fun rejectsNoiseStaleAndImpossibleJumps(){val d=DistanceTracker();val n=100000L;d.add(DistanceTracker.Fix(-34.0,-56.0,5.0,n),n);assertEquals(0.0,d.add(DistanceTracker.Fix(-34.000001,-56.0,5.0,n+5000),n+5000),.01);assertEquals(0.0,d.add(DistanceTracker.Fix(-35.0,-56.0,5.0,n+10000),n+10000),.01);assertEquals(0.0,d.add(DistanceTracker.Fix(-34.0,-56.0,200.0,n+15000),n+15000),.01);assertEquals(0.0,d.add(DistanceTracker.Fix(-34.0,-56.0,5.0,1),n+20000),.01)}
}
