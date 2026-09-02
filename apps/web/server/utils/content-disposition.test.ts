import { describe, expect, it } from "vitest";
import { attachmentDisposition } from "./content-disposition";

describe("attachmentDisposition", () => {
  it("emits a plain quoted filename for ASCII names", () => {
    expect(attachmentDisposition("book.epub")).toBe('attachment; filename="book.epub"');
  });

  it("adds an RFC 5987 encoded name and an ASCII fallback for non-ASCII characters", () => {
    expect(attachmentDisposition("Philosopher\u2019s Stone.epub")).toBe(
      "attachment; filename=\"Philosopher_s Stone.epub\"; filename*=UTF-8''Philosopher%E2%80%99s%20Stone.epub",
    );
    expect(attachmentDisposition("\u4e09\u4f53.epub")).toBe(
      "attachment; filename=\"__.epub\"; filename*=UTF-8''%E4%B8%89%E4%BD%93.epub",
    );
  });

  it("neutralises quotes, backslashes and control characters in the fallback", () => {
    expect(attachmentDisposition('a"b\\c\u0001.pdf')).toBe(
      "attachment; filename=\"a_b_c_.pdf\"; filename*=UTF-8''a%22b%5Cc%01.pdf",
    );
  });

  it("percent-encodes the characters encodeURIComponent leaves alone", () => {
    expect(attachmentDisposition("it's (\u00e9).epub")).toBe(
      "attachment; filename=\"it's (_).epub\"; filename*=UTF-8''it%27s%20%28%C3%A9%29.epub",
    );
  });
});
