import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import OnboardingWizard from "../src/components/onboarding/OnboardingWizard";
import { getOnboardingStore } from "../src/hooks/useOnboardingState";

// Mock the Next.js router
jest.mock("next/navigation", () => ({
  useRouter() {
    return { push: jest.fn() };
  },
}));

// Wallet is connected so the wizard can advance past step 1.
jest.mock("../src/context/WalletContext", () => ({
  useWallet: () => ({
    publicKey: "GTESTTESTTESTTESTTESTTESTTESTTESTTESTTESTTESTTESTTESTTEST",
    connect: jest.fn(),
    disconnect: jest.fn(),
  }),
}));

const setStep = (step: number) => {
  getOnboardingStore().setState({ step });
};

describe("Onboarding wizard – form validation", () => {
  beforeEach(() => {
    // Reset persisted store to a known baseline before each test.
    getOnboardingStore().setState({
      step: 1,
      recipientAddress: "",
      isVerified: false,
      savingsTarget: 10000,
      savingsDuration: 12,
      firstDepositAmount: 0,
    });
  });

  it("blocks navigation past the address step when the recipient address is invalid", async () => {
    setStep(2);
    render(<OnboardingWizard />);

    const input = screen.getByPlaceholderText("Recipient's G... address");
    fireEvent.change(input, { target: { value: "not-a-stellar-address" } });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    // An inline validation alert is shown and the step does not advance.
    await waitFor(() => expect(screen.getByText(/Invalid Stellar address/i)).toBeInTheDocument());
    expect(getOnboardingStore().getState().step).toBe(2);
  });

  it("blocks navigation past the savings-goal step when the target is below the minimum", async () => {
    setStep(3);
    render(<OnboardingWizard />);

    const target = screen.getByRole("spinbutton");
    fireEvent.change(target, { target: { value: "100" } });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => expect(screen.getByText(/at least \$500/i)).toBeInTheDocument());
    expect(getOnboardingStore().getState().step).toBe(3);
  });

  it("advances past the savings-goal step when values are valid", async () => {
    setStep(3);
    render(<OnboardingWizard />);

    const target = screen.getByRole("spinbutton");
    fireEvent.change(target, { target: { value: "25000" } });

    fireEvent.click(screen.getByRole("button", { name: /next/i }));

    await waitFor(() => expect(getOnboardingStore().getState().step).toBe(4));
  });
});
