import { describe, expect, test } from "vitest";
import { render, screen } from "@testing-library/react";
import { DocThumbnail } from "../../src/components/case/signal-bodies/photo-dup-body.tsx";

/**
 * Regression: a PDF Creator ID / category document must NOT be piped into an
 * `<img>` (which renders a broken-image box). It falls back to a labelled
 * file-type placeholder, while genuine image documents still render inline.
 */
describe("<DocThumbnail />", () => {
  test("renders a PDF placeholder (no <img>) for a PDF document", () => {
    const { container } = render(
      <DocThumbnail
        preview={{ url: "/api/raw", contentType: "application/pdf" }}
        label="Creator ID"
      />,
    );
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(container.querySelector("img")).toBeNull();
  });

  test("renders an inline <img> for an image document", () => {
    const { container } = render(
      <DocThumbnail
        preview={{ url: "/api/raw.png", contentType: "image/png" }}
        label="Creator ID"
      />,
    );
    const img = container.querySelector("img");
    expect(img).not.toBeNull();
    expect(img?.getAttribute("src")).toBe("/api/raw.png");
  });

  test("shows a loading hint before the document URL resolves", () => {
    render(<DocThumbnail preview={null} label="Creator ID" />);
    expect(screen.getByText("loading…")).toBeInTheDocument();
  });
});
