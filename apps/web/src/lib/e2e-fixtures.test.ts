import { describe, expect, it } from "vitest";
import {
  getE2eFixtureUser,
  getE2eWorkProgressView,
  isE2eFixtureMode,
  listE2eLibraryWorks,
} from "./e2e-fixtures";

describe("e2e fixtures", () => {
  it("detects fixture mode from the environment", () => {
    const original = process.env.BOOKHOUSE_E2E_FIXTURES;

    process.env.BOOKHOUSE_E2E_FIXTURES = "1";
    expect(isE2eFixtureMode()).toBe(true);

    process.env.BOOKHOUSE_E2E_FIXTURES = "0";
    expect(isE2eFixtureMode()).toBe(false);

    process.env.BOOKHOUSE_E2E_FIXTURES = original;
  });

  it("returns the browser auth fixture and library data", () => {
    expect(getE2eFixtureUser()).toMatchObject({
      email: "e2e@example.com",
      id: "e2e-user-1",
      name: "E2E User",
    });

    expect(listE2eLibraryWorks()).toEqual([
      expect.objectContaining({
        authors: ["N. K. Jemisin"],
        titleDisplay: "The Fifth Season",
        workId: "work-e2e-1",
      }),
    ]);

    expect(getE2eWorkProgressView("work-e2e-1")).toMatchObject({
      contributorGroups: [
        expect.objectContaining({ role: "AUTHOR" }),
        expect.objectContaining({ role: "NARRATOR" }),
      ],
      editions: [
        expect.objectContaining({
          externalLinks: [],
          files: [expect.objectContaining({ relativePath: "audio/fifth-season.m4b" })],
          formatFamily: "AUDIOBOOK",
        }),
        expect.objectContaining({
          externalLinks: [expect.objectContaining({ provider: "openlibrary" })],
          files: [expect.objectContaining({ relativePath: "ebooks/fifth-season.epub" })],
          formatFamily: "EBOOK",
        }),
      ],
      workId: "work-e2e-1",
      workTitle: "The Fifth Season",
    });

    expect(getE2eWorkProgressView("missing-work")).toBeNull();
  });
});
