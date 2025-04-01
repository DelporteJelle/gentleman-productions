"use client";

// Import necessary modules
import { Event } from "@/types";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Carousel } from "@mantine/carousel";
import { Group, Image, px, Stack } from "@mantine/core";
import { useRouter } from "next/navigation";
import Masonry, { ResponsiveMasonry } from "react-responsive-masonry";

// Define the page component
const EventPage = () => {
  const router = useRouter();
  const { id } = useParams();
  const [data, setData] = useState<Event | undefined>(undefined);

  useEffect(() => {
    if (id) {
      fetch(`/api/events/${id}`)
        .then((response) => response.json())
        .then((data) => setData(data))
        .catch((error) => console.error("Error fetching data:", error));
    }
  }, [id]);

  if (!data) {
    return <div>Loading...</div>;
  }

  return (
    <div>
      <ResponsiveMasonry
        columnsCountBreakPoints={{ 450: 1, 900: 2, 1350: 3, 1800: 4 }}
      >
        <Masonry>
          <Stack
            bg="var(--gray-800)"
            style={{ borderRadius: "10px", color: "white" }}
            p={20}
          >
            <h2>
              {data.title}{" "}
              <div
                style={{
                  height: "3px",
                  width: "60%",
                  backgroundColor: "var(--red-2)",
                }}
              />
            </h2>
            <div className="date">
              {data.dates.map((date: any, index: number) => (
                <span key={index}>
                  {new Date(date.start).toLocaleDateString("nl-BE", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  {index === 0 && data.dates.length > 1 ? " - " : ""}
                </span>
              ))}
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{data.description}</div>
            {new Date(data.dates[0].start) > new Date() && (
              <button
                className="btn-red"
                onClick={() => {
                  router.push("/event/" + id + "/ticket");
                }}
              >
                More info
              </button>
            )}{" "}
          </Stack>
          {data.images?.map((image) => (
            <Image
              key={image}
              src={`/api/images/${image}`}
              alt={data.title}
              style={{ objectFit: "contain", cursor: "pointer" }}
              width={"100%"}
              height={"100%"}
              radius="10px"
              onClick={() => {
                const overlay = document.createElement("div");
                overlay.style.cssText = `
                  position: fixed;
                  top: 0;
                  left: 0;
                  width: 100%;
                  height: 100%;
                  background: rgba(0,0,0,0.9);
                  display: flex;
                  justify-content: center;
                  align-items: center;
                  z-index: 1000;
                  cursor: pointer;
                `;

                const img = document.createElement("img");
                img.src = `/api/images/${image}`;
                img.style.cssText = `
                  max-width: 90%;
                  max-height: 90%;
                  object-fit: contain;
                `;

                overlay.appendChild(img);
                overlay.onclick = () => document.body.removeChild(overlay);
                document.body.appendChild(overlay);
              }}
            />
          ))}
        </Masonry>
      </ResponsiveMasonry>{" "}
    </div>
  );
};

export default EventPage;
