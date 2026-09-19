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
  @Test public void fridayNightContinuesIntoSaturday(){LocalTime start=LocalTime.of(22,0),end=LocalTime.of(2,0);assertTrue(ScheduleLogic.isActive(Arrays.asList(5),5,start,end,LocalTime.of(23,0)));assertTrue(ScheduleLogic.isActive(Arrays.asList(5),6,start,end,LocalTime.of(1,59)));assertFalse(ScheduleLogic.isActive(Arrays.asList(5),6,start,end,LocalTime.of(2,0)));assertFalse(ScheduleLogic.isActive(Arrays.asList(5),4,start,end,LocalTime.of(1,0)));}
  @Test public void sundayNightContinuesIntoMonday(){assertTrue(ScheduleLogic.isActive(Arrays.asList(0),1,LocalTime.of(23,0),LocalTime.of(1,0),LocalTime.of(0,30)));assertFalse(ScheduleLogic.isActive(Arrays.asList(0),1,LocalTime.of(23,0),LocalTime.of(1,0),LocalTime.of(1,0)));}
  @Test public void nightIntervalsOverlapNextDay(){assertTrue(ScheduleLogic.overlaps(Arrays.asList(5),LocalTime.of(22,0),LocalTime.of(2,0),Arrays.asList(6),LocalTime.of(1,0),LocalTime.of(3,0)));assertFalse(ScheduleLogic.overlaps(Arrays.asList(5),LocalTime.of(22,0),LocalTime.of(2,0),Arrays.asList(6),LocalTime.of(2,0),LocalTime.of(3,0)));}
  @Test public void weeklyBoundaryDetectsSundayNightOverlapMonday(){assertTrue(ScheduleLogic.overlaps(Arrays.asList(0),LocalTime.of(23,0),LocalTime.of(1,0),Arrays.asList(1),LocalTime.of(0,30),LocalTime.of(2,0)));assertFalse(ScheduleLogic.overlaps(Arrays.asList(0),LocalTime.of(23,0),LocalTime.of(1,0),Arrays.asList(1),LocalTime.of(1,0),LocalTime.of(2,0)));}
  @Test public void intervalWithSameStartAndEndIsInvalid(){assertFalse(ScheduleLogic.isActive(Arrays.asList(1),1,LocalTime.of(9,0),LocalTime.of(9,0),LocalTime.of(9,0)));assertFalse(ScheduleLogic.overlaps(Arrays.asList(1),LocalTime.of(9,0),LocalTime.of(9,0),Arrays.asList(1),LocalTime.of(8,0),LocalTime.of(10,0)));}
}
