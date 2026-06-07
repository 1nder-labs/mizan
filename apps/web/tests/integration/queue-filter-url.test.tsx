/**
 * Integration: QueueFilterBar writes back through `onSearchChange` with the
 * right shape, so the parent's URL-search wiring round-trips correctly. Drives
 * the status tabs and the free-text search bar; the category Select and country
 * combobox are Radix portals (hard to drive in jsdom), so their presence is
 * smoke-checked here and their emit is covered by the live worker query test.
 */
import { describe, expect, test, vi } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QueueSearch } from "@mizan/shared";
import { QueueFilterBar } from "../../src/components/queue/filter-bar.tsx";

const BASE_SEARCH: QueueSearch = { page: 1, sort: "updated_desc", view: "table" };

function mount(initial: QueueSearch, onSearchChange: (next: Partial<QueueSearch>) => void) {
  const { container, rerender } = render(
    <QueueFilterBar search={initial} onSearchChange={onSearchChange} />,
  );
  return {
    ui: within(container),
    rerender: (next: QueueSearch) =>
      rerender(<QueueFilterBar search={next} onSearchChange={onSearchChange} />),
  };
}

describe("<QueueFilterBar /> URL round-trip", () => {
  test("clicking the Ready status tab emits status=READY_FOR_REVIEW", async () => {
    const onSearchChange = vi.fn();
    const { ui } = mount(BASE_SEARCH, onSearchChange);
    const user = userEvent.setup();
    await user.click(ui.getByRole("tab", { name: "Ready" }));
    expect(onSearchChange).toHaveBeenCalledWith({ status: "READY_FOR_REVIEW" });
  });

  test("clicking the All tab clears the status filter", async () => {
    const onSearchChange = vi.fn();
    const { ui } = mount({ ...BASE_SEARCH, status: "READY_FOR_REVIEW" }, onSearchChange);
    const user = userEvent.setup();
    await user.click(ui.getByRole("tab", { name: "All" }));
    expect(onSearchChange).toHaveBeenCalledWith({ status: undefined });
  });

  test("typing into the search bar and submitting emits title=<value>", async () => {
    const onSearchChange = vi.fn();
    const { ui } = mount(BASE_SEARCH, onSearchChange);
    const user = userEvent.setup();
    await user.type(ui.getByLabelText("Search campaigns"), "flood relief{Enter}");
    expect(onSearchChange).toHaveBeenCalledWith({ title: "flood relief" });
  });

  test("Clear on an active search emits title=undefined", async () => {
    const onSearchChange = vi.fn();
    const { ui } = mount({ ...BASE_SEARCH, title: "flood" }, onSearchChange);
    const user = userEvent.setup();
    await user.click(ui.getByRole("button", { name: /clear/i }));
    expect(onSearchChange).toHaveBeenCalledWith({ title: undefined });
  });

  test("renders the category and country filter controls", () => {
    const onSearchChange = vi.fn();
    const { ui } = mount(BASE_SEARCH, onSearchChange);
    expect(ui.getByLabelText("Filter by category")).toBeInTheDocument();
    expect(ui.getByLabelText("Filter by country")).toBeInTheDocument();
  });

  test("external status change reflects in the active tab", async () => {
    const onSearchChange = vi.fn();
    const { ui, rerender } = mount(BASE_SEARCH, onSearchChange);
    expect(ui.getByRole("tab", { name: "All" })).toHaveAttribute("data-state", "active");
    rerender({ ...BASE_SEARCH, status: "RUNNING" });
    expect(ui.getByRole("tab", { name: "Running" })).toHaveAttribute("data-state", "active");
  });
});
