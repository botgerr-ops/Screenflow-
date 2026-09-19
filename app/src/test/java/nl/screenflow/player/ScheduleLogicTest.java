package nl.screenflow.player;

import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertTrue;
import java.time.LocalTime;
import java.util.Arrays;
import org.junit.Test;

public class ScheduleLogicTest {
  @Test public void switchesAtLocalBoundary(){assertFalse(ScheduleLogic.isActive(Arrays.asList(1),1,LocalTime.of(9,0),LocalTime.of(10,0),LocalTime.of(8,59,59)));assertTrue(ScheduleLogic.isActive(Arrays.asList(1),1,LocalTime.of(9,0),LocalTime.of(10,0),LocalTime.of(9,0)));assertFalse(ScheduleLogic.isActive(Arrays.asList(1),1,LocalTime.of(9,0),LocalTime.of(10,0),LocalTime.of(10,0)));}
  @Test public void adjacentWindowsDoNotConflict(){assertFalse(ScheduleLogic.overlaps(Arrays.asList(1),LocalTime.of(9,0),LocalTime.of(10,0),Arrays.asList(1),LocalTime.of(10,0),LocalTime.of(11,0)));}
  @Test public void sameDayOverlapConflicts(){assertTrue(ScheduleLogic.overlaps(Arrays.asList(1),LocalTime.of(9,0),LocalTime.of(11,0),Arrays.asList(1,2),LocalTime.of(10,0),LocalTime.of(12,0)));}
}
