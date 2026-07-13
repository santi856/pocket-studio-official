import { describe, expect, it } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { EXAMPLE_APP_IDEAS, IdeaTextarea } from "./example-idea-picker";

describe("IdeaTextarea (Example App Ideas picker)", () => {
  it("renders every example as a real, semantic button — not decorative markup", () => {
    render(<IdeaTextarea name="text" placeholder="Describe your idea..." />);

    const group = screen.getByRole("group", { name: "Example app ideas" });
    for (const idea of EXAMPLE_APP_IDEAS) {
      expect(screen.getByRole("button", { name: idea })).toBeInTheDocument();
    }
    expect(group).toBeInTheDocument();
  });

  it("populates the textarea on a real mouse click", () => {
    render(<IdeaTextarea name="text" placeholder="Describe your idea..." />);

    fireEvent.click(screen.getByRole("button", { name: EXAMPLE_APP_IDEAS[0] }));

    expect(screen.getByRole("textbox")).toHaveValue(EXAMPLE_APP_IDEAS[0]);
  });

  it("populates the textarea via a real keyboard activation — native <button> Enter/Space semantics, no custom handler", () => {
    render(<IdeaTextarea name="text" placeholder="Describe your idea..." />);
    const chip = screen.getByRole("button", { name: EXAMPLE_APP_IDEAS[1] });

    chip.focus();
    expect(chip).toHaveFocus();
    fireEvent.keyDown(chip, { key: "Enter", code: "Enter" });
    fireEvent.click(chip); // jsdom does not synthesize the browser's native Enter→click activation

    expect(screen.getByRole("textbox")).toHaveValue(EXAMPLE_APP_IDEAS[1]);
  });

  it("keeps the populated text fully editable, not read-only", () => {
    render(<IdeaTextarea name="text" placeholder="Describe your idea..." />);

    fireEvent.click(screen.getByRole("button", { name: EXAMPLE_APP_IDEAS[0] }));
    const textarea = screen.getByRole("textbox");
    expect(textarea).not.toHaveAttribute("readonly");

    fireEvent.change(textarea, { target: { value: `${EXAMPLE_APP_IDEAS[0]} With extra detail.` } });

    expect(textarea).toHaveValue(`${EXAMPLE_APP_IDEAS[0]} With extra detail.`);
  });

  it("repeated selection is predictable — selecting the same chip twice always produces the same result", () => {
    render(<IdeaTextarea name="text" placeholder="Describe your idea..." />);
    const chip = screen.getByRole("button", { name: EXAMPLE_APP_IDEAS[0] });

    fireEvent.click(chip);
    fireEvent.change(screen.getByRole("textbox"), { target: { value: "edited away" } });
    fireEvent.click(chip);

    expect(screen.getByRole("textbox")).toHaveValue(EXAMPLE_APP_IDEAS[0]);
  });

  it("selecting a different chip cleanly replaces the text, not appends to it", () => {
    render(<IdeaTextarea name="text" placeholder="Describe your idea..." />);

    fireEvent.click(screen.getByRole("button", { name: EXAMPLE_APP_IDEAS[0] }));
    fireEvent.click(screen.getByRole("button", { name: EXAMPLE_APP_IDEAS[1] }));

    expect(screen.getByRole("textbox")).toHaveValue(EXAMPLE_APP_IDEAS[1]);
  });

  it("recoverable failure preserves input: an initialValue from a failed submission is restored, not lost", () => {
    render(
      <IdeaTextarea
        name="text"
        placeholder="Describe your idea..."
        initialValue="a too-short attempt"
      />,
    );

    expect(screen.getByRole("textbox")).toHaveValue("a too-short attempt");
  });

  it("the textarea is a real named form field a native form submission will include", () => {
    render(<IdeaTextarea name="text" placeholder="Describe your idea..." />);
    expect(screen.getByRole("textbox")).toHaveAttribute("name", "text");
  });
});
