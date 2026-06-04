/**
 * Integration: the campaign intake form blocks submission of an invalid
 * (empty) form client-side and, on a valid submit, calls `createCampaign`
 * and `onDone(id)`. `portal-api` is stubbed at the module boundary; a real
 * QueryClient backs the form's mutation.
 */
import { afterEach, describe, expect, test, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { createMock, editMock } = vi.hoisted(() => ({ createMock: vi.fn(), editMock: vi.fn() }));
vi.mock("@/lib/portal-api.ts", () => ({ createCampaign: createMock, editCampaign: editMock }));
vi.mock("@/hooks/use-countries.ts", () => ({
  useCountries: () => [
    { code: "KE", name: "Kenya", flag: "" },
    { code: "US", name: "United States", flag: "" },
  ],
}));

import { IntakeForm } from "../../src/components/portal/intake-form.tsx";

afterEach(() => {
  createMock.mockReset();
  editMock.mockReset();
});

function mount(onDone: (id: string) => void): ReturnType<typeof within> {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const { container } = render(
    <QueryClientProvider client={queryClient}>
      <IntakeForm mode="create" onDone={onDone} />
    </QueryClientProvider>,
  );
  return within(container);
}

describe("<IntakeForm /> (create)", () => {
  test("blocks an empty submit without calling the API", async () => {
    const user = userEvent.setup();
    const onDone = vi.fn();
    const ui = mount(onDone);

    await user.click(ui.getByRole("button", { name: /create campaign/i }));
    await waitFor(() => expect(ui.getByLabelText(/campaign story/i)).toBeInvalid());
    expect(createMock).not.toHaveBeenCalled();
    expect(onDone).not.toHaveBeenCalled();
  });

  test("submits a valid intake to createCampaign and reports the new id", async () => {
    createMock.mockResolvedValueOnce({ id: "campaign-1", status: "DRAFT" });
    const user = userEvent.setup();
    const onDone = vi.fn();
    const ui = mount(onDone);

    await user.type(ui.getByLabelText(/campaign story/i), "Clean-water wells for the village.");
    await user.type(ui.getByLabelText(/organizer name/i), "Ahmad Hassan");

    await user.click(ui.getByLabelText("Category"));
    await user.click(await screen.findByRole("option", { name: "Food & water" }));

    await user.click(ui.getByLabelText("Country"));
    await user.click(await screen.findByRole("option", { name: "Kenya" }));

    await user.click(ui.getByRole("button", { name: /create campaign/i }));

    await waitFor(() => expect(createMock).toHaveBeenCalledTimes(1));
    expect(onDone).toHaveBeenCalledWith("campaign-1");
    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({ category: "food_security", geography: "KE" }),
    );
  });
});
