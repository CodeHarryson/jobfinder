"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { createTargetCompany, updateTargetCompany } from "@/domain/target-company";
import { STARTER_PRESETS, type CompanyPreset } from "@/domain/company-presets";
import type { JobPosting, TargetCompany } from "@/domain/opportunity";

type View = "overview" | "notifications" | "opportunities" | "events" | "applications" | "targets";
type NotificationItem = { id: string; jobId: string; companyId: string; kind: "NEW" | "UPDATED"; createdAt: string; readAt: string | null; companyName: string; jobTitle: string; applicationUrl: string };
const STORAGE_KEY = "jobfinder.target-companies.v1";
const JOBS_STORAGE_KEY = "jobfinder.opportunities.v1";

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
  { id: "notifications", label: "Notifications" },
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

function readStoredJobs(): JobPosting[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(JOBS_STORAGE_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed as JobPosting[] : [];
  } catch {
    return [];
  }
}

export function Dashboard() {
  const [view, setView] = useState<View>("overview");
  const [targets, setTargets] = useState(demoTargets);
  const [jobs, setJobs] = useState<JobPosting[]>([]);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [storageReady, setStorageReady] = useState(false);
  const [errors, setErrors] = useState<string[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [editingTarget, setEditingTarget] = useState<TargetCompany | null>(null);
  const [scanState, setScanState] = useState<"idle" | "scanning" | "success" | "error">("idle");
  const [scanMessage, setScanMessage] = useState("Run the first scan to discover opportunities");
  const sourceCount = useMemo(() => targets.reduce((total, target) => total + target.sources.length, 0), [targets]);

  useEffect(() => {
    const localTargets = readStoredTargets();
    const localJobs = readStoredJobs();
    // Hydrate client-owned data after the server-rendered shell mounts.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setTargets(localTargets);
    setJobs(localJobs);
    setStorageReady(true);
    void (async () => {
      try {
        const [targetResponse, jobResponse, notificationResponse] = await Promise.all([fetch("/api/targets"), fetch("/api/opportunities"), fetch("/api/notifications")]);
        if (targetResponse.ok) {
          const payload = await targetResponse.json() as { targets?: TargetCompany[] };
          if (payload.targets?.length) setTargets(payload.targets);
          else if (localTargets.length) await fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets: localTargets }) });
        }
        if (jobResponse.ok) {
          const payload = await jobResponse.json() as { jobs?: JobPosting[] };
          if (payload.jobs?.length) setJobs(payload.jobs);
        }
        if (notificationResponse.ok) {
          const payload = await notificationResponse.json() as { notifications?: NotificationItem[] };
          if (payload.notifications) setNotifications(payload.notifications);
        }
      } catch {
        // Local storage remains an offline fallback while the server is unavailable.
      }
    })();
  }, []);

  useEffect(() => {
    if (storageReady) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(targets));
  }, [storageReady, targets]);

  useEffect(() => {
    if (storageReady) window.localStorage.setItem(JOBS_STORAGE_KEY, JSON.stringify(jobs));
  }, [jobs, storageReady]);

  async function scanNow() {
    if (!targets.length || scanState === "scanning") return;
    setScanState("scanning");
    setScanMessage(`Scanning ${targets.length} ${targets.length === 1 ? "company" : "companies"}…`);
    try {
      const response = await fetch("/api/discovery/scan", {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets }),
      });
      const payload: unknown = await response.json();
      if (!response.ok || !payload || typeof payload !== "object" || !Array.isArray((payload as { jobs?: unknown }).jobs)) {
        throw new Error((payload as { error?: string } | null)?.error ?? "The scan could not be completed.");
      }
      const result = payload as { jobs: JobPosting[]; failures?: Array<{ message: string }>; changes?: Array<{ kind: "NEW" | "UPDATED" }> };
      setJobs((current) => [...new Map([...result.jobs, ...current].map((job) => [`${job.companyId}:${job.canonicalUrl}`, job])).values()]);
      const failureCount = result.failures?.length ?? 0;
      setScanState("success");
      const newCount = result.changes?.filter(({ kind }) => kind === "NEW").length ?? 0;
      const updatedCount = result.changes?.filter(({ kind }) => kind === "UPDATED").length ?? 0;
      setScanMessage(`Found ${result.jobs.length} matching ${result.jobs.length === 1 ? "role" : "roles"} · ${newCount} new · ${updatedCount} updated${failureCount ? ` · ${failureCount} source ${failureCount === 1 ? "failed" : "failures"}` : ""}`);
      if (newCount + updatedCount > 0) {
        const notificationResponse = await fetch("/api/notifications");
        if (notificationResponse.ok) setNotifications((await notificationResponse.json() as { notifications: NotificationItem[] }).notifications);
      }
      setView("opportunities");
    } catch (error) {
      setScanState("error");
      setScanMessage(error instanceof Error ? error.message : "The scan could not be completed.");
    }
  }

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
      scanCron: String(form.get("scanCron") ?? "* * * * *"),
    };
    const result = editingTarget ? updateTargetCompany(editingTarget, input) : createTargetCompany(input);

    if (!result.ok) {
      setErrors(result.errors);
      return;
    }

    const duplicate = targets.find((target) => target.id !== editingTarget?.id
      && (target.name.toLowerCase() === result.value.name.toLowerCase() || target.domain === result.value.domain));
    if (duplicate) {
      setErrors([`${duplicate.name} is already in the watchlist.`]);
      return;
    }

    setTargets((current) => editingTarget
      ? current.map((target) => target.id === editingTarget.id ? result.value : target)
      : [result.value, ...current]);
    void fetch(editingTarget ? `/api/targets/${result.value.id}` : "/api/targets", {
      method: editingTarget ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(result.value),
    }).catch(() => undefined);
    setErrors([]);
    setShowForm(false);
    setEditingTarget(null);
    formElement.reset();
  }

  function removeTarget(id: string) {
    setTargets((current) => current.filter((target) => target.id !== id));
    setJobs((current) => current.filter((job) => job.companyId !== id));
    void fetch(`/api/targets/${id}`, { method: "DELETE" }).catch(() => undefined);
  }

  function editTarget(target: TargetCompany) {
    setEditingTarget(target);
    setShowForm(true);
    setErrors([]);
  }

  function addPreset(preset: CompanyPreset) {
    const existingDomains = new Set(targets.map(({ domain }) => domain));
    const existingNames = new Set(targets.map(({ name }) => name.toLowerCase()));
    const additions = preset.companies
      .filter(({ domain, name }) => !existingDomains.has(domain) && !existingNames.has(name.toLowerCase()))
      .map(createTargetCompany)
      .flatMap((result) => result.ok ? [result.value] : []);
    setTargets((current) => [...additions, ...current]);
    if (additions.length) void fetch("/api/targets", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ targets: additions }) }).catch(() => undefined);
    setView("targets");
    setShowForm(false);
    setEditingTarget(null);
  }

  async function markNotificationRead(id: string) {
    setNotifications((current) => current.map((item) => item.id === id ? { ...item, readAt: item.readAt ?? new Date().toISOString() } : item));
    await fetch(`/api/notifications/${id}`, { method: "PATCH" }).catch(() => undefined);
  }

  async function markAllNotificationsRead() {
    const readAt = new Date().toISOString();
    setNotifications((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? readAt })));
    await fetch("/api/notifications", { method: "PATCH" }).catch(() => undefined);
  }

  async function dismissNotification(id: string) {
    setNotifications((current) => current.filter((item) => item.id !== id));
    await fetch(`/api/notifications/${id}`, { method: "DELETE" }).catch(() => undefined);
  }

  return (
    <main>
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("overview")}><span className="brandMark">JF</span><span>JobFinder</span></button>
        <nav aria-label="Primary navigation">
          {navItems.map((item) => (
            <button className={view === item.id ? "active" : ""} key={item.id} onClick={() => navigate(item.id)} aria-current={view === item.id ? "page" : undefined} aria-label={item.label}>
              {item.label}
              {item.id === "opportunities" && <span className="count">{jobs.length}</span>}
              {item.id === "notifications" && notifications.some(({ readAt }) => !readAt) && <span className="count">{notifications.filter(({ readAt }) => !readAt).length}</span>}
              {item.id === "events" && <span className="count">0</span>}
            </button>
          ))}
        </nav>
        <div className={`scanStatus ${scanState}`}><span className={`pulse ${scanState}`} />{scanState === "scanning" ? "Scanning sources" : "Discovery monitor"}<br/><small>{scanMessage}</small><button onClick={scanNow} disabled={!targets.length || scanState === "scanning"}>{scanState === "scanning" ? "Scanning…" : "Scan now"}</button></div>
      </aside>

      <section className="content">
        {view === "overview" && <Overview targets={targets} sourceCount={sourceCount} jobs={jobs} onAdd={openAddCompany} onScan={scanNow} scanState={scanState} onViewTargets={() => navigate("targets")} />}
        {view === "notifications" && <NotificationsView notifications={notifications} onRead={markNotificationRead} onReadAll={markAllNotificationsRead} onDismiss={dismissNotification} />}
        {view === "targets" && <TargetsView targets={targets} showForm={showForm} editingTarget={editingTarget} errors={errors} onAddPreset={addPreset} onShowForm={() => { setEditingTarget(null); setShowForm(true); }} onHideForm={() => { setShowForm(false); setEditingTarget(null); setErrors([]); }} onSubmit={addTarget} onEdit={editTarget} onRemove={removeTarget} />}
        {view === "opportunities" && <OpportunitiesView jobs={jobs} targets={targets} scanState={scanState} scanMessage={scanMessage} onScan={scanNow} />}
        {view === "events" && <EmptyView eyebrow="Early-career calendar" title="Events" body="Information sessions, university events, workshops, hackathons, and registration deadlines will appear here." action="Manage event sources" onAction={() => navigate("targets")} />}
        {view === "applications" && <EmptyView eyebrow="Application pipeline" title="Applications" body="Applications you track will move through saved, submitted, assessment, interview, and decision stages here." action="Browse opportunities" onAction={() => navigate("opportunities")} />}
      </section>
    </main>
  );
}

