const DAYS_OF_WEEK = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

const MONTHS_FULL = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function getTimeOfDayGreeting(hour: number): string {
  if (hour < 5) return "Good evening";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

interface DashboardGreetingProps {
  name: string | null;
  now: Date;
}

export default function DashboardGreeting({ name, now }: DashboardGreetingProps) {
  const dateLabel = `${DAYS_OF_WEEK[now.getDay()]}, ${now.getDate()} ${MONTHS_FULL[now.getMonth()]} ${now.getFullYear()}`;
  const greeting = getTimeOfDayGreeting(now.getHours());
  const headline = name ? `${greeting}, ${name}` : greeting;

  return (
    <div style={{ display: "grid", gap: 4 }}>
      <div
        style={{
          fontSize: "var(--dg-fs-body-sm, 14px)",
          color: "var(--color-text-muted)",
        }}
      >
        {dateLabel}
      </div>
      <h1
        style={{
          margin: 0,
          fontSize: "clamp(1.5rem, 2.2vw, 2rem)",
          fontWeight: 700,
          color: "var(--color-text-primary)",
          letterSpacing: "-0.03em",
        }}
      >
        {headline}
        <span aria-hidden="true" style={{ marginLeft: 6 }}>
          👋
        </span>
      </h1>
    </div>
  );
}
