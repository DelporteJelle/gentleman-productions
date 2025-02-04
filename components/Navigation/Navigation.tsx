import styles from "./styles.module.css";
import Socials from "./Socials";
import { Burger, Group, Image } from "@mantine/core";
import { usePathname, useRouter } from "next/navigation";
export default function Navigation() {
  const pathname = usePathname();

  return (
    <>
      <a href="/" className={pathname === "/" ? "active" : ""}>
        Home
      </a>

      <a href="/about/" className={pathname === "/about" ? "active" : ""}>
        About
      </a>

      {/* <a
          href="/pictures/"
          className={pathname === "/pictures" ? "active" : ""}
        >
          Pictures
        </a> */}
    </>
  );
}
