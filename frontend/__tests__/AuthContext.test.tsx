import React from "react";
import { render, screen } from "@testing-library/react";
import { AuthProvider, useAuth, getRouteRole } from "../src/context/AuthContext";

jest.mock("../src/context/WalletContext", () => ({
  WalletProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useWallet: () => ({
    publicKey: null,
    isConnected: false,
  }),
}));

function AuthConsumer() {
  const auth = useAuth();
  return (
    <div>
      <div data-testid="role">{auth.role ?? "none"}</div>
      <div data-testid="is-authorized">{String(auth.isAuthorized)}</div>
      <div data-testid="dashboard-access">{String(auth.hasAccess("/dashboard"))}</div>
      <div data-testid="invest-access">{String(auth.hasAccess("/invest"))}</div>
      <div data-testid="admin-access">{String(auth.hasAccess("/admin"))}</div>
      <div data-testid="home-access">{String(auth.hasAccess("/"))}</div>
    </div>
  );
}

describe("AuthContext", () => {
  it("returns null role and no access when not connected", () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>
    );

    expect(screen.getByTestId("role")).toHaveTextContent("none");
    expect(screen.getByTestId("is-authorized")).toHaveTextContent("false");
    expect(screen.getByTestId("dashboard-access")).toHaveTextContent("false");
    expect(screen.getByTestId("home-access")).toHaveTextContent("true");
  });
});

describe("getRouteRole", () => {
  it("returns borrower for /dashboard routes", () => {
    expect(getRouteRole("/dashboard")).toBe("borrower");
    expect(getRouteRole("/dashboard/settings")).toBe("borrower");
  });

  it("returns investor for /invest routes", () => {
    expect(getRouteRole("/invest")).toBe("investor");
    expect(getRouteRole("/invest/history")).toBe("investor");
  });

  it("returns contractor for /contractor routes", () => {
    expect(getRouteRole("/contractor")).toBe("contractor");
  });

  it("returns admin for /admin routes", () => {
    expect(getRouteRole("/admin")).toBe("admin");
  });

  it("returns all for shared routes", () => {
    expect(getRouteRole("/governance")).toBe("all");
    expect(getRouteRole("/settings")).toBe("all");
    expect(getRouteRole("/history")).toBe("all");
    expect(getRouteRole("/verify")).toBe("all");
    expect(getRouteRole("/repay")).toBe("all");
  });

  it("returns public for / and other routes", () => {
    expect(getRouteRole("/")).toBe("public");
    expect(getRouteRole("/about")).toBe("public");
    expect(getRouteRole("/faq")).toBe("public");
  });
});
