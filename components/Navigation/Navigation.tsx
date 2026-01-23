import styles from "./styles.module.css";
import Socials from "./Socials";
import { Burger, Group, Image } from "@mantine/core";
import { usePathname, useRouter } from "next/navigation";

interface NavigationProps {
  userRole?: string | null;
}

export default function Navigation({ userRole }: NavigationProps) {
  const pathname = usePathname();
  const hasCreateAccess = userRole === "ADMIN" || userRole === "CREATE_ONLY";

  return (
    <>
      <a href="/" className={pathname === "/" ? "active" : ""}>
        Home
      </a>

      {hasCreateAccess ? (
        <a
          href="/private/about/"
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
