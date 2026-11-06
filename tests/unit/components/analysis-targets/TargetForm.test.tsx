import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";

import { TargetForm } from "@/components/analysis-targets/TargetForm";
import { AnalysisTargetCreationError } from "@/lib/api/analysis-targets";
import type { CreateAnalysisTarget } from "@/types/analysis-target";

const mockPush = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: mockPush }),
}));

const validSourceUrl = "https://www.google.com/maps/place/NJIT/@40.742,-74.179,17z";

function fillValidForm() {
  fireEvent.change(screen.getByLabelText(/target name/i), {
    target: { value: "  NJIT, Newark  " },
  });
  fireEvent.change(screen.getByLabelText(/google maps source url/i), {
    target: { value: `  ${validSourceUrl}  ` },
  });
}

function submitForm() {
  fireEvent.click(screen.getByRole("button", { name: "Create target" }));
}

describe("TargetForm", () => {
  beforeEach(() => {
    mockPush.mockReset();
  });

  it("renders the required fields, fixed platform, help, and actions", () => {
    render(<TargetForm createTarget={jest.fn()} />);

    expect(screen.getByLabelText(/target name/i)).toHaveAttribute("aria-required", "true");
    expect(screen.getByLabelText("Review platform")).toHaveValue("Google Maps");
    expect(screen.getByLabelText("Review platform")).toHaveAttribute("readonly");
    expect(screen.getByLabelText(/google maps source url/i)).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(screen.getByRole("button", { name: "Cancel" })).toBeInTheDocument();
    expect(
      screen.getByText(
        (_, element) => element?.tagName === "P" && element.textContent === "* Required",
      ),
    ).toBeInTheDocument();
  });

  it("shows both required errors and focuses the target name first", () => {
    const createTarget = jest.fn();
    render(<TargetForm createTarget={createTarget} />);

    submitForm();

    expect(screen.getByText("Enter a name for this target.")).toBeInTheDocument();
    expect(screen.getByText("Enter the Google Maps link for this target.")).toBeInTheDocument();
    const summary = screen
      .getByText("Please fix the highlighted fields.")
      .closest('[role="alert"]');
    expect(summary).not.toBeNull();
    expect(screen.getAllByRole("img", { name: "Error" })).toHaveLength(2);
    expect(screen.getByLabelText(/target name/i)).toHaveFocus();
    expect(createTarget).not.toHaveBeenCalled();
  });

  it("does not validate untouched fields before the first failed submission", () => {
    render(<TargetForm createTarget={jest.fn()} />);
    const sourceUrlInput = screen.getByLabelText(/google maps source url/i);

    fireEvent.change(sourceUrlInput, { target: { value: "not a URL" } });
    fireEvent.blur(sourceUrlInput);

    expect(screen.queryByText(/doesn't look like a valid web address/i)).not.toBeInTheDocument();
    expect(sourceUrlInput).toHaveAttribute("aria-invalid", "false");
  });

  it("revalidates affected fields on change after the first failed submission", () => {
    render(<TargetForm createTarget={jest.fn()} />);
    submitForm();

    const nameInput = screen.getByLabelText(/target name/i);
    const sourceUrlInput = screen.getByLabelText(/google maps source url/i);

    fireEvent.change(sourceUrlInput, { target: { value: "not a URL" } });

    expect(
      screen.queryByText("Enter the Google Maps link for this target."),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "That doesn't look like a valid web address. Paste the full link, starting with https://.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Please fix the highlighted fields.")).toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: "NJIT" } });

    expect(screen.queryByText("Enter a name for this target.")).not.toBeInTheDocument();
    expect(screen.queryByText("Please fix the highlighted fields.")).not.toBeInTheDocument();

    fireEvent.change(nameInput, { target: { value: "a".repeat(121) } });

    expect(screen.getByText("Target names can be up to 120 characters.")).toBeInTheDocument();
    expect(screen.getByText("Please fix the highlighted fields.")).toBeInTheDocument();
  });

  it("focuses the missing source URL when the name is valid", () => {
    render(<TargetForm createTarget={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/target name/i), { target: { value: "NJIT" } });

    submitForm();

    expect(screen.getByText("Enter the Google Maps link for this target.")).toBeInTheDocument();
    expect(screen.getByLabelText(/google maps source url/i)).toHaveFocus();
  });

  it.each([
    [
      "malformed",
      "not a URL",
      "That doesn't look like a valid web address. Paste the full link, starting with https://.",
    ],
    [
      "unsupported",
      "https://example.com/maps/place/NJIT",
      "This link isn't a Google Maps link. Open the business in Google Maps and copy its link.",
    ],
    [
      "missing a business identifier",
      "https://www.google.com/maps",
      "This Google Maps link doesn't identify a business. Open a specific business and copy its link.",
    ],
    [
      "shortened Google Maps",
      "https://maps.app.goo.gl/abc123",
      "Shortened Google Maps links aren't supported yet. Open the full Google Maps URL in your browser and copy it from the address bar.",
    ],
  ])("shows a field-level error for a %s source URL", (_case, sourceUrl, message) => {
    render(<TargetForm createTarget={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/target name/i), { target: { value: "NJIT" } });
    fireEvent.change(screen.getByLabelText(/google maps source url/i), {
      target: { value: sourceUrl },
    });

    submitForm();

    expect(screen.getByText(message)).toBeInTheDocument();
    const inlineError = screen.getByText(message).closest('[role="alert"]');
    expect(inlineError).toBeInstanceOf(HTMLElement);
    expect(
      within(inlineError as HTMLElement).getByRole("img", { name: "Error" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/google maps source url/i)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
  });

  it("enforces the 120-character target-name boundary", () => {
    render(<TargetForm createTarget={jest.fn()} />);
    fireEvent.change(screen.getByLabelText(/target name/i), {
      target: { value: "a".repeat(121) },
    });
    fireEvent.change(screen.getByLabelText(/google maps source url/i), {
      target: { value: validSourceUrl },
    });

    submitForm();

    expect(screen.getByText("Target names can be up to 120 characters.")).toBeInTheDocument();
    expect(screen.getByText("121/120")).toBeInTheDocument();
  });

  it("rejects target names containing unsafe control characters", () => {
    const createTarget = jest.fn();
    render(<TargetForm createTarget={createTarget} />);
    fireEvent.change(screen.getByLabelText(/target name/i), {
      target: { value: "NJ\u0007IT" },
    });
    fireEvent.change(screen.getByLabelText(/google maps source url/i), {
      target: { value: validSourceUrl },
    });

    submitForm();

    expect(screen.getByText("Target names can't contain control characters.")).toBeInTheDocument();
    expect(screen.getByLabelText(/target name/i)).toHaveFocus();
    expect(createTarget).not.toHaveBeenCalled();
  });

  it("treats a target name made only of invisible format characters and joiners as missing", () => {
    const createTarget = jest.fn();
    render(<TargetForm createTarget={createTarget} />);
    fireEvent.change(screen.getByLabelText(/target name/i), {
      target: { value: "\u200b\u200c\u200d\u2060\ufeff" },
    });
    fireEvent.change(screen.getByLabelText(/google maps source url/i), {
      target: { value: validSourceUrl },
    });

    submitForm();

    expect(screen.getByText("Enter a name for this target.")).toBeInTheDocument();
    expect(screen.getByLabelText(/target name/i)).toHaveFocus();
    expect(createTarget).not.toHaveBeenCalled();
  });

  it.each([
    ["family emoji with ZWJ", "Family 👨\u200d👩\u200d👧\u200d👦"],
    ["Persian text with ZWNJ", "می\u200cروم"],
  ])("preserves a meaningful target name containing %s", async (_case, name) => {
    const createTarget: jest.MockedFunction<CreateAnalysisTarget> = jest.fn().mockResolvedValue({
      id: "target-1",
      name,
      sourceUrl: validSourceUrl,
      platform: "google_maps",
    });
    render(<TargetForm createTarget={createTarget} />);
    fireEvent.change(screen.getByLabelText(/target name/i), { target: { value: name } });
    fireEvent.change(screen.getByLabelText(/google maps source url/i), {
      target: { value: validSourceUrl },
    });

    submitForm();

    await waitFor(() =>
      expect(createTarget).toHaveBeenCalledWith({
        name,
        sourceUrl: validSourceUrl,
        platform: "google_maps",
      }),
    );
  });

  it("shows the source URL length limit without submitting", () => {
    const createTarget = jest.fn();
    const prefix = `${validSourceUrl}?data=`;
    const overlongSourceUrl = `${prefix}${"a".repeat(2_049 - prefix.length)}`;
    render(<TargetForm createTarget={createTarget} />);
    fireEvent.change(screen.getByLabelText(/target name/i), { target: { value: "NJIT" } });
    fireEvent.change(screen.getByLabelText(/google maps source url/i), {
      target: { value: overlongSourceUrl },
    });

    submitForm();

    expect(
      screen.getByText("Google Maps links can be up to 2,048 characters."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/google maps source url/i)).toHaveFocus();
    expect(createTarget).not.toHaveBeenCalled();
  });

  it("rejects a source URL whose canonical encoding exceeds the length limit", () => {
    const createTarget = jest.fn();
    const prefix = "https://www.google.com/maps/place/";
    const sourceUrl = `${prefix}${"é".repeat(2_048 - prefix.length)}`;
    render(<TargetForm createTarget={createTarget} />);
    fireEvent.change(screen.getByLabelText(/target name/i), { target: { value: "NJIT" } });
    fireEvent.change(screen.getByLabelText(/google maps source url/i), {
      target: { value: sourceUrl },
    });

    submitForm();

    expect(sourceUrl).toHaveLength(2_048);
    expect(new URL(sourceUrl).href.length).toBeGreaterThan(2_048);
    expect(
      screen.getByText("Google Maps links can be up to 2,048 characters."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/google maps source url/i)).toHaveFocus();
    expect(createTarget).not.toHaveBeenCalled();
  });

  it("submits the canonical URL returned by the shared validator", async () => {
    const createTarget: jest.MockedFunction<CreateAnalysisTarget> = jest.fn().mockResolvedValue({
      id: "target-1",
      name: "NJIT",
      sourceUrl: validSourceUrl,
      platform: "google_maps",
    });
    render(<TargetForm createTarget={createTarget} />);
    fireEvent.change(screen.getByLabelText(/target name/i), { target: { value: "NJIT" } });
    fireEvent.change(screen.getByLabelText(/google maps source url/i), {
      target: { value: "https:www.google.com/maps/place/NJIT/@40.742,-74.179,17z" },
    });

    submitForm();

    await waitFor(() =>
      expect(createTarget).toHaveBeenCalledWith({
        name: "NJIT",
        sourceUrl: validSourceUrl,
        platform: "google_maps",
      }),
    );
  });

  it("submits normalized data and shows an accessible confirmation without broken navigation", async () => {
    const createTarget: jest.MockedFunction<CreateAnalysisTarget> = jest.fn().mockResolvedValue({
      id: "target/with spaces",
      name: "NJIT, Newark",
      sourceUrl: validSourceUrl,
      platform: "google_maps",
    });
    render(<TargetForm createTarget={createTarget} />);
    fillValidForm();

    submitForm();

    await waitFor(() =>
      expect(createTarget).toHaveBeenCalledWith({
        name: "NJIT, Newark",
        sourceUrl: validSourceUrl,
        platform: "google_maps",
      }),
    );
    const confirmation = await screen.findByRole("status");
    expect(within(confirmation).getByText("Target created")).toBeInTheDocument();
    expect(within(confirmation).getByText("NJIT, Newark")).toBeInTheDocument();
    expect(within(confirmation).getByText("target/with spaces")).toBeInTheDocument();
    expect(within(confirmation).getByText(validSourceUrl)).toBeInTheDocument();
    expect(
      within(confirmation).getByText("Workspace access will be available in a future update."),
    ).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Create target" })).not.toBeInTheDocument();
  });

  it("disables duplicate submissions and shows a loading state", async () => {
    let resolveCreation: ((value: Awaited<ReturnType<CreateAnalysisTarget>>) => void) | undefined;
    const createTarget: jest.MockedFunction<CreateAnalysisTarget> = jest.fn((input) => {
      void input;
      return new Promise((resolve) => {
        resolveCreation = resolve;
      });
    });
    render(<TargetForm createTarget={createTarget} />);
    fillValidForm();

    const form = screen.getByRole("button", { name: "Create target" }).closest("form");
    expect(form).not.toBeNull();
    fireEvent.submit(form!);
    fireEvent.submit(form!);

    expect(createTarget).toHaveBeenCalledTimes(1);
    const loadingButton = screen.getByRole("button", { name: /creating target/i });
    expect(loadingButton).toBeDisabled();
    const spinner = loadingButton.querySelector('span[aria-hidden="true"]');
    expect(spinner).toHaveClass("motion-safe:animate-spin");
    expect(spinner).not.toHaveClass("animate-spin");
    expect(form).toHaveAttribute("aria-busy", "true");

    resolveCreation?.({
      id: "target-1",
      name: "NJIT, Newark",
      sourceUrl: validSourceUrl,
      platform: "google_maps",
    });
    expect(await screen.findByRole("status")).toHaveTextContent("Target created");
    expect(createTarget).toHaveBeenCalledTimes(1);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("preserves input and shows an understandable request failure", async () => {
    const createTarget = jest
      .fn()
      .mockRejectedValue(
        new AnalysisTargetCreationError(
          "CREATION_UNAVAILABLE",
          "Target creation is temporarily unavailable. Please try again later.",
        ),
      );
    render(<TargetForm createTarget={createTarget} />);
    fillValidForm();

    submitForm();

    expect(
      await screen.findByText(
        "Target creation is temporarily unavailable. Please try again later.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/target name/i)).toHaveValue("  NJIT, Newark  ");
    expect(screen.getByLabelText(/google maps source url/i)).toHaveValue(validSourceUrl);
    expect(screen.getByRole("button", { name: "Create target" })).toBeEnabled();
  });

  it("preserves input when authentication is temporarily unavailable", async () => {
    const createTarget = jest
      .fn()
      .mockRejectedValue(
        new AnalysisTargetCreationError(
          "AUTHENTICATION_UNAVAILABLE",
          "Authentication is temporarily unavailable. Please try again later.",
        ),
      );
    render(<TargetForm createTarget={createTarget} />);
    fillValidForm();

    submitForm();

    expect(
      await screen.findByText("Authentication is temporarily unavailable. Please try again later."),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/target name/i)).toHaveValue("  NJIT, Newark  ");
    expect(screen.getByLabelText(/google maps source url/i)).toHaveValue(validSourceUrl);
    expect(mockPush).not.toHaveBeenCalled();
  });

  it("maps authoritative server validation errors back to the field and focuses it", async () => {
    const createTarget = jest.fn().mockRejectedValue(
      new AnalysisTargetCreationError(
        "INVALID_ANALYSIS_TARGET_INPUT",
        "Please fix the highlighted fields.",
        [
          {
            field: "sourceUrl",
            code: "SOURCE_URL_UNSUPPORTED_PLATFORM",
            message: "The server no longer supports this source URL.",
          },
        ],
      ),
    );
    render(<TargetForm createTarget={createTarget} />);
    fillValidForm();

    submitForm();

    expect(
      await screen.findByText("The server no longer supports this source URL."),
    ).toBeInTheDocument();
    const sourceUrlInput = screen.getByLabelText(/google maps source url/i);
    expect(sourceUrlInput).toHaveFocus();

    fireEvent.blur(sourceUrlInput);

    await waitFor(() =>
      expect(
        screen.queryByText("The server no longer supports this source URL."),
      ).not.toBeInTheDocument(),
    );
    expect(sourceUrlInput).toHaveAttribute("aria-invalid", "false");
  });

  it("redirects an expired session to sign-in with the return path", async () => {
    const createTarget = jest
      .fn()
      .mockRejectedValue(
        new AnalysisTargetCreationError(
          "AUTHENTICATION_REQUIRED",
          "Your session has expired. Please sign in again.",
        ),
      );
    render(<TargetForm createTarget={createTarget} />);
    fillValidForm();

    submitForm();

    await waitFor(() =>
      expect(mockPush).toHaveBeenCalledWith("/login?next=%2Fanalysis-targets%2Fnew"),
    );
  });

  it("returns to the existing home route when cancelled", () => {
    render(<TargetForm createTarget={jest.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(mockPush).toHaveBeenCalledWith("/");
  });
});
