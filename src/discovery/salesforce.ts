import { load } from "cheerio";
import type { JobPosting, TargetCompany, TargetSource } from "../domain/opportunity.ts";
import { employmentType, fingerprint, idFor, matchesTarget } from "./extract-jobs.ts";

type SalesforceRecord = {
  Employee_Type?: string; External_Job_Posting_Site?: string; Job_Description?: string;
  Job_Posting_Title?: string; Job_Requisition_Primary_Location?: string; Job_Requisition_Ref_ID?: string;
  Time_Type?: string; Countries?: string[]; Regions?: string[]; Locations?: string[];
};
type SalesforceResponse = { Report_Entry?: SalesforceRecord[] };

export function isSalesforce(target: TargetCompany) { return target.name.trim().toLowerCase() === "salesforce" || target.domain === "salesforce.com"; }
function plainText(value = "") { return load(`<div>${value}</div>`)("div").text().replace(/\s+/g, " ").trim(); }

export function extractSalesforceJobs(payload: SalesforceResponse, source: TargetSource, target: TargetCompany, observedAt: string): JobPosting[] {
  if (!Array.isArray(payload.Report_Entry)) throw new Error("Salesforce careers dataset returned an invalid response.");
  return payload.Report_Entry.flatMap((record) => {
    const title = record.Job_Posting_Title?.trim() ?? "";
    const externalUrl = record.External_Job_Posting_Site?.trim() ?? "";
    const requisition = record.Job_Requisition_Ref_ID?.trim() ?? "";
    if (!title || !externalUrl || !requisition) return [];
    const description = plainText(record.Job_Description);
    if (!matchesTarget({ title, description }, target)) return [];
    const canonicalUrl = `https://careers.salesforce.com/en/jobs/${requisition.toLowerCase()}/${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
    const primary = record.Job_Requisition_Primary_Location?.trim() ?? "";
    const country = record.Countries?.length === 1 ? record.Countries[0] : "";
    const primaryParts = primary.split(" - ").map((part) => part.trim()).filter(Boolean);
    const normalizedPrimary = primaryParts.length === 2 ? [primaryParts[1], primaryParts[0], country].filter(Boolean).join(", ") : [primary, country].filter(Boolean).join(", ");
    const secondary = (record.Locations ?? [])
      .filter((location) => !normalizedPrimary.toLowerCase().startsWith(`${location.trim().toLowerCase()},`))
      .map((location) => [location, country].filter(Boolean).join(", "));
    const jobLocations = [...new Set([normalizedPrimary, ...secondary].filter(Boolean))];
    return [{
      kind: "JOB" as const, id: idFor(target.id, canonicalUrl), companyId: target.id, sourceId: source.id,
      sourceUrl: source.url, canonicalUrl, applicationUrl: externalUrl, title, description, locations: jobLocations,
      employmentType: employmentType(title, `${record.Employee_Type ?? ""} ${record.Time_Type ?? ""}`),
      firstSeenAt: observedAt, lastSeenAt: observedAt,
      contentFingerprint: fingerprint(title, description, canonicalUrl, jobLocations.join("|")), extractionConfidence: 0.99,
    }];
  });
}

export async function discoverSalesforceJobs(source: TargetSource, target: TargetCompany, observedAt: string, fetchJson: (url: string) => Promise<unknown>) {
  const primary = "https://a.sfdcstatic.com/digital/xsf/careers/prod/jobs_1.json";
  try { return extractSalesforceJobs(await fetchJson(primary) as SalesforceResponse, source, target, observedAt); }
  catch { return extractSalesforceJobs(await fetchJson("https://a.sfdcstatic.com/digital/xsf/careers/prod/jobs_1_backup.json") as SalesforceResponse, source, target, observedAt); }
}
