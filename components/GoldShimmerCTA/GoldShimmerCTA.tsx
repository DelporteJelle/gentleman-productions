"use client";

import { ReactNode, MouseEventHandler } from "react";
import styles from "./GoldShimmerCTA.module.css";

type GoldShimmerCTAProps = {
  children: ReactNode;
  href?: string;
  target?: string;
  rel?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement | HTMLButtonElement>;
  disabled?: boolean;
  ariaLabel?: string;
};

export default function GoldShimmerCTA({
  children,
  href,
  target,
  rel,
  onClick,
  disabled,
  ariaLabel,
}: GoldShimmerCTAProps) {
  const content = (
    <>
      {children}
      <span className={styles.arrow} aria-hidden="true">&rarr;</span>
    </>
  );

  if (href !== undefined) {
    return (
      <a
        className={styles.cta}
        href={href}
        onClick={onClick as MouseEventHandler<HTMLAnchorElement>}
        target={target}
        rel={rel}
        aria-label={ariaLabel}
        data-disabled={disabled ? "true" : undefined}
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
      disabled={disabled}
      aria-label={ariaLabel}
    >
      {content}
    </button>
  );
}
