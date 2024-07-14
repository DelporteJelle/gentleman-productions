import Image from "next/image";
import styles from "./styles.module.css";
import { FaCalendarAlt } from "react-icons/fa";
import { FaMapLocationDot } from "react-icons/fa6";
import { FaEuroSign } from "react-icons/fa";

export default function TicketCard({ ticket }: { ticket: any }) {
  console.log(ticket);
  return (
    <div className={styles.card}>
      <Image
        src={ticket.imgSrc}
        alt={ticket.title}
        width={500}
        height={300}
        style={{ objectFit: "cover" }}
      />
      <div className={styles.content}>
        <div className="subheader bold">{ticket.title}</div>
        <div className="date d-flex my-2 ">
          <FaCalendarAlt className="me-2" />
          <span className="mx-1">
            {ticket.start.toLocaleDateString("nl-BE", {
              day: "numeric",
              month: "long",
              year: "numeric",
            })}
          </span>
          <span className="mx-1">
            {ticket.start.toLocaleTimeString("nl-BE", {
              hour: "numeric",
              minute: "numeric",
            })}
          </span>
          {"-"}
          <span className="mx-1">
            {ticket.end.toLocaleTimeString("nl-BE", {
              hour: "numeric",
              minute: "numeric",
            })}
          </span>
        </div>
        <div className="d-flex">
          <FaMapLocationDot className="me-2" />
          {ticket.place.location}
        </div>
      </div>
      <div className={styles.price}>
        <FaEuroSign />
        {ticket.price}
      </div>
    </div>
  );
}
