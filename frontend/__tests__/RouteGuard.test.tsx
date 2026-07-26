import React from "react";
import { render, screen } from "@testing-library/react";

const mockReplace = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mockReplace }),
  usePathname: () => "/dashboard",
}));

jest.mock("../src/context/WalletContext", () => ({
  useWallet: () => ({
    publicKey: "GABC123",
    isConnected: true,
  }),
}));

jest.mock("../src/context/AuthContext", () => ({
  ...jest.requireActual("../src/context/AuthContext"),
  useAuth: () => ({
    role: "borrower",
    isAuthorized: true,
    isLoading: false,
    hasAccess: (pathname: string) => {
      if (pathname.startsWith("/dashboard")) return true;
      if (pathname.startsWith("/admin")) return false;
      return true;
    },
    resolveRole: () => "borrower" as const,
  }),
  getRouteRole: (pathname: string) => {
    if (pathname.startsWith("/dashboard")) return "borrower" as const;
    if (pathname.startsWith("/admin")) return "admin" as const;
    return "public" as const;
  },
}));

import RouteGuard from "../src/components/RouteGuard";

describe("RouteGuard", () => {
  beforeEach(() => {
    mockReplace.mockClear();
  });

  it("renders children when user has access", () => {
    render(
      <RouteGuard>
        <div data-testid="protected-content">Dashboard Content</div>
      </RouteGuard>
    );

    expect(screen.getByTestId("protected-content")).toBeInTheDocument();
    expect(mockReplace).not.toHaveBeenCalled();
  });
});
