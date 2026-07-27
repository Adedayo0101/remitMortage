/**
 * @jest-environment node
 */
import { GET } from "../src/app/api/investor/pool-rate/route";

const ORIGINAL_ENV = process.env.BACKEND_API_URL;

afterEach(() => {
  process.env.BACKEND_API_URL = ORIGINAL_ENV;
  jest.restoreAllMocks();
});

describe("GET /api/investor/pool-rate", () => {
  it("proxies live rates from the backend and marks them as live", async () => {
    const backendRates = {
      poolApyBps: 1000,
      seniorApyBps: 400,
      juniorApyBps: 1900,
      seniorLiquidity: "600",
      juniorLiquidity: "400",
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => backendRates,
    }) as jest.Mock;

    const res = await GET();
    const body = await res.json();

    expect(body).toEqual({ ...backendRates, live: true });
  });

  it("falls back to the static estimate when the backend responds with an error", async () => {
    global.fetch = jest.fn().mockResolvedValue({ ok: false }) as jest.Mock;

    const res = await GET();
    const body = await res.json();

    expect(body.live).toBe(false);
    expect(body.seniorApyBps).toBe(400);
  });

  it("falls back to the static estimate when the backend is unreachable", async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error("network error")) as jest.Mock;

    const res = await GET();
    const body = await res.json();

    expect(body.live).toBe(false);
    expect(body.poolApyBps).toBe(620);
  });
});
