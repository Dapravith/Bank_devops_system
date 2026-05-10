import type { Metadata } from 'next';
import { Nav } from '@/components/Nav';
import './globals.css';

export const metadata: Metadata = {
  title: 'banking-devops-platform · ops console',
  description: 'Operations dashboard for banking-devops-platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <div className="layout">
          <Nav />
          <main className="container">{children}</main>
          <footer>
            banking-devops-platform v2.0 · ops console (not a customer banking app)
          </footer>
        </div>
      </body>
    </html>
  );
}
