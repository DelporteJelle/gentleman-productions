import "/variables.css";
import "./globals.css";
import "@mantine/core/styles.css";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import NavBar from "../components/Navigation/Navbar";
import Footer from "../components/Navigation/Footer";
import { MantineProvider } from "@mantine/core";

export const metadata: Metadata = {
  title: "Gentleman Productions",
  description: "",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={"root"}>
        <MantineProvider defaultColorScheme="dark">
          <header>
            <NavBar />
          </header>
          <main className="main">{children}</main>
          <footer>
            <Footer />
          </footer>
        </MantineProvider>
      </body>
    </html>
  );
}
