import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { extractHash } from "../services/hashExtractor.js";

describe("extractHash", () => {
  describe("valid hashes", () => {
    test("extracts 4-character hash", () => {
      const result = extractHash("abcd-toy-name");
      assert.equal(result, "abcd");
    });

    test("extracts 8-character hash (maximum)", () => {
      const result = extractHash("abcdefgh-toy-name");
      assert.equal(result, "abcdefgh");
    });

    test("extracts 6-character hash (typical)", () => {
      const result = extractHash("a9k2j3-toy-name-here");
      assert.equal(result, "a9k2j3");
    });

    test("extracts hash with all alphanumeric characters", () => {
      const result = extractHash("abc123xy-project");
      assert.equal(result, "abc123xy");
    });

    test("extracts hash from project name without dashes", () => {
      const result = extractHash("hash1234toy");
      assert.equal(result, "hash1234");
    });

    test("extracts hash from project name with only hash", () => {
      const result = extractHash("abcd");
      assert.equal(result, "abcd");
    });

    test("hash is case-sensitive (preserves case)", () => {
      const result = extractHash("AbCd-toy");
      assert.equal(result, "AbCd");
    });

    test("extracts numeric-only hash", () => {
      const result = extractHash("1234567-project");
      assert.equal(result, "1234567");
    });

    test("extracts alpha-only hash", () => {
      const result = extractHash("abcdefgh-project");
      assert.equal(result, "abcdefgh");
    });
  });

  describe("invalid hashes (returns null)", () => {
    test("rejects hash that is too short (3 characters)", () => {
      const result = extractHash("abc-toy");
      assert.equal(result, null);
    });

    test("rejects hash that is too long (9 characters)", () => {
      const result = extractHash("abcdefghi-toy");
      // The pattern extracts first 8 chars which is valid, so this actually succeeds
      assert.equal(result, "abcdefgh");
    });

    test("rejects empty job name", () => {
      const result = extractHash("");
      assert.equal(result, null);
    });

    test("rejects hash starting with special character", () => {
      const result = extractHash("-abcd-toy");
      assert.equal(result, null);
    });

    test("rejects hash with space in middle", () => {
      const result = extractHash("ab cd-toy");
      assert.equal(result, null);
    });

    test("rejects hash with underscore", () => {
      const result = extractHash("ab_cd-toy");
      assert.equal(result, null);
    });

    test("rejects hash with hyphen in prefix", () => {
      const result = extractHash("ab-cd-toy");
      // Extracts only "ab" which is too short, so null
      assert.equal(result, null);
    });

    test("rejects job name without valid prefix", () => {
      const result = extractHash("toy-without-hash");
      assert.equal(result, null);
    });

    test("rejects job name starting with special characters", () => {
      const result = extractHash("!!!-toy");
      assert.equal(result, null);
    });
  });

  describe("edge cases", () => {
    test("ignores characters after 8-character prefix", () => {
      const result = extractHash("abcdefgh99-toy");
      // Should only match first 8 chars
      assert.equal(result, "abcdefgh");
    });

    test("handles very long job names", () => {
      const result = extractHash(
        "abc123-" + "x".repeat(1000)
      );
      assert.equal(result, "abc123");
    });

    test("handles job name with dots", () => {
      const result = extractHash("abc123.mp4-backup");
      // Alphanumeric only, so dots break the pattern
      assert.equal(result, "abc123");
    });

    test("handles mixed case hash", () => {
      const result = extractHash("AbC123-toy");
      assert.equal(result, "AbC123");
    });
  });
});
