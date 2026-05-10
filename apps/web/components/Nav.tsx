'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'Dashboard' },
  { href: '/transactions', label: 'Transactions' },
  { href: '/notify', label: 'Notify' },
  { href: '/system', label: 'System' },
];

export function Nav() {
  const pathname = usePathname() ?? '/';
  return (
    <nav className="nav">
      <span className="brand">banking-devops-platform</span>
      {links.map((l) => {
        const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
        return (
          <Link key={l.href} href={l.href} className={active ? 'active' : ''}>
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
