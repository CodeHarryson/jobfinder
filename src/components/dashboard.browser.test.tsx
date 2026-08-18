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
    const scanResult = {
      jobs: [{
        kind: "JOB", id: "job-1", companyId: "demo-1", sourceId: "s1",
        sourceUrl: "https://northstar.example/careers", canonicalUrl: "https://northstar.example/jobs/intern",
        applicationUrl: "https://northstar.example/jobs/intern", title: "Software Engineering Intern",
        description: "Build useful products", locations: ["New York, NY"], employmentType: "INTERNSHIP",
        firstSeenAt: "2026-08-14T00:00:00.000Z", lastSeenAt: "2026-08-14T00:00:00.000Z",
        contentFingerprint: "abc", extractionConfidence: 0.95,
      }], failures: [], scannedAt: "2026-08-14T00:00:00.000Z",
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
      const url = String(input);
      const payload = url === "/api/targets"
        ? { targets: [] }
        : url === "/api/opportunities"
          ? { jobs: [] }
          : init?.method === "POST" && url === "/api/discovery/scan"
            ? scanResult
            : {};

      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getAllByRole("button", { name: "Scan now" })[0]);
    expect(await screen.findByRole("heading", { level: 2, name: "Software Engineering Intern" })).toBeTruthy();
    expect(screen.getByText("95% extraction confidence")).toBeTruthy();
    await waitFor(() => expect(window.localStorage.getItem("jobfinder.opportunities.v1")).toContain("Software Engineering Intern"));
  });

  test("shows unread discovery notifications and supports read and dismiss actions", async () => {
    const notification = {
      id: "notice-1", jobId: "job-1", companyId: "demo-1", kind: "NEW", createdAt: "2026-08-17T00:00:00.000Z",
      readAt: null, companyName: "Northstar Labs", jobTitle: "Software Engineering Intern", applicationUrl: "https://northstar.example/jobs/intern",
    };
    vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const url = String(input);
      const payload = url === "/api/targets" ? { targets: [] } : url === "/api/opportunities" ? { jobs: [] } : url === "/api/notifications" ? { notifications: [notification] } : {};
      return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
    });
    const user = userEvent.setup();
    render(<Dashboard />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Notifications" }).textContent).toContain("1"));
    await user.click(screen.getByRole("button", { name: "Notifications" }));
    expect(screen.getByRole("heading", { level: 2, name: "Software Engineering Intern" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "Mark read" }));
    expect(screen.queryByRole("button", { name: "Mark read" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.getByRole("heading", { level: 2, name: "You’re all caught up" })).toBeTruthy();
  });

  test("adds the MAANGO starter watchlist without duplicates", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "Target companies" }));
    await user.click(screen.getByRole("button", { name: "Add 6 companies" }));

    for (const company of ["Meta", "Apple", "Amazon", "Netflix", "Google", "Oracle"]) {
      expect(screen.getByRole("heading", { level: 3, name: company })).toBeTruthy();
    }
    expect((screen.getByRole("button", { name: "Added" }) as HTMLButtonElement).disabled).toBe(true);
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toContain("metacareers.com"));
  });

  test("adds the unicorn and scale-up starter watchlist", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "Target companies" }));
    await user.click(screen.getByRole("button", { name: "Add 10 companies" }));

    for (const company of ["Together AI", "Stripe", "Notion", "Anthropic", "OpenAI", "Databricks", "Canva", "Rippling", "Ramp", "Anduril"]) {
      expect(screen.getByRole("heading", { level: 3, name: company })).toBeTruthy();
    }
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toContain("together.ai"));
  });

  test("adds the curated top-tech starter watchlist", async () => {
    const user = userEvent.setup();
    render(<Dashboard />);

    await user.click(screen.getByRole("button", { name: "Target companies" }));
    await user.click(screen.getByRole("button", { name: "Add 15 companies" }));

    for (const company of ["NVIDIA", "Microsoft", "OpenAI", "Anthropic", "Cloudflare", "Snowflake", "Adobe", "Uber"]) {
      expect(screen.getByRole("heading", { level: 3, name: company })).toBeTruthy();
    }
    await waitFor(() => expect(window.localStorage.getItem(STORAGE_KEY)).toContain("nvidia.com"));
  });
});