function NotificationsView({ notifications, onRead, onReadAll, onDismiss }: { notifications: NotificationItem[]; onRead: (id: string) => void; onReadAll: () => void; onDismiss: (id: string) => void }) {
  const unreadCount = notifications.filter(({ readAt }) => !readAt).length;
  return <>
    <header><div><p className="eyebrow">Discovery inbox</p><h1>Notifications</h1><p className="lede">New and materially updated roles from scheduled and manual scans.</p></div>{unreadCount > 0 && <button className="ghost" onClick={onReadAll}>Mark all read</button>}</header>
    {notifications.length ? <section className="panel notificationList">{notifications.map((item) => <article className={`notification ${item.readAt ? "read" : "unread"}`} key={item.id}>
      <span className={`changeBadge ${item.kind.toLowerCase()}`}>{item.kind === "NEW" ? "New role" : "Updated"}</span>
      <div><p className="eyebrow">{item.companyName}</p><h2>{item.jobTitle}</h2><p>{new Date(item.createdAt).toLocaleString()}</p></div>
      <div className="notificationActions">{!item.readAt && <button className="textButton" onClick={() => onRead(item.id)}>Mark read</button>}<a href={item.applicationUrl} onClick={() => onRead(item.id)} target="_blank" rel="noreferrer">View role ↗</a><button className="removeButton" onClick={() => onDismiss(item.id)}>Dismiss</button></div>
    </article>)}</section> : <section className="panel emptyState"><div className="emptyGlyph">✓</div><h2>You’re all caught up</h2><p>New and changed roles will appear here after discovery scans.</p></section>}
  </>;
}

