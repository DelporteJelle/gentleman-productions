"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import styles from "./Reserved.module.css";

function ReservedContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("order");
  const seatsParam = searchParams.get("seats");
  const seats = seatsParam ? seatsParam.split(",").filter(Boolean) : [];
  const plural = seats.length !== 1;

  return (
    <main className={styles.page}>
      <p className={styles.eyebrow}>Gentleman Productions</p>
      <h1 className={styles.title}>Plaats{plural ? "en" : ""} gereserveerd</h1>
      <p className={styles.copy}>
        {seats.length > 0 ? (
          <>Plaats{plural ? "en" : ""} <strong>{seats.join(", ")}</strong> {plural ? "zijn" : "is"} gereserveerd</>
        ) : (
          <>De geselecteerde plaats{plural ? "en zijn" : " is"} gereserveerd</>
        )}{" "}
        en niet meer beschikbaar voor verkoop. Download hieronder de QR-code
        {plural ? "s" : ""} en geef deze door aan de persoon die de plaats{plural ? "en" : ""} krijgt.
      </p>
      <a href={`/api/tickets/orders/${orderId}/pdf`} className={styles.downloadLink}>
        Download de QR-code{plural ? "s" : ""}
      </a>
      <p className={styles.note}>
        Je kan deze reservering later terugvinden in het tickets-overzicht: daar kan je de
        QR-code{plural ? "s" : ""} opnieuw downloaden, of de plaats{plural ? "en" : ""} weer
        vrijgeven zodat {plural ? "ze opnieuw verkocht kunnen" : "die opnieuw verkocht kan"} worden.
      </p>
      <Link href="/private/admin-portal" className={styles.backLink}>
        Naar het tickets-overzicht
      </Link>
    </main>
  );
}

export default function ReservedPage() {
  return (
    <Suspense
      fallback={
        <main className={styles.page}>
          <p className={styles.copy}>Laden...</p>
        </main>
      }
    >
      <ReservedContent />
    </Suspense>
  );
}
