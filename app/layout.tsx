import './globals.css';

export const metadata = {
  title: "LAX EDGE — NCAA D1 Men's Lacrosse Predictions",
  description: 'Matchup predictor, daily picks, and rankings for NCAA D1 men\'s lacrosse.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
