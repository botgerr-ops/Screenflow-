package nl.screenflow.player;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class SyncGateTest {
  @Test public void duplicateCallbacksNeverRunConcurrentlyAndQueueOneFollowUp() throws Exception {
    ExecutorService executor=Executors.newSingleThreadExecutor();SyncGate gate=new SyncGate();
    AtomicInteger calls=new AtomicInteger(),active=new AtomicInteger(),maxActive=new AtomicInteger();
    CountDownLatch firstStarted=new CountDownLatch(1),releaseFirst=new CountDownLatch(1),finished=new CountDownLatch(2);
    Runnable sync=()->{int running=active.incrementAndGet();maxActive.accumulateAndGet(running,Math::max);int call=calls.incrementAndGet();if(call==1){firstStarted.countDown();try{releaseFirst.await(2,TimeUnit.SECONDS);}catch(InterruptedException e){Thread.currentThread().interrupt();}}active.decrementAndGet();finished.countDown();};
    gate.request(executor,sync);assertTrue(firstStarted.await(2,TimeUnit.SECONDS));
    gate.request(executor,sync);gate.request(executor,sync);releaseFirst.countDown();
    assertTrue(finished.await(2,TimeUnit.SECONDS));assertEquals(2,calls.get());assertEquals(1,maxActive.get());
    executor.shutdown();assertTrue(executor.awaitTermination(2,TimeUnit.SECONDS));assertFalse(gate.isRunning());
  }
}
