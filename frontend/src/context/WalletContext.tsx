"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { Horizon } from "@stellar/stellar-sdk";
import { BrowserProvider } from "ethers";
import { getLedgerPublicKey, signTransactionWithLedger, DEFAULT_LEDGER_PATH } from "../lib/ledger";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BalanceLine = {
  asset_code?: string;
  balance: string;
};

type FreighterClient = {
  requestAccess?: () => void | Promise<void>;
  getPublicKey?: () => string | Promise<string>;
  getAccount?: () => string | Promise<string>;
  getNetwork?: () => string | Promise<string>;
};

type EthereumProvider = ConstructorParameters<typeof BrowserProvider>[0];

interface SolanaProvider {
  isPhantom?: boolean;
  connect: () => Promise<{ publicKey: { toString: () => string } }>;
  signMessage?: (message: Uint8Array, encoding: string) => Promise<{ signature: Uint8Array }>;
}

type WalletWindow = Window & {
  ethereum?: EthereumProvider;
  solana?: SolanaProvider;
  freighterApi?: FreighterClient;
  freighter?: {
    publicKey?: string;
  };
};

/** All supported wallet types, including the new hardware-wallet option. */
type WalletType = "stellar" | "ledger" | "evm" | "solana" | null;

type WalletContextType = {
  publicKey: string | null;
  evmAddress: string | null;
  solanaAddress: string | null;
  walletType: WalletType;
  isConnected: boolean;
  isConnecting: boolean;
  usdcBalance: string | null;
  network: string | null;
  wrongNetwork: boolean;
  error: string | null;
  /** BIP-44 path currently in use for Ledger signing. */
  ledgerPath: string;
  /** Change the BIP-44 derivation path used for Ledger operations. */
  setLedgerPath: (path: string) => void;
  /** Connect via Freighter (Stellar browser extension). */
  connect: () => Promise<string | null>;
  /**
   * Connect via a physical Ledger Nano S / X device.
   * Opens the browser device-picker, reads the public key from the hardware,
   * and sets `walletType` to `"ledger"`.
   */
  connectLedger: () => Promise<string | null>;
  connectEVM: () => Promise<string | null>;
  connectSolana: () => Promise<string | null>;
  disconnect: () => void;
  disconnectAll: () => void;
  signMessage: (message: string) => Promise<string | null>;
  /**
   * Sign an assembled Stellar transaction XDR with whichever Stellar wallet
   * is currently connected (Freighter or Ledger).
   *
   * Returns the signed XDR string ready for submission, or throws on failure.
   */
  signStellarTx: (txXdr: string) => Promise<string>;
};

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const WalletContext = createContext<WalletContextType | undefined>(undefined);

const HORIZON_TESTNET = "https://horizon-testnet.stellar.org";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

