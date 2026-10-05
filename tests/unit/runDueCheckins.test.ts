import { afterEach, describe, expect, it, vi } from "vitest";

const listDue = vi.hoisted(() => vi.fn());
vi.mock("@/lib/repositories", () => ({
  getRepositories: () => ({
    listUserIds: async () => ["failing-user", "other-user"],
    checkins: { listDue },
  }),
}));

import { runDueCheckinsForAllUsers } from "@/lib/background/runDueCheckins";

afterEach(() => vi.restoreAllMocks());

describe("runDueCheckinsForAllUsers", () => {
  it("continues to other users when one user's check-ins fail", async () => {
    const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});
    listDue.mockReset().mockRejectedValueOnce(new Error("store unavailable")).mockResolvedValueOnce([]);

    await expect(runDueCheckinsForAllUsers()).resolves.toEqual([]);

    expect(listDue).toHaveBeenCalledTimes(2);
    expect(listDue.mock.calls.map(([userId]) => userId)).toEqual(["failing-user", "other-user"]);
    expect(errorLog).toHaveBeenCalledWith("Background check-in failed for user", "failing-user", expect.any(Error));
  });
});
