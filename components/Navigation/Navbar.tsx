"use client";

// import Image from "next/image";
import styles from "./styles.module.css";
import Socials from "./Socials";
import { Burger, Group, Image } from "@mantine/core";
import { usePathname, useRouter } from "next/navigation";

export default function NavBar() {
  const pathname = usePathname();
  const router = useRouter();

  return (
    <div className={styles.navbar}>
      <div
        className={styles.logo}
        onClick={() => {
          router.push("/");
        }}
      >
        <Image src={"/GP-name.svg"} alt="/home/" width={200} height={45} />
      </div>
      {/* <Group className={styles.navigation} visibleFrom="sm">
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
      </Group> */}
      <Socials white={true} />
    </div>
  );
}
