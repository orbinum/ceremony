/** Client networks as per-address limits count them (KL-38): an IPv4 address, an IPv6 /64. */
import { describe, expect, it } from "vitest";
import { networkOf } from "../../src/middleware/network";

describe("networkOf", () => {
  it("keeps an IPv4 address, and an IPv4-mapped IPv6 one as that address", () => {
    expect(networkOf("203.0.113.7")).toBe("203.0.113.7");
    expect(networkOf("::ffff:203.0.113.7")).toBe("203.0.113.7");
    expect(networkOf("::ffff:cb00:7107")).toBe("203.0.113.7");
  });

  it("names an IPv6 address by its /64, however it is spelled", () => {
    const net = "2001:db8:1:2::/64";
    for (const ip of [
      "2001:db8:1:2::1",
      "2001:0db8:0001:0002:ffff:ffff:ffff:ffff",
      "2001:DB8:1:2:0:0:0:9",
      "2001:db8:1:2:a:b:1.2.3.4",
    ]) {
      expect(networkOf(ip)).toBe(net);
    }
    expect(networkOf("2001:db8:1:3::1")).toBe("2001:db8:1:3::/64");
    expect(networkOf("::1")).toBe("0:0:0:0::/64");
  });

  it("refuses what is not an address", () => {
    for (const ip of [
      "",
      "unknown",
      "256.0.0.1",
      "1.2.3",
      "01.2.3.4",
      "1:2:3:4:5:6:7:8:9",
      "1::2::3",
      "1:2:3:4:5:6:7",
      "12345::1",
      "::ffff:1.2.3.256",
      "fe80::1%eth0",
    ]) {
      expect(networkOf(ip)).toBeNull();
    }
  });
});
