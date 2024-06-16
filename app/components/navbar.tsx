import styles from "./navbar.module.css";
import Image from "next/image";
import { BsInstagram, BsFacebook, BsTwitterX } from "react-icons/bs";

export default function NavBar() {
  return (
    <div className={styles.navbar}>
      <div className={styles.logo}>
        <Image
          src="/GP-name.svg"
          alt="/home/"
          width={200}
          height={45}
          priority
        />
      </div>
      <div className={styles.navigation}>
        <a href="/">Home</a>

        <a href="/about/">About</a>

        <a href="/pictures/">Pictures</a>
      </div>
      <div className={styles.socials}>
        <a href="https://www.instagram.com/gentlemanproductions_official">
          <BsInstagram color="white" className="m-1" />
        </a>
        <a>
          <BsFacebook color="white" className="m-1" />
        </a>
        <a>
          <BsTwitterX color="white" className="m-1" />
        </a>
      </div>
    </div>
  );
}
