import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

crons.daily(
  "document reminder notifications",
  { hourUTC: 14, minuteUTC: 0 },
  internal.notifications.createReminderNotifications
);

crons.daily(
  "personal change document reminders",
  { hourUTC: 14, minuteUTC: 30 },
  internal.notifications.processPersonalChangeReminders
);

crons.daily(
  "workflow due-date reminders",
  { hourUTC: 15, minuteUTC: 0 },
  internal.notifications.createWorkflowDueDateReminders
);

crons.weekly(
  "weekly update notifications",
  { dayOfWeek: "monday", hourUTC: 9, minuteUTC: 0 },
  internal.notifications.createWeeklyUpdateNotifications
);

crons.daily(
  "attendance prediction refresh",
  { hourUTC: 11, minuteUTC: 30 },
  internal.safety.refreshAttendancePredictions,
  {}
);

crons.daily(
  "attendance no-show notifications",
  { hourUTC: 16, minuteUTC: 30 },
  internal.safety.sendAttendanceNoShowNotifications,
  {}
);

crons.daily(
  "daily report missing reminders",
  { hourUTC: 1, minuteUTC: 0 },
  internal.notifications.createDailyReportMissingNotifications
);

crons.daily(
  "task due soon and overdue reminders",
  { hourUTC: 13, minuteUTC: 0 },
  internal.notifications.createTaskDueReminders
);

crons.daily(
  "document expiry reminders",
  { hourUTC: 13, minuteUTC: 30 },
  internal.notifications.createSafetyDocExpiryReminders
);

crons.hourly(
  "user scheduled custom notifications",
  { minuteUTC: 15 },
  internal.userCustomNotifications.processScheduledReminders
);

crons.daily(
  "user condition custom notifications",
  { hourUTC: 14, minuteUTC: 45 },
  internal.userCustomNotifications.processConditionRules
);

export default crons;