function Overview({ targets, sourceCount, jobs, onAdd, onScan, scanState, onViewTargets }: { targets: TargetCompany[]; sourceCount: number; jobs: JobPosting[]; onAdd: () => void; onScan: () => void; scanState: string; onViewTargets: () => void }) {
  return <>
    <header><div><p className="eyebrow">Opportunity radar</p><h1>Good morning.</h1><p className="lede">Your company watchlist is ready for jobs and early-career events.</p></div><button className="primary" onClick={onAdd}>+ Add company</button></header>
    <div className="metrics">
      <article><span>Target companies</span><strong>{targets.length}</strong><small>Across your watchlist</small></article>
      <article><span>Active sources</span><strong>{sourceCount}</strong><small>Career and event pages</small></article>
      <article><span>New opportunities</span><strong>{jobs.length}</strong><small>{jobs.length ? "Matching discovered roles" : "Waiting for first scan"}</small></article>
      <article><span>Applications</span><strong>0</strong><small>Nothing tracked yet</small></article>
    </div>
    <section className="panel overviewTargets">
      <div className="panelTitle"><div><p className="eyebrow">Watchlist preview</p><h2>Companies being watched</h2></div><button className="textButton" onClick={onViewTargets}>View all →</button></div>
      {targets.length ? <div className="compactList">{targets.slice(0, 3).map((target) => <div key={target.id}><span className="companyIcon">{target.name.slice(0, 2).toUpperCase()}</span><span><b>{target.name}</b><small>{target.sources.length} active source{target.sources.length === 1 ? "" : "s"}</small></span></div>)}</div> : <p className="emptyInline">No companies yet. Add one to begin watching.</p>}
    </section>
    <div className="scanCta"><div><b>Ready to check your sources?</b><span>Run an on-demand scan across all configured career pages.</span></div><button className="primary" onClick={onScan} disabled={scanState === "scanning"}>{scanState === "scanning" ? "Scanning…" : "Scan now"}</button></div>
  </>;
}

