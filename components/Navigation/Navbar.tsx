"use client";

// import Image from "next/image";
import styles from "./styles.module.css";
import Socials from "./Socials";
import { Burger, Group, Image } from "@mantine/core";
import { usePathname, useRouter } from "next/navigation";
import Navigation from "./Navigation";

export default function NavBar() {
  const router = useRouter();

  return (
    <div className={styles.navbar}>
      <div
        className={styles.logo}
        onClick={() => {
          router.push("/");
        }}
      >
        <Image src={"/GP-name.svg"} alt="/home/" width={200} height={50} />
      </div>
      <Group className={styles.navigation} visibleFrom="sm">
        <Navigation />
      </Group>

      <Socials white={true} />
    </div>
  );
}
