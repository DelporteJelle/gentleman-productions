"use client";

// import Image from "next/image";
import styles from "./styles.module.css";
import Socials from "./Socials";
import { Burger, Group, Image } from "@mantine/core";
import { usePathname, useRouter } from "next/navigation";
import Navigation from "./Navigation";
import { useEffect, useState } from "react";

export default function NavBar() {
  const router = useRouter();
  const [userRole, setUserRole] = useState<string | null>(null);

  useEffect(() => {
    // Fetch user role from API
    fetch("/api/auth/me")
      .then((res) => res.json())
      .then((data) => {
        setUserRole(data.user?.role || null);
      })
      .catch(() => {
        setUserRole(null);
      });
  }, []);

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
        <Navigation userRole={userRole} />
      </Group>

      <Socials white={true} />
    </div>
  );
}
