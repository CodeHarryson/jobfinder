"use client";

import { FormEvent, useMemo, useState } from "react";
import { createTargetCompany } from "@/domain/target-company";
import type { TargetCompany } from "@/domain/opportunity";

const demoTargets: TargetCompany[] = [
  {
    id: "demo-1",
    name: "Northstar Labs",
    domain: "northstar.example",
    priority: "HIGH",
    roleKeywords: ["software intern", "new grad"],
    eventKeywords: ["university", "engineering"],
    createdAt: "2026-08-14T12:00:00.000Z",
    sources: [
      { id: "s1", kind: "CAREERS", url: "https://northstar.example/careers", enabled: true, scanCron: "* * * * *" },
      { id: "s2", kind: "EVENTS", url: "https://northstar.example/events", enabled: true, scanCron: "* * * * *" },
    ],
  },
];

export function Dashboard() {
  const [targets, setTargets] = useState(demoTargets);
  const [errors, setErrors] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const sourceCount = useMemo(() => targets.reduce((total, target) => total + target.sources.length, 0), [targets]);

  function addTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = createTargetCompany({
      name: String(form.get("name") ?? ""),
      domain: String(form.get("domain") ?? ""),
      careerUrl: String(form.get("careerUrl") ?? ""),
      earlyCareersUrl: String(form.get("earlyCareersUrl") ?? ""),
      eventsUrl: String(form.get("eventsUrl") ?? ""),
      priority: String(form.get("priority")) as TargetCompany["priority"],
      roleKeywords: String(form.get("roleKeywords") ?? "").split(","),
      eventKeywords: String(form.get("eventKeywords") ?? "").split(","),
    });

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setTargets((current) => [result.value, ...current]);
    setErrors([]);
    setShowForm(false);
    event.currentTarget.reset();
  }

  return (
    <main>
      <aside className="sidebar">
        <div className="brand"><span className="brandMark">JF</span><span>JobFinder</span></div>
        <nav aria-label="Primary navigation">
          <a className="active" href="#overview">Overview</a>
          <a href="#opportunities">Opportunities <span className="count">0</span></a>
          <a href="#events">Early-career events <span className="count">0</span></a>
          <a href="#applications">Applications</a>
          <a href="#targets">Target companies</a>
        </nav>
        <div className="scanStatus"><span className="pulse" />Watcher ready<br/><small>Default scan: every minute</small></div>
      </aside>

      <section className="content" id="overview">
        <header>
          <div><p className="eyebrow">Opportunity radar</p><h1>Good morning.</h1><p className="lede">Your company watchlist is ready for jobs and early-career events.</p></div>
          <button className="primary" onClick={() => setShowForm((value) => !value)}>{showForm ? "Close" : "+ Add company"}</button>
        </header>

        <div className="metrics">
          <article><span>Target companies</span><strong>{targets.length}</strong><small>Across your watchlist</small></article>
          <article><span>Active sources</span><strong>{sourceCount}</strong><small>Career and event pages</small></article>
          <article><span>New opportunities</span><strong>0</strong><small>Waiting for first scan</small></article>
          <article><span>Applications</span><strong>0</strong><small>Nothing tracked yet</small></article>
        </div>

        {showForm && (
          <form className="targetForm" onSubmit={addTarget}>
            <div className="formHeading"><div><p className="eyebrow">New watch target</p><h2>Add a company</h2></div><p>Career URL is required. Student and event pages can be added now or discovered later.</p></div>
            {errors.length > 0 && <div className="errors" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
            <div className="formGrid">
              <label>Company name<input name="name" placeholder="Acme" required /></label>
              <label>Company domain<input name="domain" placeholder="acme.com" required /></label>
              <label className="wide">Career page URL<input name="careerUrl" type="url" placeholder="https://acme.com/careers" required /></label>
              <label>Early-careers URL <span>optional</span><input name="earlyCareersUrl" type="url" placeholder="https://acme.com/students" /></label>
              <label>Events URL <span>optional</span><input name="eventsUrl" type="url" placeholder="https://acme.com/events" /></label>
              <label>Role keywords<input name="roleKeywords" placeholder="intern, new grad, software" /></label>
              <label>Event keywords<input name="eventKeywords" placeholder="university, hackathon" /></label>
              <label>Priority<select name="priority" defaultValue="MEDIUM"><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></label>
            </div>
            <div className="formActions"><button type="button" className="ghost" onClick={() => setShowForm(false)}>Cancel</button><button className="primary" type="submit">Start watching</button></div>
          </form>
        )}

        <section className="panel" id="targets">
          <div className="panelTitle"><div><p className="eyebrow">Configured sources</p><h2>Target companies</h2></div><span className="badge">ATS agnostic</span></div>
          <div className="targetList">
            {targets.map((target) => (
              <article className="target" key={target.id}>
                <div className="companyIcon">{target.name.slice(0, 2).toUpperCase()}</div>
                <div className="targetMain"><h3>{target.name}</h3><p>{target.domain} · {target.priority.toLowerCase()} priority</p><div className="tags">{[...target.roleKeywords, ...target.eventKeywords].slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div></div>
                <div className="sourceStack">{target.sources.map((source) => <span key={source.id}><i className={source.enabled ? "online" : ""}/>{source.kind.replace("_", " ").toLowerCase()}</span>)}</div>
              </article>
            ))}
          </div>
        </section>
      </section>
    </main>
  );
}
