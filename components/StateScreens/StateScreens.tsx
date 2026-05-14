"use client";

import { ReactNode } from "react";
import { useRouter } from "next/navigation";
import CanvasBackground from "@/components/Background/CanvasBackground";
import styles from "./StateScreens.module.css";

interface StateScreenProps {
  eyebrow: string;
  title: string;
  titleAccent: string;
  body?: ReactNode;
  action?: ReactNode;
  immediate?: boolean; // skip the 0.2s fade delay
}

function StateScreen({ eyebrow, title, titleAccent, body, action, immediate }: StateScreenProps) {
  return (
    <div className={styles.screen}>
      <div className={styles.canvasLayer}>
        <CanvasBackground />
      </div>
      <div className={`${styles.content} ${immediate ? styles.contentNoDelay : ""}`}>
        <div className={styles.ornament}>
          <span className={styles.ornamentLine}></span>
          <span className={styles.ornamentDiamond}>&#9670;</span>
          <span className={styles.ornamentLine}></span>
        </div>
        <div className={styles.eyebrow}>{eyebrow}</div>
        <h1 className={styles.title}>
          {title}{" "}
          <span className={styles.titleAccent}>{titleAccent}</span>
        </h1>
        {body && <p className={styles.body}>{body}</p>}
        {action}
        <div className={`${styles.ornament} ${styles.ornamentBottom}`}>
          <span className={styles.ornamentLine}></span>
          <span className={styles.ornamentDiamond}>&#9670;</span>
          <span className={styles.ornamentLine}></span>
        </div>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <StateScreen
      eyebrow="Intermission"
      title="The curtain"
      titleAccent="rises"
      body="Loading the archive"
      action={
        <div className={styles.dots} aria-label="Loading">
          <span className={styles.dot}></span>
          <span className={styles.dot}></span>
          <span className={styles.dot}></span>
        </div>
      }
    />
  );
}

interface ErrorScreenProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorScreen({ message, onRetry }: ErrorScreenProps) {
  const router = useRouter();
  return (
    <StateScreen
      immediate
      eyebrow="Encore interrupted"
      title="The lights"
      titleAccent="flickered"
      body={message ?? "Something went wrong loading this production."}
      action={
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.linkAction}
            onClick={() => router.push("/")}
          >
            &larr; Back to programme
          </button>
          <button
            type="button"
            className={styles.ghostButton}
            onClick={onRetry ?? (() => router.refresh())}
          >
            Try again
          </button>
        </div>
      }
    />
  );
}

export function NotFoundScreen() {
  const router = useRouter();
  return (
    <StateScreen
      immediate
      eyebrow="Act not in programme"
      title="Production"
      titleAccent="not found"
      body="The page you sought is not listed in our archive."
      action={
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.linkAction}
            onClick={() => router.push("/")}
          >
            &larr; Back to programme
          </button>
        </div>
      }
    />
  );
}
