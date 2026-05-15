"use client";

import { ReactNode, MouseEventHandler } from "react";
import styles from "./GoldShimmerCTA.module.css";

interface GoldShimmerCTAProps {
  children: ReactNode;
  href?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
  target?: string;
  rel?: string;
  ariaLabel?: string;
}

export default function GoldShimmerCTA({
  children,
  href,
  onClick,
  target,
  rel,
  ariaLabel,
}: GoldShimmerCTAProps) {
  const content = (
    <>
      {children}
      <span className={styles.arrow} aria-hidden="true">&rarr;</span>
    </>
  );

  if (href) {
    return (
      <a
        className={styles.cta}
        href={href}
        onClick={onClick as MouseEventHandler<HTMLAnchorElement>}
        target={target}
        rel={rel}
        aria-label={ariaLabel}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={styles.cta}
      onClick={onClick as MouseEventHandler<HTMLButtonElement>}
      aria-label={ariaLabel}
    >
      {content}
    </button>
  );
}
