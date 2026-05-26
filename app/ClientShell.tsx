"use client";

import "@mantine/core/styles.css";
import "@mantine/dates/styles.css";
import "@mantine/notifications/styles.css";

import React from "react";
import { MantineProvider, AppShell, Burger, Stack } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { Notifications } from "@mantine/notifications";

import NavBar from "../components/Navigation/Navbar";
import Footer from "../components/Navigation/Footer";
import Navigation from "@/components/Navigation/Navigation";
import { PostsProvider } from "./contexts/PostsContext";
import { AboutProvider } from "./contexts/AboutContext";
import { QueryProvider } from "./providers/QueryProvider";

const ClientShell: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [opened, { toggle }] = useDisclosure(false);

  return (
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
  );
};

export default ClientShell;
