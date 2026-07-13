import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ComponentRenderer } from "./component-renderer";
import type { ComponentNode } from "@/lib/generation/component-registry";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

describe("ComponentRenderer", () => {
  it("renders a Screen tree of real, semantic DOM elements — not a static preview image", () => {
    const node: ComponentNode = {
      type: "Screen",
      props: { name: "Home" },
      children: [
        { type: "Heading", props: { text: "Welcome" } },
        { type: "Text", props: { value: "Book your next detail." } },
      ],
    };

    render(<ComponentRenderer node={node} />);

    expect(screen.getByRole("heading", { name: "Welcome" })).toBeInTheDocument();
    expect(screen.getByText("Book your next detail.")).toBeInTheDocument();
  });

  it("fires a real onAction callback with the button's label when clicked", () => {
    const onAction = vi.fn();
    const node: ComponentNode = { type: "Button", props: { label: "Book now" } };

    render(<ComponentRenderer node={node} onAction={onAction} />);
    fireEvent.click(screen.getByRole("button", { name: "Book now" }));

    expect(onAction).toHaveBeenCalledWith("Book now");
  });

  it("renders a Form whose Button becomes a real submit control instead of firing onAction", () => {
    const onAction = vi.fn();
    const action = vi.fn();
    const node: ComponentNode = {
      type: "Form",
      children: [
        { type: "Input", props: { name: "email" } },
        { type: "Button", props: { label: "Submit" } },
      ],
    };

    render(<ComponentRenderer node={node} action={action} onAction={onAction} />);

    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).toHaveAttribute("type", "submit");
  });

  it("submits real field values via the native form action, using each Input's own name", async () => {
    let captured: FormData | undefined;
    const action = vi.fn((formData: FormData) => {
      captured = formData;
    });
    const node: ComponentNode = {
      type: "Form",
      children: [
        { type: "Input", props: { name: "email" } },
        { type: "Button", props: { label: "Submit" } },
      ],
    };

    render(<ComponentRenderer node={node} action={action} />);

    const input = screen.getByRole("textbox") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "customer@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Submit" }));

    expect(action).toHaveBeenCalled();
    expect(captured?.get("email")).toBe("customer@example.com");
  });

  it("disables the submit button while its own submission is pending, using React's real form-status lifecycle", async () => {
    let resolveAction: () => void = () => {};
    const action = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveAction = resolve;
        }),
    );
    const node: ComponentNode = {
      type: "Form",
      children: [
        { type: "Input", props: { name: "email" } },
        { type: "Button", props: { label: "Submit" } },
      ],
    };

    render(<ComponentRenderer node={node} action={action} />);
    const button = screen.getByRole("button", { name: "Submit" });
    expect(button).not.toBeDisabled();

    fireEvent.click(button);

    await waitFor(() => expect(screen.getByRole("button", { name: "Submitting…" })).toBeDisabled());

    resolveAction();

    await waitFor(() => expect(screen.getByRole("button", { name: "Submit" })).not.toBeDisabled());
  });

  it("renders List items from real data, not a hardcoded placeholder", () => {
    const node: ComponentNode = { type: "List", props: { items: ["Booking #1", "Booking #2"] } };

    render(<ComponentRenderer node={node} />);

    expect(screen.getByText("Booking #1")).toBeInTheDocument();
    expect(screen.getByText("Booking #2")).toBeInTheDocument();
  });

  it("renders an empty-state message when a List has no items", () => {
    const node: ComponentNode = { type: "List", props: { items: [] } };

    render(<ComponentRenderer node={node} />);

    expect(screen.getByText("No items.")).toBeInTheDocument();
  });

  it("renders LoadingState, EmptyState, and ErrorState with real ARIA roles", () => {
    const { rerender } = render(
      <ComponentRenderer
        node={{ type: "LoadingState", props: { message: "Loading bookings…" } }}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Loading bookings…");

    rerender(
      <ComponentRenderer node={{ type: "ErrorState", props: { message: "Could not load." } }} />,
    );
    expect(screen.getByRole("alert")).toHaveTextContent("Could not load.");
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    rerender(
      <ComponentRenderer node={{ type: "EmptyState", props: { message: "No bookings yet." } }} />,
    );
    expect(screen.getByText("No bookings yet.")).toBeInTheDocument();
  });

  it("ErrorState's real Retry button re-runs the current route via router.refresh(), not a decorative click", () => {
    refresh.mockClear();
    render(
      <ComponentRenderer node={{ type: "ErrorState", props: { message: "Could not load." } }} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("Tabs switch the visible panel on real user interaction, not on mount only", () => {
    const node: ComponentNode = {
      type: "Tabs",
      children: [
        { type: "Text", props: { value: "Panel A" } },
        { type: "Text", props: { value: "Panel B" } },
      ],
    };

    render(<ComponentRenderer node={node} />);

    expect(screen.getByText("Panel A")).toBeInTheDocument();
    expect(screen.queryByText("Panel B")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("tab", { name: "Tab 2" }));

    expect(screen.getByText("Panel B")).toBeInTheDocument();
    expect(screen.queryByText("Panel A")).not.toBeInTheDocument();
  });

  it("Modal starts closed and reveals its children only after a real click opens it", () => {
    const node: ComponentNode = {
      type: "Modal",
      props: { label: "View details" },
      children: [{ type: "Text", props: { value: "Modal contents" } }],
    };

    render(<ComponentRenderer node={node} />);

    expect(screen.queryByText("Modal contents")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View details" }));

    expect(screen.getByText("Modal contents")).toBeInTheDocument();
    expect(screen.getByRole("dialog")).toBeInTheDocument();
  });
});
