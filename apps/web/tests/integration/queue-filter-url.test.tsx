/**
 * Integration: QueueFilterBar writes back through `onSearchChange`
 * with the right shape, so the parent's URL-search wiring round-trips
 * correctly. Drives status tabs, category text filter, geography
 * text filter, and the clear button.
 */
import { describe, expect, test, vi } from "vitest";
import { render, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { QueueSearch } from "@mizan/shared";
import { QueueFilterBar } from "../../src/components/queue/filter-bar.tsx";

const BASE_SEARCH: QueueSearch = { page: 1, sort: "updated_desc" };

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

  test("typing into the category input and submitting emits category=<value>", async () => {
    const onSearchChange = vi.fn();
    const { ui } = mount(BASE_SEARCH, onSearchChange);
    const user = userEvent.setup();
    const input = ui.getByLabelText("Filter by category");
    await user.type(input, "humanitarian{Enter}");
    expect(onSearchChange).toHaveBeenCalledWith({ category: "humanitarian" });
  });

  test("typing into the geography input emits geography=<value>", async () => {
    const onSearchChange = vi.fn();
    const { ui } = mount(BASE_SEARCH, onSearchChange);
    const user = userEvent.setup();
    const input = ui.getByLabelText("Filter by geography");
    await user.type(input, "PS{Enter}");
    expect(onSearchChange).toHaveBeenCalledWith({ geography: "PS" });
  });

  test("Clear button on active category emits undefined", async () => {
    const onSearchChange = vi.fn();
    const { ui } = mount({ ...BASE_SEARCH, category: "humanitarian" }, onSearchChange);
    const user = userEvent.setup();
    const clears = ui.getAllByRole("button", { name: /clear/i });
    await user.click(clears[0]!);
    expect(onSearchChange).toHaveBeenCalledWith({ category: undefined });
  });

  test("external status change reflects in the active tab", async () => {
    const onSearchChange = vi.fn();
    const { ui, rerender } = mount(BASE_SEARCH, onSearchChange);
    expect(ui.getByRole("tab", { name: "All" })).toHaveAttribute("data-state", "active");
    rerender({ ...BASE_SEARCH, status: "RUNNING" });
    expect(ui.getByRole("tab", { name: "Running" })).toHaveAttribute("data-state", "active");
  });
});
