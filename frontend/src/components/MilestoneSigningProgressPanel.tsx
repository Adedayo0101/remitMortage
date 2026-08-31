"use client";

import React from "react";
import { SignatureQueueManager } from "./SignatureQueueManager";

export interface MilestoneSigningProgressPanelProps {
  proposalId: string;
  onFullyApproved?: () => void;
  pollIntervalMs?: number;
}

export default function MilestoneSigningProgressPanel(props: MilestoneSigningProgressPanelProps) {
  return <SignatureQueueManager {...props} />;
}
