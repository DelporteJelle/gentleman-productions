import Image from "next/image";
import styles from "./page.module.css";
import Link from "next/link";

export default function Home() {
  return (
    <main className={styles.main}>
      <Image
        src="/GP-logo.svg"
        alt="/home/"
        width={300}
        height={300}
        priority
      />
    </main>
  );
}
