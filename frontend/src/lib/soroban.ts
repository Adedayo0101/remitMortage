import {
  Contract,
  TransactionBuilder,
  Networks,
  BASE_FEE,
  nativeToScVal,
  Address,
  rpc as SorobanRpc,
} from "@stellar/stellar-sdk";
import { getRpcServer } from "./soroban-rpc";

const DEFAULT_NETWORK = Networks.TESTNET;
const DEFAULT_GOAL = "savings";

function escrowContractId(): string {
  return process.env.NEXT_PUBLIC_ESCROW_CONTRACT_ID || "";
}

function networkPassphrase(): string {
  return process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || DEFAULT_NETWORK;
}

function getSimulationError<T extends object>(simulation: T): string | null {
  if (!("error" in simulation)) {
    return null;
  }

  const error = (simulation as { error?: unknown }).error;
  return typeof error === "string" ? error : null;
}

export async function buildDepositTx(borrower: string, amount: string): Promise<string> {
  const server = getRpcServer();
  const source = await server.getAccount(borrower);
  const contract = new Contract(escrowContractId());
  const amountStroops = BigInt(Math.round(parseFloat(amount) * 10_000_000));

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(),
  })
    .addOperation(
      contract.call(
        "deposit",
        Address.fromString(borrower).toScVal(),
        nativeToScVal(DEFAULT_GOAL, { type: "symbol" }),
        nativeToScVal(amountStroops, { type: "i128" })
      )
    )
    .setTimeout(300)
    .build();

  const simulated = await server.simulateTransaction(tx);
  const simulationError = getSimulationError(simulated);
  if (simulationError) {
    throw new Error(`Simulation failed: ${simulationError}`);
  }

  return SorobanRpc.assembleTransaction(tx, simulated).build().toXDR();
}

export async function buildWithdrawTx(borrower: string): Promise<string> {
  const server = getRpcServer();
  const source = await server.getAccount(borrower);
  const contract = new Contract(escrowContractId());

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(),
  })
    .addOperation(
      contract.call(
        "withdraw",
        Address.fromString(borrower).toScVal(),
        nativeToScVal(DEFAULT_GOAL, { type: "symbol" })
      )
    )
    .setTimeout(300)
    .build();

  const simulated = await server.simulateTransaction(tx);
  const simulationError = getSimulationError(simulated);
  if (simulationError) {
    throw new Error(`Simulation failed: ${simulationError}`);
  }

  return SorobanRpc.assembleTransaction(tx, simulated).build().toXDR();
}

/**
 * Sign and submit a pre-assembled Stellar transaction XDR.
 *
 * Accepts an optional `signer` callback so callers can inject the active
 * wallet's signing function (Freighter or Ledger) without creating a hard
 * dependency on the React context from this utility module.
 *
 * When `signer` is omitted the function falls back to Freighter for
 * backwards-compatibility with any code that has not yet been updated to
 * pass a signer.
 *
 * @param txXdr  Base-64 encoded assembled transaction XDR.
 * @param signer Optional async function that accepts the XDR string and
 *               returns the signed XDR string.  Provide
 *               `WalletContext.signStellarTx` here.
 */
export async function signAndSubmit(
  txXdr: string,
  signer?: (xdr: string) => Promise<string>
): Promise<string> {
  let signedXdr: string;

  if (signer) {
    // Wallet-aware path: Freighter or Ledger via the context abstraction.
    signedXdr = await signer(txXdr);
  } else {
    // Legacy fallback: always use Freighter directly.
    const freighter = await import("@stellar/freighter-api");
    if (typeof freighter.signTransaction !== "function") {
      throw new Error("Freighter signing API is unavailable");
    }
    const result = await freighter.signTransaction(txXdr, {
      networkPassphrase: networkPassphrase(),
    });
    // freighter-api v1 returns a plain string; v2+ wraps it.
    signedXdr =
      typeof result === "string"
        ? result
        : (result as { signedTxXdr: string }).signedTxXdr;
  }

  const server = getRpcServer();
  const tx = TransactionBuilder.fromXDR(signedXdr, networkPassphrase());
  const sendResponse = await server.sendTransaction(tx);

  if (sendResponse.status === "ERROR") {
    throw new Error("Submission failed on Stellar.");
  }

  if (sendResponse.status === "TRY_AGAIN_LATER") {
    throw new Error("Submission delayed by the network. Please retry.");
  }

  return sendResponse.hash;
}

export async function queryEscrowConfig(publicKey: string): Promise<{ earlyWithdrawalPenaltyBps: number; savingsTarget: string }> {
  const server = getRpcServer();
  const source = await server.getAccount(publicKey);
  const contract = new Contract(escrowContractId());

  const tx = new TransactionBuilder(source, {
    fee: BASE_FEE,
    networkPassphrase: networkPassphrase(),
  })
    .addOperation(contract.call("get_escrow_config"))
    .setTimeout(300)
    .build();

  const simulated = await server.simulateTransaction(tx);
  if (getSimulationError(simulated)) {
    return { earlyWithdrawalPenaltyBps: 500, savingsTarget: "0" };
  }

  if (!("result" in simulated) || !simulated.result) {
    return { earlyWithdrawalPenaltyBps: 500, savingsTarget: "0" };
  }

  const result = simulated.result as any;
  const val = result.retval;
  return {
    earlyWithdrawalPenaltyBps: Number(val._attributes.early_withdrawal_penalty_bps) || 500,
    savingsTarget: (val._attributes.savings_target?.toString() || "0"),
  };
}
