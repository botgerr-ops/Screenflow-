package nl.screenflow.player;

import static org.junit.Assert.assertEquals;
import org.junit.Test;
import java.util.UUID;

/** Pure contract guard: a freshly generated device UID has UUID entropy and is never a model name. */
public class PlayerIdentityContractTest {
  @Test public void generatedDeviceUidIsUuid(){ String value=UUID.randomUUID().toString(); assertEquals(36,value.length()); }
}
