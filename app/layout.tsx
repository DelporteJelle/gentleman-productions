"use client";

import "/variables.css";
import "./globals.css";
import "@mantine/core/styles.css";
import NavBar from "../components/Navigation/Navbar";
import Footer from "../components/Navigation/Footer";
import "@mantine/carousel/styles.css";
import "@mantine/core/styles.css";
import React from "react";
import { MantineProvider, ColorSchemeScript } from "@mantine/core";
import { AppShell, Burger } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";

const RootLayout: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [opened, { toggle }] = useDisclosure(false);

  return (
    <html lang="en">
      <head>
        <ColorSchemeScript />
      </head>
      <body className={"root"}>
        <MantineProvider defaultColorScheme="dark">
          <AppShell
            layout="alt"
            navbar={{
              width: 300,
              breakpoint: "sm",
              collapsed: { desktop: !opened, mobile: !opened },
            }}
            padding="md"
          >
            <AppShell.Navbar></AppShell.Navbar>

            <header>
              <NavBar />
            </header>
            <main className="main">
              <Burger
                style={{ zIndex: 1000, position: "fixed", top: 10, left: 10 }}
                opened={opened}
                onClick={toggle}
                hiddenFrom="sm"
              />

              {children}
            </main>
            <footer>
              <Footer />
            </footer>
          </AppShell>
        </MantineProvider>
      </body>
    </html>
  );
};

export default RootLayout;
