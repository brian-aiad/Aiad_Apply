import Link from "next/link";
import { ArrowRight, Check, ChevronRight, CalendarClock, Search } from "lucide-react";
import { formatInTimeZone } from "date-fns-tz";
import { ApplicationTable } from "@/components/application-table";
import { FollowUpAction } from "@/components/follow-up-action";
import { DiscoveryAutoRefresh } from "@/components/discovery-auto-refresh";
import { getDashboard } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const data = await getDashboard();
  const remaining = Math.max(0, data.goal - data.appliedToday);
  const nextAction = data.nextAction;

  return (
    <div className="content today-page">
      <DiscoveryAutoRefresh />
      <div className="page-heading heading-row">
        <div><div className="eyebrow">{formatInTimeZone(new Date(), data.timezone, "EEEE, MMMM d")}</div><h1 className="page-title">Today</h1><p className="page-copy">A little progress, every day. Start with the next application.</p></div>
        <Link href="/discover" className="button button-quiet"><Search size={15} />Find openings</Link>
      </div>
      <section className="daily-desk" aria-labelledby="daily-target-title">
        <div className="daily-target">
          <div className="eyebrow" id="daily-target-title">Applications submitted today</div>
          <div className="daily-count">{data.appliedToday}<span> / {data.goal}</span></div>
          <div className="daily-progress" role="progressbar" aria-label="Daily application goal" aria-valuemin={0} aria-valuemax={data.goal} aria-valuenow={Math.min(data.goal, data.appliedToday)}><span style={{ width: `${Math.min(100, data.appliedToday / data.goal * 100)}%` }} /></div>
          <p className="daily-remaining">{remaining ? `${remaining} more to reach today’s goal.` : "Today’s goal is complete. Nicely done."}</p>
          <Link href="/settings" className="text-link">Adjust your goal <ChevronRight size={13} /></Link>
        </div>
        <div className="daily-next"><span className="eyebrow">Next up</span><h2>{nextAction.label}</h2><p>{nextAction.note}</p><Link className="button button-primary" href={nextAction.href}>{nextAction.actionLabel}<ArrowRight size={15} /></Link><span className="daily-footnote">Only applications you mark Applied count toward your goal.</span></div>
      </section>
      <section className="panel weekly-ledger" aria-labelledby="weekly-title">
        <div className="panel-header"><div><h2 className="panel-title" id="weekly-title">Your week</h2><p className="panel-subtitle muted">{data.activity.weekTotal} submitted · {data.activity.goalDays} days at your current goal</p></div><span className="streak-label">{data.activity.streak} {data.activity.streak === 1 ? "day" : "days"} in a row</span></div>
        <div className="week-days">{data.activity.week.map((day) => <div key={day.date} className={`week-day${day.today ? " week-day-today" : ""}${day.future ? " week-day-future" : ""}`} aria-label={`${day.label}, ${day.count} submitted${day.today ? ", today" : ""}`}><span>{day.label}</span><strong>{day.future ? "—" : day.count}</strong><span className={`day-marker${day.count >= data.goal ? " day-marker-complete" : ""}`}>{day.count >= data.goal ? <Check size={13} /> : <span style={{ width: `${Math.min(100, day.count / data.goal * 100)}%` }} />}</span><small>{day.today ? "Today" : day.count >= data.goal ? "Goal met" : day.future ? "Upcoming" : day.count ? "Applied" : "No applications"}</small></div>)}</div>
        <p className="ledger-note">A streak means at least one application each day. Today stays open until midnight in your selected timezone.</p>
      </section>
      <div className="today-columns">
        <section className="panel"><div className="panel-header"><h2 className="panel-title">In progress</h2><Link href="/applications" className="text-link">View all <ChevronRight size={14} /></Link></div><div className="pipeline-list">{[["CAPTURED", "Saved jobs", data.captured], ["TAILORING", "Being tailored", data.tailoring], ["REVIEW", "Ready for review", data.review], ["READY", "Ready to apply", data.ready], ["INTERVIEW", "Interviews", data.interviews]].map(([status, label, count]) => <Link key={String(status)} href={`/applications?status=${status}`} className="pipeline-row"><span>{label}</span><strong>{count}<ChevronRight size={14} /></strong></Link>)}</div></section>
        <section className="panel"><div className="panel-header"><h2 className="panel-title">Follow-ups due</h2><CalendarClock size={16} className="muted" /></div>{data.followUps.length ? <div className="followup-list">{data.followUps.map((item) => <div className="followup-row" key={item.id}><Link href={`/applications/${item.id}`}><strong>{item.job.company}</strong><span>{item.job.title}</span><small>Due {formatInTimeZone(item.followUpAt!, data.timezone, "MMM d")}</small></Link><FollowUpAction id={item.id} /></div>)}</div> : <div className="quiet-empty"><Check size={20} /><strong>You’re caught up.</strong><p>Follow-ups appear here after you mark an application Applied.</p></div>}</section>
      </div>
      <section className="panel recent-panel"><div className="panel-header"><h2 className="panel-title">Recent activity</h2><Link href="/applications" className="text-link">All applications <ChevronRight size={14} /></Link></div><ApplicationTable applications={data.applications} /></section>
    </div>
  );
}
