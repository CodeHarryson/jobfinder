import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { Dashboard } from "./dashboard";

const STORAGE_KEY = "jobfinder.target-companies.v1";

beforeEach(() => window.localStorage.clear());
afterEach(cleanup);

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
});
