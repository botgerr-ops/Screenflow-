package nl.screenflow.player;

import java.util.concurrent.Executor;
import java.util.concurrent.atomic.AtomicBoolean;

/** Coalesces sync requests while guaranteeing one follow-up run when a request arrives in-flight. */
public final class SyncGate {
    private final AtomicBoolean running = new AtomicBoolean(false);
    private final AtomicBoolean requested = new AtomicBoolean(false);

    public void request(Executor executor, Runnable operation) {
        requested.set(true);
        startIfIdle(executor, operation);
    }

    public boolean isRunning() { return running.get(); }

    private void startIfIdle(Executor executor, Runnable operation) {
        if (!running.compareAndSet(false, true)) return;
        executor.execute(() -> {
            try {
                while (requested.getAndSet(false)) operation.run();
            } finally {
                running.set(false);
                if (requested.get()) startIfIdle(executor, operation);
            }
        });
    }
}
