"use client";

import React, { Suspense } from "react";
import HistoryClient from "./HistoryClient";

export default function HistoryPage() {
  return (
    <Suspense fallback={null}>
      <HistoryClient />
    </Suspense>
  );
}
