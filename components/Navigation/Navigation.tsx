import styles from "./styles.module.css";
import Socials from "./Socials";
import { Burger, Group, Image } from "@mantine/core";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";

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

      {hasCreateAccess && (
        <a
          href="/private/posts"
          className={pathname === "/private/posts" ? "active" : ""}
        >
          Posts
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
