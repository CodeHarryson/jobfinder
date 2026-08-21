import assert from "node:assert/strict";
import test from "node:test";
import { selectScanBatch } from "./scan-batch.ts";
import type { TargetCompany } from "../domain/opportunity.ts";

const targets=Array.from({length:112},(_,index)=>({id:String(index),name:`Company ${index}`,domain:`${index}.example`,priority:"HIGH",roleKeywords:[],eventKeywords:[],sources:[],createdAt:"2026-08-20T00:00:00.000Z"})) as TargetCompany[];

test("rotates a large watchlist through bounded five-minute scan batches",()=>{
  const batches=Array.from({length:5},(_,index)=>selectScanBatch(targets,new Date(index*300_000)));
  assert.deepEqual(batches.map(({targets:batch})=>batch.length),[25,25,25,25,12]);
  assert.equal(new Set(batches.flatMap(({targets:batch})=>batch.map(({id})=>id))).size,112);
});
