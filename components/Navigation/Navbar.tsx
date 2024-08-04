"use client";

// import Image from "next/image";
import styles from "./styles.module.css";
import Socials from "./Socials";
import { Image } from "@mantine/core";
import { usePathname } from "next/navigation";

export default function NavBar() {
  const pathname = usePathname();
  console.log(pathname);
  return (
    <div className={styles.navbar}>
      <div className={styles.logo}>
        <Image src={"/GP-name.svg"} alt="/home/" width={200} height={45} />
      </div>
      <div className={styles.navigation}>
        <a href="/" className={pathname === "/" ? "active" : ""}>
          Home
        </a>

        <a href="/about/" className={pathname === "/about" ? "active" : ""}>
          About
        </a>

        <a
          href="/pictures/"
          className={pathname === "/pictures" ? "active" : ""}
        >
          Pictures
        </a>
      </div>
      <Socials white={true} />
    </div>
  );
}
