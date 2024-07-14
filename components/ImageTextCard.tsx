import styles from "../components/card.module.css";
import Image from "next/image";

interface props {
  event: any;
  index: any;
}

export default function ImageTextCard({ event, index }: props) {
  return (
    <div
      key={index}
      className={`d-flex flex-row my-5 ${index % 2 && "flex-row-reverse"}`}
    >
      <div className={styles.card_left}>
        <Image
          src={event.imageSrc}
          alt={event.title}
          width={500}
          height={300}
          style={{ objectFit: "contain" }}
        />
      </div>
      <div className={styles.card_right} style={{ width: `600px` }}>
        <div className="subheader">{event.title}</div>

        <div className="date mt-4">
          {event.dates.map((date: Date, index: number) => (
            <span key={index}>
              {date.toLocaleDateString("nl-BE", {
                day: "numeric",
                month: "long",
                year: "numeric",
              })}
              {index === 0 && event.dates.length > 1 ? " - " : ""}
            </span>
          ))}
        </div>
        <div style={{ whiteSpace: "pre-wrap" }}>{event.text}</div>
        <div className="btn-yellow">More info</div>
      </div>
    </div>
  );
}
