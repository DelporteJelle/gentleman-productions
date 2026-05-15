"use client";

import { ReactNode, MouseEventHandler } from "react";
import styles from "./GoldShimmerCTA.module.css";

type CommonProps = {
  children: ReactNode;
  ariaLabel?: string;
};

type AnchorProps = CommonProps & {
  href: string;
  target?: string;
  rel?: string;
  onClick?: MouseEventHandler<HTMLAnchorElement>;
};

type ButtonProps = CommonProps & {
  href?: undefined;
  onClick?: MouseEventHandler<HTMLButtonElement>;
};

type GoldShimmerCTAProps = AnchorProps | ButtonProps;

export default function GoldShimmerCTA(props: GoldShimmerCTAProps) {
  const content = (
    <>
      {props.children}
      <span className={styles.arrow} aria-hidden="true">&rarr;</span>
    </>
  );

  if (props.href !== undefined) {
    return (
      <a
        className={styles.cta}
        href={props.href}
        onClick={props.onClick}
        target={props.target}
        rel={props.rel}
        aria-label={props.ariaLabel}
      >
        {content}
      </a>
    );
  }

  return (
    <button
      type="button"
      className={styles.cta}
      onClick={props.onClick}
      aria-label={props.ariaLabel}
    >
      {content}
    </button>
  );
}
