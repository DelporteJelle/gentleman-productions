import styles from "./styles.module.css";
import Socials from "./Socials";
import { Burger, Group, Image } from "@mantine/core";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { listOrders, pruneOrders } from "@/lib/orderStore";

export default function Navigation() {
  const pathname = usePathname();
  const { data: userRole } = useQuery({
    queryKey: ["auth-me"],
    queryFn: async () => {
      const res = await fetch("/api/auth/me");
      const data = await res.json();
      return (data.user?.role as string | null) ?? null;
    },
  });
  const hasCreateAccess = userRole === "ADMIN" || userRole === "CREATE_ONLY";
  const isAdmin = userRole === "ADMIN";
  const isScanner = userRole === "SCANNER";

  // Read once on mount, not during render: localStorage does not exist during
  // the server pass, and reading it while rendering would mismatch the
  // server-rendered HTML (see components/SavedOrders/useSavedOrders.ts). A
  // full useSavedOrders() would also fire a network request per saved order
  // just to answer a yes/no question the nav asks on every page, so this
  // reads the store directly instead. Pruned before deciding, so a browser
  // holding only long-expired entries does not keep showing the link forever.
  const [hasSavedOrders, setHasSavedOrders] = useState(false);
  useEffect(() => {
    const storage = typeof window === "undefined" ? undefined : window.localStorage;
    setHasSavedOrders(pruneOrders(listOrders(storage), new Date()).length > 0);
  }, []);

  return (
    <>
      <a href="/" className={pathname === "/" ? "active" : ""}>
        Home
      </a>

      {hasCreateAccess ? (
        <a
          href="/private/about"
          className={pathname === "/private/about" ? "active" : ""}
        >
          About
        </a>
      ) : (
        <a href="/about/" className={pathname === "/about" ? "active" : ""}>
          About
        </a>
      )}

      {hasSavedOrders && (
        <a
          href="/mijn-tickets"
          className={pathname === "/mijn-tickets" ? "active" : ""}
        >
          Mijn tickets
        </a>
      )}

      {hasCreateAccess && (
        <a
          href="/private/posts"
          className={pathname === "/private/posts" ? "active" : ""}
        >
          Posts
        </a>
      )}

      {isAdmin && (
        <a
          href="/private/tickets"
          className={pathname === "/private/tickets" ? "active" : ""}
        >
          Tickets
        </a>
      )}

      {(isAdmin || isScanner) && (
        <a
          href="/private/scan"
          className={pathname === "/private/scan" ? "active" : ""}
        >
          Scan
        </a>
      )}

      {/* <a
          href="/pictures/"
          className={pathname === "/pictures" ? "active" : ""}
        >
          Pictures
        </a> */}
    </>
  );
}
