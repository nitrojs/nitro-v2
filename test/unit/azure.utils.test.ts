import { describe, expect, it } from "vitest";
import { getAzureParsedCookiesFromHeaders } from "../../src/runtime/internal/utils.azure";

describe("getAzureParsedCookiesFromHeaders", () => {
  it("returns empty array if no cookies", () => {
    expect(getAzureParsedCookiesFromHeaders({})).toMatchObject([]);
  });
  it("returns empty array if no set-cookie header", () => {
    expect(
      getAzureParsedCookiesFromHeaders({ "set-cookie": undefined })
    ).toMatchObject([]);
  });
  it("returns empty array if empty set-cookie header", () => {
    expect(
      getAzureParsedCookiesFromHeaders({ "set-cookie": " " })
    ).toMatchObject([]);
  });
  it("returns single cookie", () => {
    expect(
      getAzureParsedCookiesFromHeaders({ "set-cookie": "foo=bar" })
    ).toMatchObject([
      {
        name: "foo",
        value: "bar",
      },
    ]);
  });
  it('returns cookie with "expires" attribute', () => {
    expect(
      getAzureParsedCookiesFromHeaders({
        "set-cookie": "foo=bar; expires=Thu, 01 Jan 1970 00:00:00 GMT",
      })
    ).toMatchObject([
      {
        name: "foo",
        value: "bar",
        expires: new Date("1970-01-01T00:00:00.000Z"),
      },
    ]);
  });
  it("returns a complex cookie", () => {
    expect(
      getAzureParsedCookiesFromHeaders({
        "set-cookie": [
          "session=xyz; Path=/; Expires=Sun, 24 Mar 2024 09:13:27 GMT; HttpOnly; SameSite=Strict",
        ],
      })
    ).toMatchObject([
      {
        name: "session",
        value: "xyz",
        expires: new Date("2024-03-24T09:13:27.000Z"),
        path: "/",
        sameSite: "Strict",
        httpOnly: true,
      },
    ]);
  });
  it("returns multiple cookies", () => {
    expect(
      getAzureParsedCookiesFromHeaders({
        "set-cookie": ["foo=bar", "baz=qux"],
      })
    ).toMatchObject([
      {
        name: "foo",
        value: "bar",
      },
      {
        name: "baz",
        value: "qux",
      },
    ]);
  });
  it("returns multiple cookies given as string", () => {
    expect(
      getAzureParsedCookiesFromHeaders({
        "set-cookie": "foo=bar, baz=qux",
      })
    ).toMatchObject([
      {
        name: "foo",
        value: "bar",
      },
      {
        name: "baz",
        value: "qux",
      },
    ]);
  });
  it("strips surrounding double quotes from values", () => {
    expect(
      getAzureParsedCookiesFromHeaders({
        "set-cookie": ['q="quoted value"; Path=/', 'empty=""'],
      })
    ).toMatchObject([
      { name: "q", value: "quoted value", path: "/" },
      { name: "empty", value: "" },
    ]);
  });
  it("trims all whitespace around values", () => {
    expect(
      getAzureParsedCookiesFromHeaders({
        "set-cookie": ["nl=val\n; Path=/", "nbsp= val "],
      })
    ).toMatchObject([
      { name: "nl", value: "val", path: "/" },
      { name: "nbsp", value: "val" },
    ]);
  });
  it("strips an unclosed leading double quote like cookie-es v2", () => {
    expect(
      getAzureParsedCookiesFromHeaders({ "set-cookie": 'q="abc' })
    ).toMatchObject([{ name: "q", value: "ab" }]);
  });
  it("decodes percent-encoded values", () => {
    expect(
      getAzureParsedCookiesFromHeaders({
        "set-cookie": ["u=%E2%9C%93", "bad=%E0%A4%A"],
      })
    ).toMatchObject([
      { name: "u", value: "✓" },
      { name: "bad", value: "%E0%A4%A" },
    ]);
  });
  it("converts all attributes of multiple cookies", () => {
    expect(
      getAzureParsedCookiesFromHeaders({
        "set-cookie":
          "a=1; Domain=example.com; Path=/foo; Expires=Wed, 21 Oct 2015 07:28:00 GMT; HttpOnly, b=2; Max-Age=60; Secure; SameSite=None",
      })
    ).toEqual([
      {
        name: "a",
        value: "1",
        domain: "example.com",
        path: "/foo",
        expires: new Date("2015-10-21T07:28:00.000Z"),
        sameSite: undefined,
        maxAge: undefined,
        secure: undefined,
        httpOnly: true,
      },
      {
        name: "b",
        value: "2",
        domain: undefined,
        path: undefined,
        expires: undefined,
        sameSite: "None",
        maxAge: 60,
        secure: true,
        httpOnly: undefined,
      },
    ]);
  });
});
