import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock prisma
vi.mock("../db/prisma", () => ({
  prisma: {
    player: {
      update: vi.fn(),
    },
  },
}));

import { updatePlayerActivity } from "./player";
import { prisma } from "../db/prisma";

describe("Player Business Logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("updatePlayerActivity", () => {
    it("应该更新玩家的 lastSeenAt", async () => {
      vi.mocked(prisma.player.update).mockResolvedValue({} as any);
      await updatePlayerActivity("player-1");
      expect(prisma.player.update).toHaveBeenCalledWith({
        where: { id: "player-1" },
        data: { lastSeenAt: expect.any(Date) },
      });
    });

    it("应该在更新失败时不抛出异常", async () => {
      vi.mocked(prisma.player.update).mockRejectedValue(
        new Error("DB connection failed"),
      );
      const consoleSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});

      // 不应抛出
      await expect(updatePlayerActivity("player-1")).resolves.toBeUndefined();
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it("应该使用正确的 playerId", async () => {
      vi.mocked(prisma.player.update).mockResolvedValue({} as any);
      await updatePlayerActivity("abc-123");
      expect(prisma.player.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "abc-123" },
        }),
      );
    });
  });
});
