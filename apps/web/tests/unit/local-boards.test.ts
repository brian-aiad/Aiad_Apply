import test from "node:test";
import assert from "node:assert/strict";
import { pageUpOpenings, jobviteOpening } from "../../src/lib/discovery/local-boards";
import type { Source } from "../../src/lib/discovery/types";
const source: Source = { key:"pageup:csulb", provider:"pageup", board:"873/lb", company:"CSULB", url:"https://careers.pageuppeople.com/873/lb/en-us/listing/" };
const now=new Date("2026-10-20T12:00:00Z");
const duties="Troubleshoot user incidents, resolve access issues, test business applications and document support procedures. ".repeat(4);
const xml=(changes="")=>`<rss><channel><item><link>https://careers.pageuppeople.com/873/lb/en-us/job/123456</link><title>Application Support Analyst</title><job:category>Time Basis|Full Time</job:category><job:location>Southern California|Long Beach</job:location><pubDate>Mon, 19 Oct 2026 16:00:00 GMT</pubDate><job:description><![CDATA[<h2>Requirements</h2><p>${duties}</p><p>Hiring Range: $5,500 (Step #1) - $6,000 (Step #9) per month.</p><p>Classification Salary Range: $4,000 - $8,000 per month.</p>]]></job:description>${changes}</item></channel></rss>`;
test("university RSS supplies full employer duties, exact worksite, original date and hiring pay rather than classification band",()=>{
  const [j]=pageUpOpenings(source,xml(),now);
  assert.equal(j.location,"Long Beach"); assert.equal(j.employmentType,"Full-time");
  assert.equal(j.salaryMin,66000); assert.equal(j.salaryMax,72000);
  assert.equal(j.postedAt?.toISOString(),"2026-10-19T16:00:00.000Z");
  assert.ok(j.description.includes("Classification Salary Range"));
  assert.equal(j.workArrangement,"Not listed");
});
test("closed, foreign-host and malformed university entries never become recommended jobs",()=>{
  assert.equal(pageUpOpenings(source,xml('<job:closingDate>2026-10-19</job:closingDate>'),now).length,0);
  assert.equal(pageUpOpenings(source,xml().replace('careers.pageuppeople.com/873','evil.example/873'),now).length,0);
  assert.equal(pageUpOpenings(source,xml().replace('Full Time','Temporary, Full Time'),now)[0].employmentType,"Other");
  assert.throws(()=>pageUpOpenings(source,'<html>Sign in required</html>',now),/format changed/);
});
const laser:Source={key:"jobvite:laserfiche",provider:"jobvite",board:"laserfiche",company:"Laserfiche",url:"https://jobs.jobvite.com/laserfiche/jobs"};
const url="https://jobs.jobvite.com/laserfiche/job/abc123";
const j={"@type":"JobPosting",title:"Technical Support Engineer",description:duties,employmentType:"FULL_TIME",datePosted:"2026-10-19",jobLocation:{address:{addressLocality:"Long Beach",addressRegion:"CA",addressCountry:"US"}},baseSalary:{currency:"USD",value:{minValue:70000,maxValue:90000,unitText:"YEAR"}}};
const html=(v:unknown)=>`<script type="application/ld+json">${JSON.stringify(v)}</script>`;
test("local software employer structured data preserves facts and rejects cross-job identity or unknown compensation",()=>{
  const result=jobviteOpening(laser,html(j),url,now)!;
  assert.equal(result.salaryMin,70000);assert.equal(result.employmentType,"Full-time");assert.equal(result.location,"Long Beach, CA, US");
  assert.equal(jobviteOpening(laser,html({...j,url:"https://evil.example/job"}),url,now),null);
  assert.equal(jobviteOpening(laser,html({...j,validThrough:"2026-10-18"}),url,now),null);
  assert.equal(jobviteOpening(laser,html({...j,baseSalary:{currency:"CAD",value:{minValue:70000,maxValue:90000,unitText:"YEAR"}}}),url,now)?.salaryMin,null);
  assert.equal(jobviteOpening(laser,html({...j,datePosted:undefined}),url,now)?.postedAt,null);
});


test("employer visible worksite supplements country-only schema, and remote states are explicitly remote",()=>{
  const countryOnly={...j,jobLocation:{address:{addressCountry:"United States"}}};
  const meta=(place:string)=>`<p class="jv-job-detail-meta">Support<span class='jv-inline-separator'></span>${place}</p>`;
  assert.equal(jobviteOpening(laser,html(countryOnly)+meta("Long Beach, CA"),url,now)?.location,"Long Beach, CA");
  assert.equal(jobviteOpening(laser,html(countryOnly)+meta("Remote States, United States"),url,now)?.workArrangement,"Remote");
  assert.equal(jobviteOpening(laser,html({...j,jobLocationType:"TELECOMMUTE"}),url,now)?.workArrangement,"Remote");
});