function getWalletWindow(): WalletWindow {
  return window as WalletWindow;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [evmAddress, setEvmAddress] = useState<string | null>(null);
  const [solanaAddress, setSolanaAddress] = useState<string | null>(null);
  const [walletType, setWalletType] = useState<WalletType>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [usdcBalance, setUsdcBalance] = useState<string | null>(null);
  const [network, setNetwork] = useState<string | null>(null);
  const [wrongNetwork, setWrongNetwork] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  /** BIP-44 derivation path used for Ledger operations. */
  const [ledgerPath, setLedgerPath] = useState<string>(DEFAULT_LEDGER_PATH);

  const server = new Horizon.Server(HORIZON_TESTNET);

  // ---------------------------------------------------------------------------
  // Balance fetching
  // ---------------------------------------------------------------------------

  async function fetchBalances(pk: string) {
    try {
      const account = await server.accounts().accountId(pk).call();
      const balances = account.balances as BalanceLine[];
      const usdc = balances.find((b) => b.asset_code === "USDC");
      setUsdcBalance(usdc ? usdc.balance : "0");
    } catch {
      setUsdcBalance(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Shared state reset
  // ---------------------------------------------------------------------------

  function clearWalletState() {
    setPublicKey(null);
    setEvmAddress(null);
    setSolanaAddress(null);
    setWalletType(null);
    setUsdcBalance(null);
    setNetwork(null);
    setWrongNetwork(false);
    setError(null);
    setIsConnecting(false);
  }

  // ---------------------------------------------------------------------------
  // Freighter (Stellar browser extension)
  // ---------------------------------------------------------------------------

  async function connect(): Promise<string | null> {
    setIsConnecting(true);
    setError(null);

    try {
      const win = getWalletWindow();
      const freighter = (
        win.freighterApi ??
        (await import("@stellar/freighter-api")
          .then((m) => m as FreighterClient)
          .catch(() => null))
      ) as FreighterClient | null;

      if (!freighter) throw new Error("Freighter not available");

      if (typeof freighter.requestAccess === "function") {
        await freighter.requestAccess();
      }

      let pk: string | null = null;
      if (typeof freighter.getPublicKey === "function") {
        pk = await freighter.getPublicKey();
      } else if (typeof freighter.getAccount === "function") {
        pk = await freighter.getAccount();
      } else if (win.freighter?.publicKey) {
        pk = win.freighter.publicKey;
      }

      if (!pk) throw new Error("Could not get public key from Freighter");

      setPublicKey(pk);
      setWalletType("stellar");

      let net: string | null = null;
      if (typeof freighter.getNetwork === "function") {
        try {
          net = (await freighter.getNetwork()) as string;
        } catch {
          net = null;
        }
      }

      setNetwork(net);
      setWrongNetwork(net ? !net.toLowerCase().includes("test") : false);
      await fetchBalances(pk);
      return pk;
    } catch (err) {
      const message = getErrorMessage(err, "Failed to connect Stellar wallet");
      setError(message);
      setPublicKey(null);
      setWalletType((current) => (current === "stellar" ? null : current));
      return null;
    } finally {
      setIsConnecting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Ledger Nano S / X
  // ---------------------------------------------------------------------------

  /**
   * Open a connection to the Ledger device, read the Stellar public key for
   * the configured BIP-44 path, and set the wallet state accordingly.
   *
   * The transport is closed immediately after the public key is retrieved —
   * a fresh transport is opened each time a transaction needs to be signed.
   */
  async function connectLedger(): Promise<string | null> {
    setIsConnecting(true);
    setError(null);

    try {
      const { publicKey: pk } = await getLedgerPublicKey(ledgerPath, false);

      if (!pk) throw new Error("Could not retrieve public key from Ledger device");

      setPublicKey(pk);
      setWalletType("ledger");
      // Ledger is always used on testnet in this app.
      setNetwork("TESTNET");
      setWrongNetwork(false);
      await fetchBalances(pk);
      return pk;
    } catch (err) {
      const message = getErrorMessage(err, "Failed to connect Ledger device");
      setError(message);
      setPublicKey(null);
      setWalletType((current) => (current === "ledger" ? null : current));
      return null;
    } finally {
      setIsConnecting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // EVM (MetaMask / injected)
  // ---------------------------------------------------------------------------

  async function connectEVM(): Promise<string | null> {
    setIsConnecting(true);
    setError(null);

    try {
      const { ethereum } = getWalletWindow();
      if (!ethereum) throw new Error("MetaMask or EVM provider is not installed!");

      const provider = new BrowserProvider(ethereum);
      const accounts = await provider.send("eth_requestAccounts", []);
      const address = accounts?.[0];
      if (!address) throw new Error("No Ethereum account returned");

      setEvmAddress(address);
      setWalletType("evm");
      return address;
    } catch (err) {
      const message = getErrorMessage(err, "Failed to connect EVM wallet");
      setError(message);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Solana (Phantom)
  // ---------------------------------------------------------------------------

  async function connectSolana(): Promise<string | null> {
    setIsConnecting(true);
    setError(null);

    try {
      const { solana } = getWalletWindow();
      if (!solana || !solana.isPhantom) throw new Error("Phantom wallet is not installed!");

      const response = await solana.connect();
      const address = response.publicKey.toString();
      setSolanaAddress(address);
      setWalletType("solana");
      return address;
    } catch (err) {
      const message = getErrorMessage(err, "Failed to connect Solana wallet");
      setError(message);
      return null;
    } finally {
      setIsConnecting(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Disconnect
  // ---------------------------------------------------------------------------

  function disconnect() {
    clearWalletState();
  }

  function disconnectAll() {
    clearWalletState();
  }

  // ---------------------------------------------------------------------------
  // Message signing (EVM / Solana only — Ledger / Freighter use signStellarTx)
  // ---------------------------------------------------------------------------

  async function signMessage(message: string): Promise<string | null> {
    try {
      if (walletType === "evm") {
        const { ethereum } = getWalletWindow();
        if (!ethereum) throw new Error("MetaMask or EVM provider is not installed!");
        const provider = new BrowserProvider(ethereum);
        const signer = await provider.getSigner();
        return await signer.signMessage(message);
      }

      if (walletType === "solana") {
        const { solana } = getWalletWindow();
        if (!solana || !solana.signMessage) throw new Error("Phantom wallet is not installed!");
        const encoded = new TextEncoder().encode(message);
        const signed = await solana.signMessage(encoded, "utf8");
        return Array.from(signed.signature)
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
      }

      return null;
    } catch (err) {
      setError(getErrorMessage(err, "Message signing failed or was rejected"));
      return null;
    }
  }

  // ---------------------------------------------------------------------------
  // Stellar transaction signing — Freighter OR Ledger
  // ---------------------------------------------------------------------------

  /**
   * Sign an assembled Stellar transaction XDR with whichever Stellar wallet
   * is currently active.
   *
   * - `walletType === "stellar"` → delegates to Freighter
   * - `walletType === "ledger"`  → delegates to the Ledger hw-app-str layer
   *
   * Throws when no Stellar wallet is connected.
   */
  async function signStellarTx(txXdr: string): Promise<string> {
    const networkPassphrase =
      process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || "Test SDF Network ; September 2015";

    if (walletType === "ledger") {
      // Hardware path — opens the Ledger device, signs, closes transport.
      return signTransactionWithLedger(txXdr, ledgerPath);
    }

    if (walletType === "stellar") {
      // Freighter browser-extension path.
      const freighter = await import("@stellar/freighter-api");
      if (typeof freighter.signTransaction !== "function") {
        throw new Error("Freighter signing API is unavailable");
      }
      const signed = await freighter.signTransaction(txXdr, { networkPassphrase });
      // freighter-api v1 returns a plain string; v2+ wraps it in an object.
      return typeof signed === "string" ? signed : (signed as { signedTxXdr: string }).signedTxXdr;
    }

    throw new Error(
      "No Stellar wallet is connected. Please connect Freighter or a Ledger device first."
    );
  }

  // ---------------------------------------------------------------------------
  // Effects
  // ---------------------------------------------------------------------------

  useEffect(() => {
    // Intentionally empty — avoid automatic permission prompts on mount.
  }, []);

  // ---------------------------------------------------------------------------
  // Context value
  // ---------------------------------------------------------------------------

  const value: WalletContextType = {
    publicKey,
    evmAddress,
    solanaAddress,
    walletType,
    isConnected: !!publicKey || !!evmAddress || !!solanaAddress,
    isConnecting,
    usdcBalance,
    network,
    wrongNetwork,
    error,
    ledgerPath,
    setLedgerPath,
    connect,
    connectLedger,
    connectEVM,
    connectSolana,
    disconnect,
    disconnectAll,
    signMessage,
    signStellarTx,
  };

  return <WalletContext.Provider value={value}>{children}</WalletContext.Provider>;
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
}

export default WalletContext;
