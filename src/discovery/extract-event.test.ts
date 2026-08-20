import assert from "node:assert/strict";
import test from "node:test";
import { extractEventPage } from "./extract-event.ts";
import type { TargetCompany } from "../domain/opportunity.ts";

const google: TargetCompany = { id:"google",name:"Google",domain:"google.com",priority:"HIGH",roleKeywords:[],eventKeywords:["internship","workshop"],createdAt:"2026-08-20T00:00:00.000Z",sources:[{id:"google-jobs",kind:"CAREERS",url:"https://google.com/jobs",enabled:true,scanCron:"* * * * *"}] };

test("extracts a WithGoogle workshop from metadata without requiring a published date", () => {
  const html='<title>Technical Resume Workshop at Google Toronto</title><meta name="description" content="Applying for internships this semester? Join our workshop.">';
  const event=extractEventPage(html,"https://rsvp.withgoogle.com/events/technical-resume-workshop-at-google-toronto",google,"2026-08-20T00:00:00.000Z");
  assert.equal(event.title,"Technical Resume Workshop at Google Toronto");
  assert.equal(event.eventType,"WORKSHOP");
  assert.equal(event.location,"Toronto");
  assert.equal(event.startsAt,null);
  assert.equal(event.status,"REGISTRATION_OPEN");
});
