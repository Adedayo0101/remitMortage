export type SignerVoteStatus = "approved" | "pending";

export interface MilestoneSigner {
  address: string;
  label: string;
  weight: number;
  status: SignerVoteStatus;
}

export interface MilestoneSigningStatus {
  proposalId: string;
  milestoneId: string;
  evidenceCid: string;
  status: "Open" | "Passed";
  requiredWeight: number;
  totalWeight: number;
  currentWeight: number;
  signers: MilestoneSigner[];
  createdAt: string;
  updatedAt: string;
}

/** Creates a disbursement proposal and returns its initial signing status (0 votes cast). */
export async function createMilestoneProposal(
  milestoneId: string,
  evidenceCid: string
): Promise<MilestoneSigningStatus> {
  const res = await fetch("/api/milestone/proposals", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ milestoneId, evidenceCid }),
  });
  if (!res.ok) {
    throw new Error("Failed to create disbursement proposal");
  }
  return res.json();
}

/** Fetches the current signer weights and per-signer approval status for a proposal. */
export async function fetchMilestoneSigningStatus(
  proposalId: string
): Promise<MilestoneSigningStatus> {
  const res = await fetch(`/api/milestone/proposals/${proposalId}/signing-status`);
  if (!res.ok) {
    throw new Error("Failed to fetch signing status");
  }
  return res.json();
}
