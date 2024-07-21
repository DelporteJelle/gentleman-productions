"use client";

// import Image from "next/image";
import { BsInstagram, BsFacebook, BsTwitterX } from "react-icons/bs";
import styles from "./styles.module.css";
import Socials from "./Socials";
import { Image } from "@mantine/core";

export default function NavBar() {
  return (
    <div className={styles.navbar}>
      <div className={styles.logo}>
        <Image src={"/GP-name.svg"} alt="/home/" width={200} height={45} />
      </div>
      <div className={styles.navigation}>
        <a href="/">Home</a>

        <a href="/about/">About</a>

        <a href="/pictures/">Pictures</a>
      </div>
      <Socials white={true} />
    </div>
  );
}
