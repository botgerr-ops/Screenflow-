package nl.screenflow.player;

import java.time.LocalTime;
import java.util.Collection;

/** Pure scheduling rules shared by online config and restored offline snapshots. */
public final class ScheduleLogic {
    private ScheduleLogic() {}

    public static boolean isActive(Collection<Integer> days, int day, LocalTime start, LocalTime end, LocalTime now) {
        if (days == null || !days.contains(day)) return false;
        return end.isAfter(start) ? !now.isBefore(start) && now.isBefore(end)
                : !now.isBefore(start) || now.isBefore(end);
    }

    public static boolean overlaps(Collection<Integer> leftDays, LocalTime leftStart, LocalTime leftEnd,
                                   Collection<Integer> rightDays, LocalTime rightStart, LocalTime rightEnd) {
        for (Integer day : leftDays) if (rightDays.contains(day)
                && leftStart.isBefore(rightEnd) && rightStart.isBefore(leftEnd)) return true;
        return false;
    }
}
