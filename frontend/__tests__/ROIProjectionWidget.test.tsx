import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import ROIProjectionWidget from "../src/components/ROIProjectionWidget";

// recharts' ResponsiveContainer requires ResizeObserver, which jsdom doesn't
// implement; stub it so the chart can mount under test.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(global as any).ResizeObserver = ResizeObserverStub;

const HISTORICAL = [
  { date: "2026-01", yieldUsdc: 10 },
  { date: "2026-02", yieldUsdc: 22 },
];

beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => HISTORICAL,
  }) as jest.Mock;
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe("ROIProjectionWidget repayment timeline slider", () => {
  it("defaults the projection slider to 12 months", async () => {
    render(<ROIProjectionWidget wallet="GABC" depositedAmount={1000} apyBps={500} />);

    await waitFor(() => expect(screen.queryByText(/error fetching/i)).not.toBeInTheDocument());

    const slider = screen.getByLabelText(/projected months of future repayment-driven yield/i);
    expect(slider).toHaveValue("12");
    expect(screen.getByText("12 months")).toBeInTheDocument();
  });

  it("updates the displayed month count when the slider is dragged", async () => {
    render(<ROIProjectionWidget wallet="GABC" depositedAmount={1000} apyBps={500} />);

    await waitFor(() => expect(screen.queryByText(/error fetching/i)).not.toBeInTheDocument());

    const slider = screen.getByLabelText(/projected months of future repayment-driven yield/i);
    fireEvent.change(slider, { target: { value: "6" } });

    expect(screen.getByText("6 months")).toBeInTheDocument();
  });

  it("respects the slider's configured min/max bounds", async () => {
    render(<ROIProjectionWidget wallet="GABC" depositedAmount={1000} apyBps={500} />);

    await waitFor(() => expect(screen.queryByText(/error fetching/i)).not.toBeInTheDocument());

    const slider = screen.getByLabelText(/projected months of future repayment-driven yield/i);
    expect(slider).toHaveAttribute("min", "1");
    expect(slider).toHaveAttribute("max", "36");
  });
});
