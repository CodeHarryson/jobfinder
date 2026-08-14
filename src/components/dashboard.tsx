"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createTargetCompany, updateTargetCompany } from "@/domain/target-company";
import type { TargetCompany } from "@/domain/opportunity";

type View = "overview" | "opportunities" | "events" | "applications" | "targets";
const STORAGE_KEY = "jobfinder.target-companies.v1";

const demoTargets: TargetCompany[] = [{
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
}];

const navItems: Array<{ id: View; label: string }> = [
  { id: "overview", label: "Overview" },
  { id: "opportunities", label: "Opportunities" },
  { id: "events", label: "Early-career events" },
  { id: "applications", label: "Applications" },
  { id: "targets", label: "Target companies" },
];

function readStoredTargets(): TargetCompany[] {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (!stored) return demoTargets;
    const parsed: unknown = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed as TargetCompany[] : demoTargets;
  } catch {
    return demoTargets;
  }
}

export function Dashboard() {
  const [view, setView] = useState<View>("overview");
  const [targets, setTargets] = useState(demoTargets);
  const [storageReady, setStorageReady] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState<TargetCompany | null>(null);
  const sourceCount = useMemo(() => targets.reduce((total, target) => total + target.sources.length, 0), [targets]);

  useEffect(() => {
    // Hydrate client-owned data after the server-rendered shell mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTargets(readStoredTargets());
    setStorageReady(true);
  }, []);

  useEffect(() => {
    if (storageReady) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
  }, [storageReady, targets]);

  function navigate(nextView: View) {
    setView(nextView);
    setErrors([]);
    if (nextView !== "targets") {
      setShowForm(false);
      setEditingTarget(null);
    }
  }

  function openAddCompany() {
    setView("targets");
    setShowForm(true);
    setEditingTarget(null);
    setErrors([]);
  }

  function addTarget(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const input = {
      name: String(form.get("name") ?? ""),
      domain: String(form.get("domain") ?? ""),
      careerUrl: String(form.get("careerUrl") ?? ""),
      earlyCareersUrl: String(form.get("earlyCareersUrl") ?? ""),
      eventsUrl: String(form.get("eventsUrl") ?? ""),
      priority: String(form.get("priority")) as TargetCompany["priority"],
      roleKeywords: String(form.get("roleKeywords") ?? "").split(","),
      eventKeywords: String(form.get("eventKeywords") ?? "").split(","),
    };
    const result = editingTarget ? updateTargetCompany(editingTarget, input) : createTargetCompany(input);

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    setTargets((current) => editingTarget
      ? current.map((target) => target.id === editingTarget.id ? result.value : target)
      : [result.value, ...current]);
    setErrors([]);
    setShowForm(false);
    setEditingTarget(null);
    formElement.reset();
  }

  function removeTarget(id: string) {
    setTargets((current) => current.filter((target) => target.id !== id));
  }

  function editTarget(target: TargetCompany) {
    setEditingTarget(target);
    setShowForm(true);
    setErrors([]);
  }

  return (
    <main>
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("overview")}><span className="brandMark">JF</span><span>JobFinder</span></button>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <button className={view === item.id ? "active" : ""} key={item.id} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined} aria-label={item.label}>
              {item.label}
              {(item.id === "opportunities" || item.id === "events") && <span className="count">0</span>}
            </button>
          ))}
        </nav>
        <div className="scanStatus warning"><span className="pulse paused" />Scanner not connected<br/><small>Sources are saved, but scans are not running</small></div>
      </aside>

      <section className="content">
        {view === "overview" && <Overview targets={targets} sourceCount={sourceCount} onAdd={openAddCompany} onViewTargets={() => navigate("targets")} />}
        {view === "targets" && <TargetsView targets={targets} showForm={showForm} editingTarget={editingTarget} errors={errors} onShowForm={() => { setEditingTarget(null); setShowForm(true); }} onHideForm={() => { setShowForm(false); setEditingTarget(null); setErrors([]); }} onSubmit={addTarget} onEdit={editTarget} onRemove={removeTarget} />}
        {view === "opportunities" && <EmptyView eyebrow="Discovery feed · scanner not connected" title="Opportunities" body="Your sources are saved, but the scheduled page scanner has not been implemented yet. No company—including Notion—will populate opportunities until that worker is connected." action="Manage watched companies" onAction={() => navigate("targets")} />}
        {view === "events" && <EmptyView eyebrow="Early-career calendar" title="Events" body="Information sessions, university events, workshops, hackathons, and registration deadlines will appear here." action="Manage event sources" onAction={() => navigate("targets")} />}
        {view === "applications" && <EmptyView eyebrow="Application pipeline" title="Applications" body="Applications you track will move through saved, submitted, assessment, interview, and decision stages here." action="Browse opportunities" onAction={() => navigate("opportunities")} />}
      </section>
    </main>
  );
}

