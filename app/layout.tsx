"use client";

import "../variables.css";
import "./globals.css";
import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/core/styles.css";
import "@mantine/notifications/styles.css";

import NavBar from "../components/Navigation/Navbar";
import Footer from "../components/Navigation/Footer";
import React from "react";
import Navbar from "../components/Navigation/Navbar";
import Navigation from "@/components/Navigation/Navigation";

import { MantineProvider, ColorSchemeScript, Stack } from "@mantine/core";
import { AppShell, Burger } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { PostsProvider } from "./contexts/PostsContext";
import { AboutProvider } from "./contexts/AboutContext";
import { Notifications } from "@mantine/notifications";
import { QueryProvider } from "./providers/QueryProvider";
import { Analytics } from "@vercel/analytics/next";

const RootLayout: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [opened, { toggle }] = useDisclosure(false);

  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <ColorSchemeScript />
      </head>
      <body className={"root"}>
        <MantineProvider defaultColorScheme="dark">
          <Notifications />
          <QueryProvider>
          <PostsProvider>
            <AboutProvider>
              <AppShell
                layout="alt"
                navbar={{
                  width: 300,
                  breakpoint: "sm",
                  collapsed: { desktop: !opened, mobile: !opened },
                }}
                padding="md"
              >
                <AppShell.Navbar>
                  <Stack m={40}>
                    <Navigation />
                  </Stack>
                </AppShell.Navbar>

                <header>
                  <NavBar />
                </header>
                <main className="main">
                  <Burger
                    style={{
                      zIndex: 1000,
                      position: "fixed",
                      top: 10,
                      left: 10,
                    }}
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
            </AboutProvider>
          </PostsProvider>
          </QueryProvider>
        </MantineProvider>
        <Analytics />
      </body>
    </html>
  );
};

export default RootLayout;
