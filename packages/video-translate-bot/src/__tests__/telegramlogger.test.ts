import { getUserName } from "../telegramlogger";
import { Context } from "telegraf";

describe("telegramlogger sanitization", () => {
  describe("getUserName", () => {
    it("should sanitize links in username", () => {
      const ctx = {
        from: {
          id: 123,
          is_bot: false,
          first_name: "Test",
          username: "test_t.me/channel_user",
        },
      } as Context;

      const result = getUserName(ctx);
      // The entire domain/path pattern is replaced with <link>
      expect(result).toBe("test_<link>");
    });

    it("should sanitize links in first_name and last_name", () => {
      const ctx = {
        from: {
          id: 123,
          is_bot: false,
          first_name: "https://evil.com/scam",
          last_name: "t.me/BadChannel",
        },
      } as Context;

      const result = getUserName(ctx);
      expect(result).toBe("<link> <link>");
    });

    it("should sanitize @ and # symbols", () => {
      const ctx = {
        from: {
          id: 123,
          is_bot: false,
          first_name: "@TestUser",
          last_name: "#hashtag",
        },
      } as Context;

      const result = getUserName(ctx);
      expect(result).toBe("TestUser hashtag");
    });

    it("should handle normal usernames without links", () => {
      const ctx = {
        from: {
          id: 123,
          is_bot: false,
          first_name: "John",
          last_name: "Doe",
          username: "johndoe",
        },
      } as Context;

      const result = getUserName(ctx);
      expect(result).toBe("johndoe");
    });

    it("should sanitize complex link patterns", () => {
      const ctx = {
        from: {
          id: 123,
          is_bot: false,
          first_name: "Visit example.com/promo now!",
        },
      } as Context;

      const result = getUserName(ctx);
      expect(result).toBe("Visit <link> now!");
    });
  });
});
