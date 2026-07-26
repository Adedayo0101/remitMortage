import React from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";

// Horizon is only used for the balance lookup; stub it so no network call runs.
jest.mock("@stellar/stellar-sdk", () => {
  class FakeServer {
    accounts() {
      return {
        accountId: () => ({
          call: async () => ({ balances: [{ asset_code: "USDC", balance: "25.5" }] }),
        }),
      };
    }
  }
  return {
    Horizon: { Server: FakeServer },
    Networks: {
      TESTNET: "Test SDF Network ; September 2015",
      PUBLIC: "Public Global Stellar Network ; September 2015",
      FUTURENET: "Test SDF Future Network ; October 2022",
    },
  };
});

import { WalletProvider, useWallet } from "../src/context/WalletContext";

const ACCOUNT = "GABCDEF1234567890";
const OTHER_ACCOUNT = "GZYXWVU0987654321";

type FreighterMock = {
  requestAccess: jest.Mock;
  getPublicKey: jest.Mock;
  getNetwork: jest.Mock;
  isConnected: jest.Mock;
  isAllowed: jest.Mock;
};

function installFreighter(): FreighterMock {
  const freighter: FreighterMock = {
    requestAccess: jest.fn().mockResolvedValue(undefined),
    getPublicKey: jest.fn().mockResolvedValue(ACCOUNT),
    getNetwork: jest.fn().mockResolvedValue("TESTNET"),
    isConnected: jest.fn().mockResolvedValue(true),
    isAllowed: jest.fn().mockResolvedValue(true),
  };
  (window as unknown as { freighterApi: FreighterMock }).freighterApi = freighter;
  return freighter;
}

function Probe() {
  const { publicKey, usdcBalance, isConnected, wrongNetwork, walletError, connect } =
    useWallet();

  return (
    <div>
      <span data-testid="public-key">{publicKey ?? "none"}</span>
      <span data-testid="balance">{usdcBalance ?? "none"}</span>
      <span data-testid="connected">{isConnected ? "yes" : "no"}</span>
      <span data-testid="wrong-network">{wrongNetwork ? "yes" : "no"}</span>
      <span data-testid="error">{walletError?.message ?? "none"}</span>
      <button onClick={() => connect()}>Connect</button>
    </div>
  );
}

async function connectWallet() {
  render(
    <WalletProvider>
      <Probe />
    </WalletProvider>
  );

  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  });

  await waitFor(() => expect(screen.getByTestId("public-key")).toHaveTextContent(ACCOUNT));
}

/** Let the watcher interval fire once and settle its promises. */
async function tickWatcher() {
  await act(async () => {
    jest.advanceTimersByTime(3000);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

describe("WalletProvider — Freighter disconnect recovery", () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    delete (window as unknown as { freighterApi?: FreighterMock }).freighterApi;
    jest.clearAllMocks();
  });

  it("exposes the account and USDC balance after connecting", async () => {
    installFreighter();
    await connectWallet();

    expect(screen.getByTestId("connected")).toHaveTextContent("yes");
    expect(screen.getByTestId("balance")).toHaveTextContent("25.5");
    expect(screen.getByTestId("error")).toHaveTextContent("none");
  });

  it("resets the session when Freighter revokes access", async () => {
    const freighter = installFreighter();
    await connectWallet();

    freighter.isAllowed.mockResolvedValue(false);
    await tickWatcher();

    await waitFor(() => expect(screen.getByTestId("public-key")).toHaveTextContent("none"));
    expect(screen.getByTestId("connected")).toHaveTextContent("no");
    expect(screen.getByTestId("balance")).toHaveTextContent("none");
    expect(screen.getByTestId("error")).toHaveTextContent(/wallet disconnected/i);
  });

  it("resets the session when the extension reports itself disconnected", async () => {
    const freighter = installFreighter();
    await connectWallet();

    freighter.isConnected.mockResolvedValue(false);
    await tickWatcher();

    await waitFor(() => expect(screen.getByTestId("connected")).toHaveTextContent("no"));
    expect(screen.getByTestId("error")).toHaveTextContent(/wallet disconnected/i);
  });

  it("adopts an account switched inside the wallet", async () => {
    const freighter = installFreighter();
    await connectWallet();

    freighter.getPublicKey.mockResolvedValue(OTHER_ACCOUNT);
    await tickWatcher();

    await waitFor(() =>
      expect(screen.getByTestId("public-key")).toHaveTextContent(OTHER_ACCOUNT)
    );
    expect(screen.getByTestId("connected")).toHaveTextContent("yes");
  });

  it("flags a network switch without dropping the session", async () => {
    const freighter = installFreighter();
    await connectWallet();

    expect(screen.getByTestId("wrong-network")).toHaveTextContent("no");

    freighter.getNetwork.mockResolvedValue("PUBLIC");
    await tickWatcher();

    await waitFor(() => expect(screen.getByTestId("wrong-network")).toHaveTextContent("yes"));
    expect(screen.getByTestId("connected")).toHaveTextContent("yes");
  });

  it("reports a declined connection with the rejection copy", async () => {
    const freighter = installFreighter();
    freighter.requestAccess.mockRejectedValue(new Error("User declined access"));

    render(
      <WalletProvider>
        <Probe />
      </WalletProvider>
    );

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Connect" }));
    });

    await waitFor(() =>
      expect(screen.getByTestId("error")).toHaveTextContent(/rejected by user/i)
    );
    expect(screen.getByTestId("connected")).toHaveTextContent("no");
  });
});
