import Image from "next/image";
import styles from "./page.module.css";
import Link from "next/link";

export default function Home() {
  return (
    <main className={styles.main}>
      <div className={styles.hightlight}>
        <div className={styles.title}>
          End of the line<div className={styles.line}></div>
        </div>
        <div>SAVE THE DATE</div>
        <div className={styles.date}>10 September 2024</div>
        <button className="btn-red">Buy tickets here</button>
      </div>
      {/* anouncements section */}
      <div className="d-flex flex-column align-items-center">
        {/* future events */}

        <div className="d-flex flex-column align-items-center my-5">
          <div className="header">Upcomming events</div>
          <div className="d-flex flex-row my-5">
            <div className="m-4">
              <Image
                src="/end-of-the-line.PNG"
                alt="event"
                width={650}
                height={300}
                style={{ objectFit: "contain" }}
              />
            </div>
            <div
              className="d-flex flex-column justify-content-center m-4"
              style={{ width: "650px" }}
            >
              <div className="subheader">Event 1</div>
              <div className="date">12 juli 2024</div>
              <div>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam
                porttitor risus purus. Maecenas vulputate lorem quam, ac dapibus
                lectus tristique nec. Vestibulum quis neque in augue rhoncus
                congue. Orci varius natoque penatibus et magnis dis parturient
                montes, nascetur ridiculus mus. Lorem ipsum dolor sit amet,
                consectetur adipiscing elit. Nullam porttitor risus purus.
                Maecenas vulputate lorem quam, ac dapibus lectus tristique nec.
                Vestibulum quis neque in augue rhoncus congue. Orci varius
                natoque penatibus et magnis dis parturient montes, nascetur
                ridiculus mus.
              </div>
              <div className="btn-yellow">More info</div>
            </div>
          </div>
          <div className="d-flex flex-row">
            <div
              className="d-flex flex-column justify-content-center m-4"
              style={{ width: "650px" }}
            >
              <div className="subheader">Event 1</div>
              <div className="date">12 juli 2024</div>
              <div>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam
                porttitor risus purus. Maecenas vulputate lorem quam, ac dapibus
                lectus tristique nec. Vestibulum quis neque in augue rhoncus
                congue. Orci varius natoque penatibus et magnis dis parturient
                montes, nascetur ridiculus mus. Lorem ipsum dolor sit amet,
                consectetur adipiscing elit. Nullam porttitor risus purus.
                Maecenas vulputate lorem quam, ac dapibus lectus tristique nec.
                Vestibulum quis neque in augue rhoncus congue. Orci varius
                natoque penatibus et magnis dis parturient montes, nascetur
                ridiculus mus.
              </div>
              <div className="btn-yellow">More info</div>
            </div>
            <div className="m-4">
              <Image
                src="/end-of-the-line.PNG"
                alt="event"
                width={650}
                height={300}
                style={{ objectFit: "contain" }}
              />
            </div>
          </div>
          <div className={styles.event_left}></div>
        </div>
        {/* past events */}

        <div className="d-flex flex-column align-items-center my-5">
          <div className="header">Past events</div>
          <div className="d-flex flex-row my-5">
            <div className="m-4">
              <Image
                src="/end-of-the-line.PNG"
                alt="event"
                width={650}
                height={300}
                style={{ objectFit: "contain" }}
              />
            </div>
            <div
              className="d-flex flex-column justify-content-center m-4"
              style={{ width: "650px" }}
            >
              <div className="subheader">Event 1</div>
              <div className="date">12 juli 2024</div>
              <div>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam
                porttitor risus purus. Maecenas vulputate lorem quam, ac dapibus
                lectus tristique nec. Vestibulum quis neque in augue rhoncus
                congue. Orci varius natoque penatibus et magnis dis parturient
                montes, nascetur ridiculus mus. Lorem ipsum dolor sit amet,
                consectetur adipiscing elit. Nullam porttitor risus purus.
                Maecenas vulputate lorem quam, ac dapibus lectus tristique nec.
                Vestibulum quis neque in augue rhoncus congue. Orci varius
                natoque penatibus et magnis dis parturient montes, nascetur
                ridiculus mus.
              </div>
              <div className="btn-yellow">More info</div>
            </div>
          </div>
          <div className="d-flex flex-row">
            <div
              className="d-flex flex-column justify-content-center m-4"
              style={{ width: "650px" }}
            >
              <div className="subheader">Event 1</div>
              <div className="date">12 juli 2024</div>
              <div>
                Lorem ipsum dolor sit amet, consectetur adipiscing elit. Nullam
                porttitor risus purus. Maecenas vulputate lorem quam, ac dapibus
                lectus tristique nec. Vestibulum quis neque in augue rhoncus
                congue. Orci varius natoque penatibus et magnis dis parturient
                montes, nascetur ridiculus mus. Lorem ipsum dolor sit amet,
                consectetur adipiscing elit. Nullam porttitor risus purus.
                Maecenas vulputate lorem quam, ac dapibus lectus tristique nec.
                Vestibulum quis neque in augue rhoncus congue. Orci varius
                natoque penatibus et magnis dis parturient montes, nascetur
                ridiculus mus.
              </div>
              <div className="btn-yellow">More info</div>
            </div>
            <div className="m-4">
              <Image
                src="/end-of-the-line.PNG"
                alt="event"
                width={650}
                height={300}
                style={{ objectFit: "contain" }}
              />
            </div>
          </div>
          <div className={styles.event_left}></div>
        </div>
      </div>
    </main>
  );
}
