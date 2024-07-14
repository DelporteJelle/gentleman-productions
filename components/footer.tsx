import styles from "./bar.module.css";
import Image from "next/image";
import { BsInstagram, BsFacebook, BsTwitterX } from "react-icons/bs";

export default function Footer() {
  return (
    <div className={styles.footer}>
      <div className={styles.logo}>
        <Image
          src="/GP-logo.svg"
          alt="/home/"
          width={45}
          height={45}
          priority
        />
      </div>
      <div className="d-flex flex-row">
        <div className="d-flex flex-column align-items-center mx-3">
          <span className="fw-bold text-decoration-underline ">Contact</span>
          <span>04 12 34 56 78</span>
          <span>email@gmail.com</span>
        </div>
        <div className="d-flex flex-column align-items-center mx-3">
          <span className="fw-bold text-decoration-underline">Address</span>
          <span>xxxxxxxxxx</span>
          <span>Merelbeke</span>
        </div>
      </div>
      <div className={styles.socials}>
        <a href="https://www.instagram.com/gentlemanproductions_official">
          <BsInstagram color="black" className="m-1" />
        </a>
        <a>
          <BsFacebook color="black" className="m-1" />
        </a>
        <a>
          <BsTwitterX color="black" className="m-1" />
        </a>
      </div>
    </div>
  );
}
