import { describe, expect, it } from "vitest";
import { buildPaginationLinks } from "./pagination";
import type { OpdsPagination } from "./types";

describe("buildPaginationLinks", () => {
  it("includes first link on any page", () => {
    const pagination: OpdsPagination = {
      page: 3,
      perPage: 25,
      totalResults: 100,
      hasNext: true,
      hasPrevious: true,
    };
    const result = buildPaginationLinks(pagination, "/opds/all");
    expect(result).toContain('rel="first"');
    expect(result).toContain('href="/opds/all?page=1"');
  });

  it("includes next link when hasNext is true", () => {
    const pagination: OpdsPagination = {
      page: 1,
      perPage: 25,
      totalResults: 50,
      hasNext: true,
      hasPrevious: false,
    };
    const result = buildPaginationLinks(pagination, "/opds/all");
    expect(result).toContain('rel="next"');
    expect(result).toContain('href="/opds/all?page=2"');
  });

  it("omits next link when hasNext is false", () => {
    const pagination: OpdsPagination = {
      page: 2,
      perPage: 25,
      totalResults: 50,
      hasNext: false,
      hasPrevious: true,
    };
    const result = buildPaginationLinks(pagination, "/opds/all");
    expect(result).not.toContain('rel="next"');
  });

  it("includes previous link when hasPrevious is true", () => {
    const pagination: OpdsPagination = {
      page: 3,
      perPage: 25,
      totalResults: 100,
      hasNext: true,
      hasPrevious: true,
    };
    const result = buildPaginationLinks(pagination, "/opds/all");
    expect(result).toContain('rel="previous"');
    expect(result).toContain('href="/opds/all?page=2"');
  });

  it("omits previous link on first page", () => {
    const pagination: OpdsPagination = {
      page: 1,
      perPage: 25,
      totalResults: 10,
      hasNext: false,
      hasPrevious: false,
    };
    const result = buildPaginationLinks(pagination, "/opds/all");
    expect(result).not.toContain('rel="previous"');
  });

  it("includes opensearch elements", () => {
    const pagination: OpdsPagination = {
      page: 2,
      perPage: 25,
      totalResults: 75,
      hasNext: true,
      hasPrevious: true,
    };
    const result = buildPaginationLinks(pagination, "/opds/all");
    expect(result).toContain("<opensearch:totalResults>75</opensearch:totalResults>");
    expect(result).toContain("<opensearch:itemsPerPage>25</opensearch:itemsPerPage>");
    expect(result).toContain("<opensearch:startIndex>25</opensearch:startIndex>");
  });

  it("calculates startIndex correctly for first page", () => {
    const pagination: OpdsPagination = {
      page: 1,
      perPage: 25,
      totalResults: 50,
      hasNext: true,
      hasPrevious: false,
    };
    const result = buildPaginationLinks(pagination, "/opds/all");
    expect(result).toContain("<opensearch:startIndex>0</opensearch:startIndex>");
  });
});
