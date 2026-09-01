import assert from "node:assert/strict";
import test from "node:test";
import { PRIORITY_COMPANY_NAMES, selectScanBatch } from "./scan-batch.ts";
import type { TargetCompany } from "../domain/opportunity.ts";

const targets=Array.from({length:112},(_,index)=>({id:String(index),name:`Company ${index}`,domain:`${index}.example`,priority:"HIGH",roleKeywords:[],eventKeywords:[],sources:[],createdAt:"2026-08-20T00:00:00.000Z"})) as TargetCompany[];

test("rotates a large watchlist through bounded invocation-based scan batches",()=>{
  const batches=Array.from({length:5},(_,index)=>selectScanBatch(targets,index));
  assert.deepEqual(batches.map(({targets:batch})=>batch.length),[25,25,25,25,12]);
  assert.equal(new Set(batches.flatMap(({targets:batch})=>batch.map(({id})=>id))).size,112);
});

test("scans the priority cohort every other cycle and rotates the remaining companies",()=>{
  const priorityTargets=PRIORITY_COMPANY_NAMES.map((name,index)=>({...targets[index],id:`priority-${index}`,name}));
  const standardTargets=targets.slice(25,85);
  const watchlist=[...priorityTargets,...standardTargets];
  const batches=Array.from({length:6},(_,index)=>selectScanBatch(watchlist,index));
  assert.deepEqual(batches.map(({targets:batch})=>batch.length),[25,25,25,25,25,10]);
  for(const index of [0,2,4]) assert.deepEqual(batches[index].targets.map(({name})=>name),[...PRIORITY_COMPANY_NAMES]);
  assert.equal(new Set([1,3,5].flatMap((index)=>batches[index].targets.map(({id})=>id))).size,60);
});

test("daily invocations cannot become stuck on one cohort or batch",()=>{
  const priorityTargets=PRIORITY_COMPANY_NAMES.map((name,index)=>({...targets[index],id:`priority-${index}`,name}));
  const watchlist=[...priorityTargets,...targets.slice(25,112)];
  const batches=Array.from({length:10},(_,cursor)=>selectScanBatch(watchlist,cursor));
  assert.equal(new Set(batches.flatMap(({targets:batch})=>batch.map(({id})=>id))).size,112);
});
