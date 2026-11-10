"use client";
import {useEffect,useState} from 'react';
function elapsed(since:string,now:number){const seconds=Math.max(0,Math.floor((now-Date.parse(since))/1000));return seconds<60?`${seconds}s`:`${Math.floor(seconds/60)}m ${seconds%60}s`;}
export function TailoringProgress({queuedAt,startedAt,updatedAt,observedAt}:{queuedAt:string;startedAt:string|null;updatedAt:string;observedAt:number}){
 const[now,setNow]=useState(observedAt);
 useEffect(()=>{const timer=setInterval(()=>setNow(Date.now()),15000);return()=>clearInterval(timer);},[]);
 const quiet=now-Date.parse(updatedAt)>10*60000;
 return <div className="tailoring-progress-note" role="status"><span className="live-dot" aria-hidden="true"/><span>{startedAt?`Working for ${elapsed(startedAt,now)}`:`Queued for ${elapsed(queuedAt,now)}`} · last update {elapsed(updatedAt,now)} ago{quiet?' · No recent progress. Check the desktop worker before starting another run.':''}</span></div>;
}
