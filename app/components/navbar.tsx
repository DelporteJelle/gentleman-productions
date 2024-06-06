import styles from "./navbar.module.css";
import Image from "next/image";
import { BsInstagram } from "react-icons/bs";

export default function NavBar() {
  return (
    <div className={styles.navbar}>
      <div className="logo">
        <Image
          src="/GP-name.svg"
          alt="/home/"
          width={200}
          height={50}
          priority
        />
      </div>
      <div className="navigation">
        <a href="/">Home</a>

        <a href="/about/">About</a>

        <a href="/pictures/">Pictures</a>
      </div>
      <div className="socials">
        <BsInstagram color="white" />
      </div>
    </div>
  );
}
