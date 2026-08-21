import type { TargetCompanyInput } from "./target-company.ts";

export type CompanyPreset = {
  id: string;
  name: string;
  description: string;
  companies: TargetCompanyInput[];
};

const earlyCareerRoles = ["intern", "internship", "new grad", "graduate", "early career", "university"];
const earlyCareerEvents = ["student", "university", "early career", "campus", "event"];

export const MAANGO_PRESET: CompanyPreset = {
  id: "maango",
  name: "MAANGO",
  description: "Meta, Apple, Amazon, Netflix, Google, and Oracle",
  companies: [
    { name: "Meta", domain: "metacareers.com", careerUrl: "https://www.metacareers.com/jobs/", earlyCareersUrl: "https://www.metacareers.com/careerprograms/students/", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Apple", domain: "apple.com", careerUrl: "https://jobs.apple.com/en-us/search", earlyCareersUrl: "https://www.apple.com/careers/us/students.html", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Amazon", domain: "amazon.jobs", careerUrl: "https://www.amazon.jobs/en/", earlyCareersUrl: "https://www.amazon.jobs/content/en/career-programs/university", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Netflix", domain: "jobs.netflix.com", careerUrl: "https://explore.jobs.netflix.net/careers", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Google", domain: "google.com", careerUrl: "https://www.google.com/about/careers/applications/jobs/results/", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Oracle", domain: "oracle.com", careerUrl: "https://www.oracle.com/careers/", earlyCareersUrl: "https://www.oracle.com/careers/students-grads/", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
  ],
};

export const UNICORN_SCALEUPS_PRESET: CompanyPreset = {
  id: "unicorn-scaleups",
  name: "Unicorns & scale-ups",
  description: "Together AI, Stripe, Notion, Anthropic, OpenAI, Databricks, Canva, Rippling, and Ramp",
  companies: [
    { name: "Together AI", domain: "together.ai", careerUrl: "https://www.together.ai/careers", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Stripe", domain: "stripe.com", careerUrl: "https://stripe.com/jobs/search", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Notion", domain: "notion.com", careerUrl: "https://www.notion.com/careers?department=university", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Anthropic", domain: "anthropic.com", careerUrl: "https://www.anthropic.com/careers/jobs", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "OpenAI", domain: "openai.com", careerUrl: "https://openai.com/careers/search/", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Databricks", domain: "databricks.com", careerUrl: "https://www.databricks.com/company/careers/open-positions", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Canva", domain: "canva.com", careerUrl: "https://careers.canva.com/jobs/", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Rippling", domain: "rippling.com", careerUrl: "https://www.rippling.com/careers/open-roles", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Ramp", domain: "ramp.com", careerUrl: "https://jobs.ashbyhq.com/ramp", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
  ],
};

export const TOP_TECH_PRESET: CompanyPreset = {
  id: "top-tech",
  name: "Top tech",
  description: "A curated mix of 15 major technology platforms, AI labs, and cloud/data companies",
  companies: [
    { name: "NVIDIA", domain: "nvidia.com", careerUrl: "https://jobs.nvidia.com/careers", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Microsoft", domain: "microsoft.com", careerUrl: "https://apply.careers.microsoft.com/careers", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Meta", domain: "metacareers.com", careerUrl: "https://www.metacareers.com/jobs/", earlyCareersUrl: "https://www.metacareers.com/careerprograms/students/", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Apple", domain: "apple.com", careerUrl: "https://jobs.apple.com/en-us/search", earlyCareersUrl: "https://www.apple.com/careers/us/students.html", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Amazon", domain: "amazon.jobs", careerUrl: "https://www.amazon.jobs/en/", earlyCareersUrl: "https://www.amazon.jobs/content/en/career-programs/university", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Google", domain: "google.com", careerUrl: "https://www.google.com/about/careers/applications/jobs/results/", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Netflix", domain: "jobs.netflix.com", careerUrl: "https://explore.jobs.netflix.net/careers", earlyCareersUrl: "https://jobs.netflix.com/careers/new-grads", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "OpenAI", domain: "openai.com", careerUrl: "https://openai.com/careers/search/", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Anthropic", domain: "anthropic.com", careerUrl: "https://www.anthropic.com/careers/jobs", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Databricks", domain: "databricks.com", careerUrl: "https://www.databricks.com/company/careers/open-positions", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Stripe", domain: "stripe.com", careerUrl: "https://stripe.com/jobs/search", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Cloudflare", domain: "cloudflare.com", careerUrl: "https://www.cloudflare.com/careers/jobs/", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Snowflake", domain: "snowflake.com", careerUrl: "https://careers.snowflake.com/us/en", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Adobe", domain: "adobe.com", careerUrl: "https://careers.adobe.com/us/en/search-results/", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
    { name: "Uber", domain: "uber.com", careerUrl: "https://jobs.uber.com/en/jobs/", priority: "HIGH", roleKeywords: earlyCareerRoles, eventKeywords: earlyCareerEvents },
  ],
};

export const STARTER_PRESETS = [MAANGO_PRESET, UNICORN_SCALEUPS_PRESET, TOP_TECH_PRESET] as const;
