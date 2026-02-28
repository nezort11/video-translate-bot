import { getYoutubeVideoId } from "../core";

describe("getYoutubeVideoId", () => {
  it("should extract 11-character ID from a regular youtube.com link", () => {
    expect(getYoutubeVideoId("https://www.youtube.com/watch?v=5IGiEbsE53I")).toBe("5IGiEbsE53I");
  });

  it("should extract 11-character ID from a youtu.be link", () => {
    expect(getYoutubeVideoId("https://youtu.be/5IGiEbsE53I")).toBe("5IGiEbsE53I");
  });

  it("should handle malformed tracking parameters (si=) correctly", () => {
    // This is the case reported by the user
    expect(getYoutubeVideoId("https://youtu.be/5IGiEbsE53Isi=JK3YrTIoG6ehPi__")).toBe("5IGiEbsE53I");
  });

  it("should extract 11-character ID from a shorts link", () => {
    expect(getYoutubeVideoId("https://www.youtube.com/shorts/5IGiEbsE53I")).toBe("5IGiEbsE53I");
  });

  it("should extract 11-character ID from a live link", () => {
    expect(getYoutubeVideoId("https://www.youtube.com/live/5IGiEbsE53I")).toBe("5IGiEbsE53I");
  });

  it("should handle links with trailing slashes and multiple params", () => {
    expect(getYoutubeVideoId("https://www.youtube.com/watch?v=5IGiEbsE53I&feature=share")).toBe("5IGiEbsE53I");
  });
});
