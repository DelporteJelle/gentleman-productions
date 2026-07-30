"use client";

import styles from "./SavedOrders.module.css";

const CONTACT_EMAIL = "gentlemanproductions.official@gmail.com";

/**
 * Shown wherever we tell someone their order did not complete.
 *
 * The order id travels in the subject on purpose: the one person for whom
 * "je reservering is verlopen" is wrong is the one whose payment silently
 * succeeded, and this turns their complaint into a single lookup instead of
 * a shrug.
 */
export default function ContactNote({ orderId }: { orderId: string }) {
  const href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(`Bestelling ${orderId}`)}`;
  return (
    <p className={styles.note}>
      Heb je toch betaald maar geen tickets ontvangen?{" "}
      <a href={href} className={styles.noteLink}>
        Neem contact met ons op
      </a>
      .
    </p>
  );
}
