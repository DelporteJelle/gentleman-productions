import { ReactNode } from "react";
import styles from "./SectionLabel.module.css";

interface SectionLabelProps {
  children: ReactNode;
  id?: string;
}

export default function SectionLabel({ children, id }: SectionLabelProps) {
  return (
    <h2 id={id} className={styles.label}>
      <span className={styles.line}></span>
      <span className={styles.diamond}>&#9670;</span>
      {children}
      <span className={styles.diamond}>&#9670;</span>
      <span className={styles.line}></span>
    </h2>
  );
}
