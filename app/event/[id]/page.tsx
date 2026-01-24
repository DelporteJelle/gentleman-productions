"use client";

// Import necessary modules
import { DbObjectType, Event } from "@/types";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { Group, Image, px, Stack } from "@mantine/core";
import { useRouter } from "next/navigation";
import Masonry, { ResponsiveMasonry } from "react-responsive-masonry";
import { usePosts } from "@/app/contexts/PostsContext";
import CanvasBackground from "@/components/Background/CanvasBackground";

// Define the page component
const EventPage = () => {
  const router = useRouter();
  const { id } = useParams();
  const { fetchPostById, loading, error } = usePosts();
  const [event, setEvent] = useState<Event | null>(null);

  useEffect(() => {
    const fetchPost = async () => {
      const fetchedPost = await fetchPostById(id as string);
      setEvent(fetchedPost as Event);
    };

    fetchPost();
  }, [id, fetchPostById, router]);

  if (loading) return <p>Loading...</p>;
  if (error) return <p>Error: {error}</p>;
  if (!event) return <p>Post not found</p>;

  return (
    <div>
      <div
        style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100%",
          height: "100%",
          zIndex: -1,
        }}
      >
        <CanvasBackground />
      </div>
      <ResponsiveMasonry
        columnsCountBreakPoints={{ 450: 1, 900: 2, 1350: 3, 1800: 4 }}
      >
        <Masonry>
          <Stack
            bg="var(--gray-800)"
            style={{ borderRadius: "10px", color: "white", width: "100%" }}
            p={20}
          >
            <h2>
              {event.title}{" "}
              <div
                style={{
                  height: "3px",
                  width: "60%",
                  backgroundColor: "var(--red-2)",
                }}
              />
            </h2>
            <div className="date">
              {event.dates.map((date: any, index: number) => (
                <span key={index}>
                  {new Date(date.start_time).toLocaleDateString("nl-BE", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })}
                  {index === 0 && event.dates.length > 1 ? " - " : ""}
                </span>
              ))}
            </div>
            <div style={{ whiteSpace: "pre-wrap" }}>{event.description}</div>
            {new Date(event.dates[0].start_time) > new Date() && (
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
          {event.images?.map((image) => (
            <div key={image}>
              <Image
                key={image}
                src={image}
                alt={event.title}
                style={{ objectFit: "contain", cursor: "pointer" }}
                width={"100%"}
                height={"100%"}
                radius="10px"
                onError={(e) => {
                  // Remove the parent <div> if the image fails to load
                  const parent = (e.target as HTMLImageElement).parentElement;
                  if (parent) {
                    parent.style.display = "none";
                  }
                }}
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
                  img.src = image;
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
            </div>
          ))}
        </Masonry>
      </ResponsiveMasonry>{" "}
    </div>
  );
};

export default EventPage;
