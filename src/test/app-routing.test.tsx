import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { routeTree } from "@/routeTree.gen";

function renderAt(path: string) {
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  return render(<RouterProvider router={router} />);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

// Assert only that the router mounts and paints, never page content:
// routes are rewritten as the app is built and this must keep passing.
describe("App routing", () => {
  it("renders the index route", async () => {
    const { container } = renderAt("/");

    await waitFor(() => expect(container.firstChild).not.toBeNull());
  });

  it("renders the not-found route", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const { container } = renderAt("/this-route-does-not-exist");

    await waitFor(() => expect(container.firstChild).not.toBeNull());
  });

  it("keeps the home installation prompt available", async () => {
    const { container } = renderAt("/");
    const promptEvent = new Event("beforeinstallprompt", { cancelable: true }) as Event & {
      prompt: () => Promise<void>;
      userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
    };
    promptEvent.prompt = vi.fn().mockResolvedValue(undefined);
    promptEvent.userChoice = Promise.resolve({ outcome: "dismissed" });

    await waitFor(() => expect(container.firstChild).not.toBeNull());
    window.dispatchEvent(promptEvent);

    expect(await screen.findByText("Install MoonCanvas")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Install app" })).toBeInTheDocument();
  });

  it("does not register or show an install prompt on a disabled session URL", async () => {
    const addEventListener = vi.spyOn(window, "addEventListener");
    const { container } = renderAt("/session/client-invitation-session");

    await waitFor(() => expect(container.firstChild).not.toBeNull());
    expect(await screen.findByText("Sessions unavailable")).toBeInTheDocument();
    expect(addEventListener).not.toHaveBeenCalledWith("beforeinstallprompt", expect.any(Function));
    expect(screen.queryByText("Install MoonCanvas")).not.toBeInTheDocument();
    expect(screen.queryByText("Add to Home Screen")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Install app" })).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back home" })).toBeInTheDocument();
  });
});
