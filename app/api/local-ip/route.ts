import { NextResponse } from 'next/server';
import os from 'os';

/**
 * GET /api/local-ip
 * Returns the best LAN IP address of the server machine.
 * Works universally across different computers and network configs.
 *
 * Priority:
 * 1. 192.168.x.x  (home/office WiFi — most common)
 * 2. 10.x.x.x     (corporate LAN)
 * 3. 172.16-31.x.x (private range)
 * Excludes: loopback (127.x), link-local (169.254.x), VPN virtual adapters
 */
export async function GET() {
  try {
    const interfaces = os.networkInterfaces();
    const candidates: { ip: string; priority: number; name: string }[] = [];

    for (const [ifName, addrs] of Object.entries(interfaces)) {
      if (!addrs) continue;

      // Skip obvious VPN / virtual adapters by interface name
      const nameLower = ifName.toLowerCase();
      const isVirtual =
        nameLower.includes('vmware') ||
        nameLower.includes('virtualbox') ||
        nameLower.includes('vethernet') ||
        nameLower.includes('hyper-v') ||
        nameLower.includes('loopback') ||
        nameLower.includes('pseudo');

      for (const addr of addrs) {
        if (addr.family !== 'IPv4' || addr.internal) continue;

        const ip = addr.address;

        // Skip link-local (169.254.x.x — APIPA, no DHCP)
        if (ip.startsWith('169.254.')) continue;

        // Skip loopback range
        if (ip.startsWith('127.')) continue;

        // Score by common LAN range (higher = preferred)
        let priority = 0;
        if (ip.startsWith('192.168.')) priority = 30;
        else if (ip.startsWith('10.')) priority = 20;
        else if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) priority = 10;
        else priority = 1; // public IP or unknown private — lowest priority

        // Prefer non-virtual adapters
        if (!isVirtual) priority += 5;

        candidates.push({ ip, priority, name: ifName });
      }
    }

    if (candidates.length === 0) {
      return NextResponse.json({
        ip: '127.0.0.1',
        error: 'Không tìm thấy địa chỉ IP mạng LAN',
        all: [],
      });
    }

    // Sort by priority descending, pick the best
    candidates.sort((a, b) => b.priority - a.priority);
    const best = candidates[0];

    return NextResponse.json({
      ip: best.ip,
      interface: best.name,
      all: candidates.map(c => ({ ip: c.ip, interface: c.name })),
    });
  } catch (err: any) {
    return NextResponse.json({ ip: '127.0.0.1', error: err.message });
  }
}