function OpportunitiesView({ jobs, targets, scanState, scanMessage, onScan }: { jobs: JobPosting[]; targets: TargetCompany[]; scanState: string; scanMessage: string; onScan: () => void }) {
  const companyName = (id: string) => targets.find((target) => target.id === id)?.name ?? "Unknown company";
  return <>
    <header><div><p className="eyebrow">Discovery feed</p><h1>Opportunities</h1><p className="lede">Normalized roles matching the filters on your watched companies.</p></div><button className="primary" onClick={onScan} disabled={scanState === "scanning"}>{scanState === "scanning" ? "Scanning…" : "Scan now"}</button></header>
    <div className={`scanBanner ${scanState}`}><span>{scanMessage}</span></div>
    {jobs.length ? <section className="panel opportunityList">{jobs.map((job) => <article className="opportunity" key={`${job.companyId}:${job.canonicalUrl}`}><div><p className="eyebrow">{companyName(job.companyId)} · {job.employmentType.replace("_", " ").toLowerCase()}</p><h2>{job.title}</h2><p>{job.locations.join(" · ") || "Location not provided"}</p></div><div className="opportunityMeta"><span>{Math.round(job.extractionConfidence * 100)}% extraction confidence</span><a href={job.applicationUrl} target="_blank" rel="noreferrer">View role ↗</a></div></article>)}</section> : <section className="panel emptyState"><div className="emptyGlyph">⌕</div><h2>No matching roles yet</h2><p>Run a scan to fetch configured career pages. Check each company’s career URL and role keywords if a known opening is missing.</p><button className="primary" onClick={onScan} disabled={scanState === "scanning"}>Scan watched companies</button></section>}
  </>;
}

