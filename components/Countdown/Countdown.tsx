"use client";

import { useEffect, useState } from "react";
import styles from "./Countdown.module.css";

interface CountdownProps {
  target: Date | string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

function diff(target: Date): TimeLeft {
  const ms = Math.max(0, target.getTime() - Date.now());
  return {
    days: Math.floor(ms / 86_400_000),
    hours: Math.floor((ms % 86_400_000) / 3_600_000),
    minutes: Math.floor((ms % 3_600_000) / 60_000),
    seconds: Math.floor((ms % 60_000) / 1000),
  };
}

const pad = (n: number) => String(Math.max(0, n)).padStart(2, "0");

export default function Countdown({ target }: CountdownProps) {
  const targetDate = typeof target === "string" ? new Date(target) : target;
  const [time, setTime] = useState<TimeLeft | null>(null);

  useEffect(() => {
    setTime(diff(targetDate));
    const id = setInterval(() => setTime(diff(targetDate)), 1000);
    return () => clearInterval(id);
  }, [targetDate]);

  if (!time) return null;
  if (
    time.days === 0 &&
    time.hours === 0 &&
    time.minutes === 0 &&
    time.seconds === 0
  ) {
    return null;
  }

  return (
    <div className={styles.countdown} aria-label="Time until event">
      <div className={styles.box}>
        <div className={styles.num}>{time.days}</div>
        <div className={styles.label}>Days</div>
      </div>
      <div className={styles.sep}>:</div>
      <div className={styles.box}>
        <div className={styles.num}>{pad(time.hours)}</div>
        <div className={styles.label}>Hours</div>
      </div>
      <div className={styles.sep}>:</div>
      <div className={styles.box}>
        <div className={styles.num}>{pad(time.minutes)}</div>
        <div className={styles.label}>Minutes</div>
      </div>
      <div className={styles.sep}>:</div>
      <div className={styles.box}>
        <div className={styles.num}>{pad(time.seconds)}</div>
        <div className={styles.label}>Seconds</div>
      </div>
    </div>
  );
}
