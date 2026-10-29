import React from "react";
import { render, screen, fireEvent } from "@testing-library/react";
import MaturityAlertOverlay from "../src/components/MaturityAlertOverlay";

describe("MaturityAlertOverlay Component", () => {
  it("renders Target Reached Alert Overlay when escrow progress is 100%", () => {
    render(
      <MaturityAlertOverlay
        escrow={{ deposited: "3000", target: "3000", progress: 100 }}
      />
    );

    expect(screen.getByText(/Down-Payment Target Fully Reached!/i)).toBeInTheDocument();
    expect(screen.getByText(/Request 70% Loan Disbursement/i)).toBeInTheDocument();
  });

  it("renders Target Approaching Alert Overlay when escrow progress is 85%", () => {
    render(
      <MaturityAlertOverlay
        escrow={{ deposited: "2550", target: "3000", progress: 85 }}
        onOpenDeposit={jest.fn()}
      />
    );

    expect(screen.getByText(/Escrow Down-Payment Target Approaching!/i)).toBeInTheDocument();
    expect(screen.getByText(/Deposit \$450 USDC/i)).toBeInTheDocument();
  });

  it("renders Missed Payment Warning Overlay when loan has missed payments", () => {
    render(
      <MaturityAlertOverlay
        escrow={{ deposited: "1000", target: "3000", progress: 33 }}
        loan={{ status: "Repaying", missedPayments: 1 }}
      />
    );

    expect(screen.getByText(/Action Required: Scheduled Payment Missed/i)).toBeInTheDocument();
    expect(screen.getByText(/Make Payment Now/i)).toBeInTheDocument();
  });

  it("allows dismissing an alert overlay", () => {
    render(
      <MaturityAlertOverlay
        escrow={{ deposited: "3000", target: "3000", progress: 100 }}
      />
    );

    const dismissBtn = screen.getByText("Dismiss");
    fireEvent.click(dismissBtn);

    expect(screen.queryByText(/Down-Payment Target Fully Reached!/i)).not.toBeInTheDocument();
  });
});
