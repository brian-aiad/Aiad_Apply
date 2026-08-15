drop table if exists "Outreach" cascade;
drop table if exists "InterviewPack" cascade;
drop table if exists "Application" cascade;
drop table if exists "ResumeGeneration" cascade;
drop table if exists "Resume" cascade;
drop table if exists "JobScore" cascade;
drop table if exists "Job" cascade;
drop table if exists "Story" cascade;
drop table if exists "Settings" cascade;
drop table if exists "DailyLog" cascade;

drop table if exists application_events cascade;
drop table if exists artifacts cascade;
drop table if exists resume_changes cascade;
drop table if exists keyword_decisions cascade;
drop table if exists tailoring_runs cascade;
drop table if exists applications cascade;
drop table if exists jobs cascade;
drop table if exists daily_goals cascade;
drop table if exists resume_versions cascade;
drop table if exists settings cascade;

drop type if exists "ApplicationStatus" cascade;
drop type if exists "RunStatus" cascade;
drop type if exists "EvidenceLevel" cascade;
drop type if exists "RiskLevel" cascade;
drop type if exists "ArtifactKind" cascade;
