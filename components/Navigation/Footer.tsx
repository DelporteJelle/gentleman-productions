import {
  IconBrandFacebookFilled,
  IconBrandInstagram,
  IconBrandTiktokFilled,
} from "@tabler/icons-react";
import styles from "./styles.module.css";

export default function Footer() {
  return (
    <div className={styles.footer}>
      <div className={styles.footerTopOrnament}>
        <span className={styles.ftopLine}></span>
        <span className={styles.ftopMark}>&#9670;</span>
        <span className={styles.ftopLine}></span>
      </div>

      <div className={styles.footerBody}>
        <div>
          <div className={styles.footerLogoMark}>
            <span className={styles.gp}>G</span>entleman
          </div>
          <div className={styles.footerLogoSub}>Productions</div>
          <p className={styles.footerTagline}>
            Storytelling in motion — where every evening ends with a standing
            ovation.
          </p>
          {/* <div className={styles.footerEst}>
            <span className={styles.footerEstStar}>&#9733;</span>
            Est · MMXIV · Merelbeke
            <span className={styles.footerEstStar}>&#9733;</span>
          </div> */}
        </div>

        <div className={styles.footerCol}>
          <h4>Contact</h4>
          <a href="mailto:gentlemanproductions.official@gmail.com">
            gentlemanproductions.official@gmail.com
          </a>
        </div>

        <div className={styles.footerCol}>
          <h4>Address</h4>
          <p className={styles.accent}>Bergbosstraat 55</p>
          <p>9820 Merelbeke</p>
          <p>Belgium</p>
        </div>

        <div className={styles.footerCol}>
          <h4>Follow</h4>
          <div className={styles.footerSocials}>
            <a
              href="https://www.instagram.com/gentlemanproductions_official"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerSocialLink}
              aria-label="Instagram"
            >
              <IconBrandInstagram size={18} stroke={1.6} />
            </a>
            <a
              href="https://www.facebook.com/gentlemanproductions.official"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerSocialLink}
              aria-label="Facebook"
            >
              <IconBrandFacebookFilled size={18} stroke={1.6} />
            </a>
            <a
              href="https://www.tiktok.com/@gentlemanproductions"
              target="_blank"
              rel="noopener noreferrer"
              className={styles.footerSocialLink}
              aria-label="TikTok"
            >
              <IconBrandTiktokFilled size={18} stroke={1.6} />
            </a>
          </div>
        </div>
      </div>

      {/* <div className={styles.footerBottom}>
        <div className={styles.footerBottomDeco}>
          <span>&#9670;</span> &copy; {new Date().getFullYear()} Gentleman
          Productions <span>&#9670;</span> All rights reserved
        </div>
        <div className={styles.footerBottomDeco}>
          Designed for the stage <span>&#9670;</span>
        </div>
      </div> */}
    </div>
  );
}
