import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import { Dashboard } from "./dashboard";

const STORAGE_KEY = "jobfinder.target-companies.v1";

beforeEach(() => window.localStorage.clear());
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe("Dashboard navigation and watched companies", () => {
  test("opens every sidebar view", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    for (const [button, heading] of [
      ["Opportunities", "Opportunities"],
      ["Early-career events", "Events"],
      ["Applications", "Applications"],
      ["Target companies", "Target companies"],
      ["Overview", "Good morning."],
    ]) {
      await user.click(screen.getByRole("button", { name: button }));
      expect(screen.getByRole("heading", { level: 1, name: heading })).toBeTruthy();
    }
  });

  test("adds a watched company and restores it after remount", async () => {
    const user = userEvent.setup();
    const firstRender = render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "+ Add company" }));
    expect(screen.getByRole("heading", { level: 1, name: "Target companies" })).toBeTruthy();

    await user.type(screen.getByLabelText("Company name"), "Synapse Systems");
    await user.type(screen.getByLabelText("Company domain"), "synapse.test");
    await user.type(screen.getByLabelText("Career page URL"), "https://synapse.test/careers");
    await user.type(screen.getByLabelText(/Events URL/), "https://synapse.test/students/events");
    await user.type(screen.getByLabelText("Role keywords"), "intern, new grad");
    await user.click(screen.getByRole("button", { name: "Start watching" }));

    expect(screen.getByRole("heading", { level: 3, name: "Synapse Systems" })).toBeTruthy();
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Synapse Systems"));

    firstRender.unmount();
    render(<Dashboard />);
    await user.click(screen.getByRole("button", { name: "Target companies" }));
    expect(await screen.findByRole("heading", { level: 3, name: "Synapse Systems" })).toBeTruthy();
  });

  test("edits an existing company and persists the changes", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "Target companies" }));
    await user.click(screen.getByRole("button", { name: "Edit Northstar Labs" }));
    const name = screen.getByLabelText("Company name");
    await user.clear(name);
    await user.type(name, "Northstar Technologies");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(screen.getByRole("heading", { level: 3, name: "Northstar Technologies" })).toBeTruthy();
    expect(screen.queryByRole("heading", { level: 3, name: "Northstar Labs" })).toBeNull();
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toContain("Northstar Technologies"));
  });

  test("scans configured sources and displays normalized opportunities", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      jobs: [{
        kind: "JOB", id: "job-1", companyId: "demo-1", sourceId: "s1",
        sourceUrl: "https://northstar.example/careers", canonicalUrl: "https://northstar.example/jobs/intern",
        applicationUrl: "https://northstar.example/jobs/intern", title: "Software Engineering Intern",
        description: "Build useful products", locations: ["New York, NY"], employmentType: "INTERNSHIP",
        firstSeenAt: "2026-08-14T00:00:00.000Z", lastSeenAt: "2026-08-14T00:00:00.000Z",
        contentFingerprint: "abc", extractionConfidence: 0.95,
      }], failures: [], scannedAt: "2026-08-14T00:00:00.000Z",
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getAllByRole("button", { name: "Scan now" })[0]);
    expect(await screen.findByRole("heading", { level: 2, name: "Software Engineering Intern" })).toBeTruthy();
    expect(screen.getByText("95% extraction confidence")).toBeTruthy();
    await waitFor(() => expect(window.localStorage.getItem("jobfinder.opportunities.v1")).toContain("Software Engineering Intern"));
  });
});
