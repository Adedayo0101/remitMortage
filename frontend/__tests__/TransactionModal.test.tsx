import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import TransactionModal from "../src/components/tx/TransactionModal";
import { formatTransactionErrorMessage } from "../src/lib/transaction-status";

describe("formatTransactionErrorMessage", () => {
  it("strips transport prefixes from submission errors", () => {
    expect(formatTransactionErrorMessage("Simulation failed: insufficient balance")).toBe(
      "insufficient balance"
    );
    expect(formatTransactionErrorMessage("Submission failed: txBadSeq")).toBe("txBadSeq");
  });

  it("rephrases Soroban host function failures", () => {
    expect(
      formatTransactionErrorMessage("Submission failed: trInvokeHostFunctionMalformed")
    ).toContain("contract rejected");
  });
});

describe("TransactionModal", () => {
  const hash = "a".repeat(64);

  it("blocks dismissal while the transaction is pending", () => {
    const onClose = jest.fn();

    render(
      <TransactionModal
        isOpen
        phase="pending"
        transactionType="Deposit"
        hash={hash}
        onClose={onClose}
      />
    );

    fireEvent.click(screen.getByTestId("transaction-modal-backdrop"));
    fireEvent.click(screen.getByLabelText(/close transaction modal/i));

    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByLabelText(/close transaction modal/i)).toBeDisabled();
    expect(screen.getByText(/locked while pending/i)).toBeInTheDocument();
  });

  it("renders both explorer links and allows closing after success", () => {
    const onClose = jest.fn();

    render(
      <TransactionModal
        isOpen
        phase="success"
        transactionType="Deposit"
        hash={hash}
        onClose={onClose}
      />
    );

    expect(screen.getByRole("link", { name: /view on stellarchain/i })).toHaveAttribute(
      "href",
      expect.stringContaining(hash)
    );
    expect(screen.getByRole("link", { name: /view on stellar expert/i })).toHaveAttribute(
      "href",
      expect.stringContaining(hash)
    );

    fireEvent.click(screen.getByRole("button", { name: /^close$/i }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows cleaned contract errors after rejection", () => {
    render(
      <TransactionModal
        isOpen
        phase="error"
        transactionType="Withdrawal"
        errorMessage="Submission failed: trInvokeHostFunctionMalformed"
        onClose={jest.fn()}
      />
    );

    expect(screen.getByRole("alert")).toHaveTextContent("The contract rejected the transaction");
  });
  it("offers a Retry Signature CTA after a rejected signature", () => {
    const onRetry = jest.fn();

    render(
      <TransactionModal
        isOpen
        phase="error"
        transactionType="Deposit"
        errorMessage="Transaction rejected by user."
        recoveryHint="Nothing was submitted. Approve the request in Freighter to continue."
        onRetry={onRetry}
        onClose={jest.fn()}
      />
    );

    expect(
      screen.getByText(/approve the request in freighter/i)
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /retry signature/i }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("disables the retry CTA while a retry is in flight", () => {
    render(
      <TransactionModal
        isOpen
        phase="error"
        transactionType="Deposit"
        errorMessage="Transaction rejected by user."
        onRetry={jest.fn()}
        retrying
        onClose={jest.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /retrying/i })).toBeDisabled();
  });

  it("omits the retry CTA when no handler is supplied", () => {
    render(
      <TransactionModal
        isOpen
        phase="error"
        transactionType="Deposit"
        errorMessage="Freighter was not detected."
        onClose={jest.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /retry signature/i })).not.toBeInTheDocument();
  });

  it("never shows the retry CTA on success", () => {
    render(
      <TransactionModal
        isOpen
        phase="success"
        transactionType="Deposit"
        onRetry={jest.fn()}
        onClose={jest.fn()}
      />
    );

    expect(screen.queryByRole("button", { name: /retry signature/i })).not.toBeInTheDocument();
  });
});
