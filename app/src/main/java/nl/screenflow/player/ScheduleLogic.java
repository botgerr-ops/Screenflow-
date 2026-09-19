package nl.screenflow.player;

import java.time.LocalTime;
import java.util.Collection;

/** Pure scheduling rules shared by online configuration and restored offline snapshots.
 * days are the starting weekdays (Sunday=0); ranges are half-open [start,end). */
public final class ScheduleLogic {
    private static final long DAY = 24L * 60 * 60 * 1_000_000_000L;
    private static final long WEEK = 7L * DAY;
    private ScheduleLogic() {}

    public static boolean isActive(Collection<Integer> days, int day, LocalTime start, LocalTime end, LocalTime now) {
        if (days == null || start == null || end == null || now == null || start.equals(end) || day < 0 || day > 6) return false;
        if (end.isAfter(start)) return days.contains(day) && !now.isBefore(start) && now.isBefore(end);
        // For a Friday 22:00–02:00 plan, Saturday 01:00 belongs to Friday's interval.
        int previous = (day + 6) % 7;
        return (days.contains(day) && !now.isBefore(start)) || (days.contains(previous) && now.isBefore(end));
    }

    public static boolean overlaps(Collection<Integer> leftDays, LocalTime leftStart, LocalTime leftEnd,
                                   Collection<Integer> rightDays, LocalTime rightStart, LocalTime rightEnd) {
        if (leftDays == null || rightDays == null || leftStart == null || leftEnd == null || rightStart == null || rightEnd == null
                || leftStart.equals(leftEnd) || rightStart.equals(rightEnd)) return false;
        for (Integer left : leftDays) {
            if (left == null || left < 0 || left > 6) continue;
            long a = left * DAY + leftStart.toNanoOfDay();
            long b = left * DAY + leftEnd.toNanoOfDay() + (leftEnd.isAfter(leftStart) ? 0 : DAY);
            for (Integer right : rightDays) {
                if (right == null || right < 0 || right > 6) continue;
                long c = right * DAY + rightStart.toNanoOfDay();
                long d = right * DAY + rightEnd.toNanoOfDay() + (rightEnd.isAfter(rightStart) ? 0 : DAY);
                // Compare the interval against the previous, same and following calendar week.
                for (long shift = -WEEK; shift <= WEEK; shift += WEEK)
                    if (a < d + shift && c + shift < b) return true;
            }
        }
        return false;
    }
}
