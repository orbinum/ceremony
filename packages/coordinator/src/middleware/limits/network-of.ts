/**
 * The network a client address belongs to, as per-address rate limits count it, or null if it is
 * not an IP address: an IPv4 address as is, an IPv4-mapped IPv6 address (`::ffff:a.b.c.d`) as that
 * IPv4 client, any other IPv6 address by its /64 (one host is routed a whole /64 and may send from
 * any address in it).
 */
const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
const HEXTET = /^[0-9a-f]{1,4}$/;

function hextets(address: string): number[] | null {
  let text = address.toLowerCase();
  const tail = text.slice(text.lastIndexOf(":") + 1);
  if (tail.includes(".")) {
    if (!IPV4.test(tail)) return null;
    const [a, b, c, d] = tail.split(".").map(Number) as [number, number, number, number];
    const groups = `${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
    text = `${text.slice(0, text.length - tail.length)}${groups}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const parts = halves.map((h) => (h === "" ? [] : h.split(":")));
  if (!parts.flat().every((g) => HEXTET.test(g))) return null;
  const [head = [], rest = []] = parts;
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? missing !== 0 : missing < 1) return null;
  return [...head, ...Array<string>(halves.length === 1 ? 0 : missing).fill("0"), ...rest].map(
    (g) => Number.parseInt(g, 16),
  );
}

export function networkOf(address: string): string | null {
  if (IPV4.test(address)) return address;
  const h = hextets(address);
  if (!h) return null;
  if (h.slice(0, 5).every((g) => g === 0) && h[5] === 0xffff) {
    const [hi = 0, lo = 0] = h.slice(6);
    return [hi >> 8, hi & 0xff, lo >> 8, lo & 0xff].join(".");
  }
  return `${h
    .slice(0, 4)
    .map((g) => g.toString(16))
    .join(":")}::/64`;
}
