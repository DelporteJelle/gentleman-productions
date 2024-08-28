import {
  IconBrandFacebookFilled,
  IconBrandInstagram,
  IconBrandTiktokFilled,
} from "@tabler/icons-react";
import styles from "./styles.module.css";

export default function Socials({ white }: { white?: boolean }) {
  return (
    <div className={styles.socials}>
      <a
        href="https://www.instagram.com/gentlemanproductions_official"
        target="_blank"
      >
        <IconBrandInstagram color={white ? "white" : "black"} className="m-1" />
      </a>
      <a
        href="https://www.facebook.com/gentlemanproductions.official"
        target="_blank"
      >
        <IconBrandFacebookFilled
          color={white ? "white" : "black"}
          className="m-1"
        />
      </a>
      <a href="https://www.tiktok.com/@gentlemanproductions" target="_blank">
        <IconBrandTiktokFilled
          color={white ? "white" : "black"}
          className="m-1"
        />
      </a>
    </div>
  );
}