function TargetsView({ targets, showForm, editingTarget, errors, onAddPreset, onShowForm, onHideForm, onSubmit, onEdit, onRemove }: { targets: TargetCompany[]; showForm: boolean; editingTarget: TargetCompany | null; errors: string[]; onAddPreset: (preset: CompanyPreset) => void; onShowForm: () => void; onHideForm: () => void; onSubmit: (event: FormEvent<HTMLFormElement>) => void; onEdit: (target: TargetCompany) => void; onRemove: (id: string) => void }) {
  return <>
    <header><div><p className="eyebrow">Configured sources</p><h1>Target companies</h1><p className="lede">Manage every company, career page, and early-career event source being watched.</p></div><button className="primary" onClick={showForm ? onHideForm : onShowForm}>{showForm ? "Close" : "+ Add company"}</button></header>
    <div className="presetGrid">{STARTER_PRESETS.map((preset) => {
      const missingCount = preset.companies.filter(({ domain }) => !targets.some((target) => target.domain === domain)).length;
      return <section className="presetCard" key={preset.id}><div className="presetMark">{preset.name.slice(0, 1)}</div><div><p className="eyebrow">Starter watchlist</p><h2>{preset.name}</h2><p>{preset.description}. Includes official career sources and editable early-career filters.</p></div><button className="ghost" onClick={() => onAddPreset(preset)} disabled={missingCount === 0}>{missingCount === 0 ? "Added" : `Add ${missingCount} companies`}</button></section>;
    })}</div>
    {showForm && <TargetForm key={editingTarget?.id ?? "new"} target={editingTarget} errors={errors} onSubmit={onSubmit} onCancel={onHideForm} />}
    <section className="panel">
      <div className="panelTitle"><div><p className="eyebrow">Active watchlist</p><h2>{targets.length} {targets.length === 1 ? "company" : "companies"}</h2></div><span className="badge">ATS agnostic</span></div>
      {targets.length ? <div className="targetList">{targets.map((target) => <article className="target" key={target.id}><div className="companyIcon">{target.name.slice(0, 2).toUpperCase()}</div><div className="targetMain"><h3>{target.name}</h3><p>{target.domain} · {target.priority.toLowerCase()} priority</p><div className="tags">{[...target.roleKeywords, ...target.eventKeywords].slice(0, 5).map((tag) => <span key={tag}>{tag}</span>)}</div></div><div className="targetActions"><div className="sourceStack">{target.sources.map((source) => <span key={source.id}><i className={source.enabled ? "online" : ""}/>{source.kind.replace("_", " ").toLowerCase()} · {source.scanCron}</span>)}</div><div><button className="editButton" onClick={() => onEdit(target)} aria-label={`Edit ${target.name}`}>Edit</button><button className="removeButton" onClick={() => onRemove(target.id)} aria-label={`Stop watching ${target.name}`}>Remove</button></div></div></article>)}</div> : <div className="emptyState"><h3>No watched companies</h3><p>Add a company and its careers page to begin.</p><button className="primary" onClick={onShowForm}>Add your first company</button></div>}
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
      <label>Scan schedule <span>UTC cron</span><input name="scanCron" aria-label="Scan schedule" defaultValue={target?.sources[0]?.scanCron ?? "* * * * *"} placeholder="* * * * *" /></label>
    </div><div className="formActions"><button type="button" className="ghost" onClick={onCancel}>Cancel</button><button className="primary" type="submit">{target ? "Save changes" : "Start watching"}</button></div>
  </form>;
}

function EmptyView({ eyebrow, title, body, action, onAction }: { eyebrow: string; title: string; body: string; action: string; onAction: () => void }) {
  return <><header><div><p className="eyebrow">{eyebrow}</p><h1>{title}</h1></div></header><section className="panel emptyState"><div className="emptyGlyph">↗</div><h2>Nothing here yet</h2><p>{body}</p><button className="primary" onClick={onAction}>{action}</button></section></>;
}