function Overview({ targets, sourceCount, onAdd, onViewTargets }: { targets: TargetCompany[]; sourceCount: number; onAdd: () => void; onViewTargets: () => void }) {
  return <>
    <header><div><p className="eyebrow">Opportunity radar</p><h1>Good morning.</h1><p className="lede">Your company watchlist is ready for jobs and early-career events.</p></div><button className="primary" onClick={onAdd}>+ Add company</button></header>
    <div className="metrics">
      <article><span>Target companies</span><strong>{targets.length}</strong><small>Across your watchlist</small></article>
      <article><span>Active sources</span><strong>{sourceCount}</strong><small>Career and event pages</small></article>
      <article><span>New opportunities</span><strong>0</strong><small>Waiting for first scan</small></article>
      <article><span>Applications</span><strong>0</strong><small>Nothing tracked yet</small></article>
    </div>
    <section className="panel overviewTargets">
      <div className="panelTitle"><div><p className="eyebrow">Watchlist preview</p><h2>Companies being watched</h2></div><button className="textButton" onClick={onViewTargets}>View all →</button></div>
      {targets.length ? <div className="compactList">{targets.slice(0, 3).map((target) => <div key={target.id}><span className="companyIcon">{target.name.slice(0, 2).toUpperCase()}</span><span><b>{target.name}</b><small>{target.sources.length} active source{target.sources.length === 1 ? "" : "s"}</small></span></div>)}</div> : <p className="emptyInline">No companies yet. Add one to begin watching.</p>}
    </section>
  </>;
}

function TargetsView({ targets, showForm, editingTarget, errors, onShowForm, onHideForm, onSubmit, onEdit, onRemove }: { targets: TargetCompany[]; showForm: boolean; editingTarget: TargetCompany | null; errors: string[]; onShowForm: () => void; onHideForm: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onEdit: (target: TargetCompany) => void; onRemove: (id: string) => void }) {
  return <>
    <header><div><p className="eyebrow">Configured sources</p><h1>Target companies</h1><p className="lede">Manage every company, career page, and early-career event source being watched.</p></div><button className="primary" onClick={showForm ? onHideForm : onShowForm}>{showForm ? "Close" : "+ Add company"}</button></header>
    {showForm && <TargetForm key={editingTarget?.id ?? "new"} target={editingTarget} errors={errors} onSubmit={onSubmit} onCancel={onHideForm} />}
    <section className="panel">
      <div className="panelTitle"><div><p className="eyebrow">Active watchlist</p><h2>{targets.length} {targets.length === 1 ? "company" : "companies"}</h2></div><span className="badge">ATS agnostic</span></div>
      {targets.length ? <div className="targetList">{targets.map((target) => <article className="target" key={target.id}><div className="companyIcon">{target.name.slice(0, 2).toUpperCase()}</div><div className="targetMain"><h3>{target.name}</h3><p>{target.domain} · {target.priority.toLowerCase()} priority</p><div className="tags">{[...target.roleKeywords, ...target.eventKeywords].slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div></div><div className="targetActions"><div className="sourceStack">{target.sources.map((source) => <span key={source.id}><i className={source.enabled ? "online" : ""}/>{source.kind.replace("_", " ").toLowerCase()}</span>)}</div><div><button className="editButton" onClick={() => onEdit(target)} aria-label={`Edit ${target.name}`}>Edit</button><button className="removeButton" onClick={() => onRemove(target.id)} aria-label={`Stop watching ${target.name}`}>Remove</button></div></div></article>)}</div> : <div className="emptyState"><h3>No watched companies</h3><p>Add a company and its careers page to begin.</p><button className="primary" onClick={onShowForm}>Add your first company</button></div>}
    </section>
  </>;
}

function TargetForm({ target, errors, onSubmit, onCancel }: { target: TargetCompany | null; errors: string[]; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onCancel: () => void }) {
  const sourceUrl = (kind: TargetCompany["sources"][number]["kind"]) => target?.sources.find((source) => source.kind === kind)?.url ?? "";
  return <form className="targetForm" onSubmit={onSubmit}>
    <div className="formHeading"><div><p className="eyebrow">{target ? "Edit watch target" : "New watch target"}</p><h2>{target ? `Edit ${target.name}` : "Add a company"}</h2></div><p>Career URL is required. Student and event pages can be added now or discovered later.</p></div>
    {errors.length > 0 && <div className="errors" role="alert">{errors.map((error) => <p key={error}>{error}</p>)}</div>}
    <div className="formGrid">
      <label>Company name<input name="name" placeholder="Acme" defaultValue={target?.name} required /></label><label>Company domain<input name="domain" placeholder="acme.com" defaultValue={target?.domain} required /></label>
      <label className="wide">Career page URL<input name="careerUrl" type="url" placeholder="https://acme.com/careers" defaultValue={sourceUrl("CAREERS")} required /></label>
      <label>Early-careers URL <span>optional</span><input name="earlyCareersUrl" type="url" placeholder="https://acme.com/students" defaultValue={sourceUrl("EARLY_CAREERS")} /></label><label>Events URL <span>optional</span><input name="eventsUrl" type="url" placeholder="https://acme.com/events" defaultValue={sourceUrl("EVENTS")} /></label>
      <label>Role keywords<input name="roleKeywords" placeholder="intern, new grad, software" defaultValue={target?.roleKeywords.join(", ")} /></label><label>Event keywords<input name="eventKeywords" placeholder="university, hackathon" defaultValue={target?.eventKeywords.join(", ")} /></label>
      <label>Priority<select name="priority" defaultValue={target?.priority ?? "MEDIUM"}><option>HIGH</option><option>MEDIUM</option><option>LOW</option></select></label>
    </div><div className="formActions"><button type="button" className="ghost" onClick={onCancel}>Cancel</button><button className="primary" type="submit">{target ? "Save changes" : "Start watching"}</button></div>
  </form>;
}

function EmptyView({ eyebrow, title, body, action, onAction }: { eyebrow: string; title: string; body: string; action: string; onAction: () => void }) {
  return <><header><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div></header><section className="panel emptyState"><div className="emptyGlyph">↗</div><h2>Nothing here yet</h2><p>{body}</p><button className="primary" onClick={onAction}>{action}</button></section></>;
}
