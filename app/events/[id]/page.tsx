"use client";

// Import necessary modules
import { Event } from "@/types";
import { GetStaticProps, GetStaticPaths } from "next";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";

// Define the page component
const EventPage = () => {
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
      <h1>{data.title}</h1>
      <p>{data.description}</p>
    </div>
  );
};

export default EventPage;
