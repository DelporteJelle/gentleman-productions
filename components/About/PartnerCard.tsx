import { Partner } from "@/types";
import styles from "./PartnerCard.module.css";

interface PartnerCardProps {
  partner: Partner;
}

export default function PartnerCard({ partner }: PartnerCardProps) {
  return (
    <article className={styles.card} tabIndex={0}>
      <div className={styles.logoTile}>
        {partner.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={partner.logo}
            alt={partner.partner_name}
            className={styles.logo}
          />
        )}
      </div>
      <h3 className={styles.name}>{partner.partner_name}</h3>
      {partner.description && (
        <p className={styles.description}>{partner.description}</p>
      )}
    </article>
  );
}
