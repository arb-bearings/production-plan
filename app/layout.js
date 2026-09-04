// app/layout.js
import './globals.css';

export const metadata = {
  title: 'ARB Bearings - Production Planning & Analytics Dashboard',
  description: 'Premium AI-Predicted Production Planning & Analytics platform for ARB Bearings.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link href="https://fonts.googleapis.com/icon?family=Material+Icons+Round" rel="stylesheet" />
      </head>
      <body className="light-theme">
        {children}
      </body>
    </html>
  );
}
