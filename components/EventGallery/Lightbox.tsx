"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { IconX, IconChevronLeft, IconChevronRight } from "@tabler/icons-react";
import styles from "./Lightbox.module.css";

interface LightboxProps {
  images: string[];
  title: string;
  index: number | null;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
}

export default function Lightbox({ images, title, index, onClose, onPrev, onNext }: LightboxProps) {
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (index === null) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    closeBtnRef.current?.focus();

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") onPrev();
      else if (e.key === "ArrowRight") onNext();
    };
    window.addEventListener("keydown", onKey);

    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      previousFocusRef.current?.focus();
    };
  }, [index, onClose, onPrev, onNext]);

  if (index === null || typeof document === "undefined") return null;

  const src = images[index];
  if (!src) return null;

  return createPortal(
    <div
      className={styles.overlay}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Image gallery"
    >
      <button
        ref={closeBtnRef}
        type="button"
        className={`${styles.iconButton} ${styles.close}`}
        onClick={(e) => { e.stopPropagation(); onClose(); }}
        aria-label="Close gallery"
      >
        <IconX size={24} stroke={1.5} />
      </button>

      {images.length > 1 && (
        <>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.prev}`}
            onClick={(e) => { e.stopPropagation(); onPrev(); }}
            aria-label="Previous image"
          >
            <IconChevronLeft size={24} stroke={1.5} />
          </button>
          <button
            type="button"
            className={`${styles.iconButton} ${styles.next}`}
            onClick={(e) => { e.stopPropagation(); onNext(); }}
            aria-label="Next image"
          >
            <IconChevronRight size={24} stroke={1.5} />
          </button>
        </>
      )}

      <img
        src={src}
        alt={`${title} — image ${index + 1}`}
        className={styles.image}
        loading="eager"
        onClick={(e) => e.stopPropagation()}
      />

      <div className={styles.caption}>
        Image {index + 1} / {images.length}
      </div>
    </div>,
    document.body,
  );
}
